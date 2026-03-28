import { AppUpdateResult, AppUpdateStep } from "@kioskkit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockExecFile = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());
const mockAccess = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  rm: mockRm,
  access: mockAccess,
}));

const createCaller = createCallerFactory(appRouter);
const store = {} as unknown as Store;

function mockFiles(files: Record<string, string>) {
  mockReadFile.mockImplementation((path: string) => {
    if (path in files) return Promise.resolve(files[path]);
    return Promise.reject(new Error(`ENOENT: no such file: ${path}`));
  });
}

function mockRollbackExists(exists: boolean) {
  mockAccess.mockImplementation((path: string) => {
    if (path === "/opt/kioskkit/.rollback") {
      return exists ? Promise.resolve() : Promise.reject(new Error("ENOENT"));
    }
    return Promise.reject(new Error("ENOENT"));
  });
}

function mockSudoSuccess(stdout = "") {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      cb: (err: unknown, result: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, { stdout, stderr: "" });
    },
  );
}

function mockSudoFailure(errorOutput: string) {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      cb: (err: unknown, result?: { stdout: string; stderr: string }) => void,
    ) => {
      const err = new Error("Script failed") as Error & {
        stdout: string;
        stderr: string;
      };
      err.stdout = errorOutput;
      err.stderr = "";
      cb(err);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
  mockRollbackExists(false);
});

describe("admin.appUpdate.status", () => {
  it("returns correct status when all files exist", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({
        status: AppUpdateStep.Idle,
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: AppUpdateResult.Success,
      }),
      "/etc/kioskkit/app-version": "1.0.0",
    });
    mockRollbackExists(true);

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result).toEqual({
      status: AppUpdateStep.Idle,
      currentVersion: "1.0.0",
      upload: null,
      lastUpdate: "2026-03-01T00:00:00Z",
      lastResult: AppUpdateResult.Success,
      rollbackAvailable: true,
    });
  });

  it("returns defaults for fresh device (no files)", async () => {
    mockFiles({});

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result).toEqual({
      status: AppUpdateStep.Idle,
      currentVersion: null,
      upload: null,
      lastUpdate: null,
      lastResult: null,
      rollbackAvailable: false,
    });
  });

  it("falls back to package.json version when app-version file missing", async () => {
    mockFiles({
      "/opt/kioskkit/package.json": JSON.stringify({ version: "0.5.0" }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result.currentVersion).toBe("0.5.0");
  });

  it("handles corrupt state.json gracefully", async () => {
    mockFiles({
      "/data/app-update/state.json": "not valid json{{{",
    });

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result.status).toBe(AppUpdateStep.Idle);
  });

  it("includes upload progress when uploading", async () => {
    const progress = {
      version: "2.0.0",
      progress: 45,
      bytesReceived: 450000,
      bytesTotal: 1000000,
    };
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Uploading }),
      "/etc/kioskkit/app-version": "1.0.0",
      "/data/app-update/pending/progress.json": JSON.stringify(progress),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result.status).toBe(AppUpdateStep.Uploading);
    expect(result.upload).toEqual(progress);
  });
});

describe("admin.appUpdate.install", () => {
  it("rejects if no downloaded bundle", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.install"]()).rejects.toThrow(
      "No downloaded bundle available for installation",
    );
  });

  it("rejects if already installing", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Installing }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.install"]()).rejects.toThrow(
      "Installation is already in progress",
    );
  });

  it("rejects if rolling back", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.RollingBack }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.install"]()).rejects.toThrow(
      "Installation is already in progress",
    );
  });

  it("calls install script when bundle is downloaded", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Downloaded }),
    });
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.install"]();

    expect(result).toEqual({ ok: true });
    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/app-update.sh", "/data/app-update/pending/app-bundle.tar.gz"],
      expect.any(Function),
    );
  });

  it("throws on install script failure", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Downloaded }),
    });
    mockSudoFailure(JSON.stringify({ error: "Health check failed" }));

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.install"]()).rejects.toThrow("Health check failed");
  });
});

describe("admin.appUpdate.cancelUpload", () => {
  it("rejects if not uploading", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.cancelUpload"]()).rejects.toThrow(
      "No upload in progress to cancel",
    );
  });

  it("cleans up and resets state", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({
        status: AppUpdateStep.Uploading,
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: AppUpdateResult.Success,
      }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.cancelUpload"]();

    expect(result).toEqual({ ok: true });
    expect(mockRm).toHaveBeenCalledWith("/data/app-update/pending", {
      recursive: true,
      force: true,
    });
  });
});

describe("admin.appUpdate.rollback", () => {
  it("calls rollback script when rollback dir exists", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });
    mockRollbackExists(true);
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.rollback"]();

    expect(result).toEqual({ ok: true });
    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/app-rollback.sh"],
      expect.any(Function),
    );
  });

  it("rejects when no rollback available", async () => {
    mockFiles({});
    mockRollbackExists(false);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow("No rollback available");
  });

  it("rejects during active install", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Installing }),
    });
    mockRollbackExists(true);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow(
      "Cannot rollback while an install or rollback is in progress",
    );
  });

  it("rejects during active rollback", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.RollingBack }),
    });
    mockRollbackExists(true);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow(
      "Cannot rollback while an install or rollback is in progress",
    );
  });

  it("throws on script failure", async () => {
    mockFiles({});
    mockRollbackExists(true);
    mockSudoFailure(JSON.stringify({ error: "Rollback failed" }));

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow("Rollback failed");
  });
});
