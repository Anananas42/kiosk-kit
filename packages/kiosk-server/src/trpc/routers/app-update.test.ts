import { AppUpdateResult, AppUpdateStep } from "@kioskkit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockSpawnScript = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());
const mockAccess = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  rm: mockRm,
  readdir: mockReaddir,
  access: mockAccess,
  rename: mockRename,
}));

vi.mock("../../lib/app-update-helpers.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, spawnDetachedSudoScript: mockSpawnScript };
});

const createCaller = createCallerFactory(appRouter);
const store = {} as unknown as Store;

function mockFiles(files: Record<string, string>) {
  mockReadFile.mockImplementation((path: string) => {
    if (path in files) return Promise.resolve(files[path]);
    return Promise.reject(new Error(`ENOENT: no such file: ${path}`));
  });
}

function mockReleaseCount(count: number) {
  mockReaddir.mockImplementation((path: string) => {
    if (path === "/opt/kioskkit/releases") {
      const entries = Array.from({ length: count }, (_, i) => String(1711612800 + i));
      return Promise.resolve(entries);
    }
    return Promise.reject(new Error("ENOENT"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
  mockAccess.mockRejectedValue(new Error("ENOENT"));
  mockReleaseCount(0);
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
    mockReleaseCount(2);

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
      "/opt/kioskkit/current/package.json": JSON.stringify({ version: "0.5.0" }),
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

  it("rollback not available with single release", async () => {
    mockFiles({});
    mockReleaseCount(1);

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result.rollbackAvailable).toBe(false);
  });

  it("rollback available with two releases", async () => {
    mockFiles({});
    mockReleaseCount(2);

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.status"]();

    expect(result.rollbackAvailable).toBe(true);
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

  it("spawns install script detached when bundle is downloaded", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Downloaded }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.install"]();

    expect(result).toEqual({ ok: true });
    expect(mockSpawnScript).toHaveBeenCalledWith("app-update.sh", [
      "/data/app-update/pending/app-bundle.tar.gz",
    ]);
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
  it("spawns rollback script detached when previous release exists", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });
    mockReleaseCount(2);

    const caller = createCaller({ store });
    const result = await caller["admin.appUpdate.rollback"]();

    expect(result).toEqual({ ok: true });
    expect(mockSpawnScript).toHaveBeenCalledWith("app-rollback.sh");
  });

  it("rejects when no previous release available", async () => {
    mockFiles({});
    mockReleaseCount(1);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow("No rollback available");
  });

  it("rejects during active install", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Installing }),
    });
    mockReleaseCount(2);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow(
      "Cannot rollback while an install or rollback is in progress",
    );
  });

  it("rejects during active rollback", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.RollingBack }),
    });
    mockReleaseCount(2);

    const caller = createCaller({ store });

    await expect(caller["admin.appUpdate.rollback"]()).rejects.toThrow(
      "Cannot rollback while an install or rollback is in progress",
    );
  });
});
