import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  rm: mockRm,
}));

const createCaller = createCallerFactory(appRouter);
const store = {} as unknown as Store;

function mockFiles(files: Record<string, string>) {
  mockReadFile.mockImplementation((path: string) => {
    if (path in files) return Promise.resolve(files[path]);
    return Promise.reject(new Error(`ENOENT: no such file: ${path}`));
  });
}

function mockSudoSuccess(stdout = "") {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
    cb(null, { stdout, stderr: "" });
  });
}

function mockSudoFailure(errorOutput: string) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
    const err = new Error("Script failed") as Error & {
      stdout: string;
      stderr: string;
    };
    err.stdout = errorOutput;
    err.stderr = "";
    cb(err);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
});

describe("admin.ota.status", () => {
  it("returns correct status when all files exist", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({
        status: "idle",
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: "success",
      }),
      "/data/ota/boot-slot": "A",
      "/etc/kioskkit/version": "1.0.0",
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result).toEqual({
      status: "idle",
      activeSlot: "A",
      committedSlot: "A",
      currentVersion: "1.0.0",
      download: null,
      lastUpdate: "2026-03-01T00:00:00Z",
      lastResult: "success",
    });
  });

  it("returns defaults for fresh device (no files)", async () => {
    mockFiles({});

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result).toEqual({
      status: "idle",
      activeSlot: "A",
      committedSlot: "A",
      currentVersion: null,
      download: null,
      lastUpdate: null,
      lastResult: null,
    });
  });

  it("returns slot B when boot-slot file says B", async () => {
    mockFiles({
      "/data/ota/boot-slot": "B",
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result.activeSlot).toBe("B");
    expect(result.committedSlot).toBe("B");
  });

  it("includes download progress when downloading", async () => {
    const progress = {
      version: "2.0.0",
      progress: 45,
      bytesDownloaded: 450000,
      bytesTotal: 1000000,
    };
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "downloading" }),
      "/data/ota/boot-slot": "A",
      "/etc/kioskkit/version": "1.0.0",
      "/data/ota/pending/progress.json": JSON.stringify(progress),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result.status).toBe("downloading");
    expect(result.download).toEqual(progress);
  });
});

describe("admin.ota.download", () => {
  const validInput = {
    url: "https://example.com/image.zst",
    version: "2.0.0",
    sha256: "a".repeat(64),
  };

  it("starts download and updates state", async () => {
    mockFiles({});
    mockSpawn.mockReturnValue({
      pid: 12345,
      unref: vi.fn(),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.download"](validInput);

    expect(result).toEqual({ ok: true });
    expect(mockSpawn).toHaveBeenCalledWith(
      "sudo",
      [
        "/opt/kioskkit/system/ota-download.sh",
        validInput.url,
        validInput.sha256,
        "/data/ota/pending",
      ],
      { detached: true, stdio: "ignore" },
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/data/ota/state.json",
      expect.stringContaining('"downloading"'),
    );
  });

  it("rejects if already downloading", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "downloading" }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.download"](validInput)).rejects.toThrow(
      "A download is already in progress",
    );
  });

  it("rejects invalid sha256", async () => {
    const caller = createCaller({ store });

    await expect(
      caller["admin.ota.download"]({
        ...validInput,
        sha256: "invalid",
      }),
    ).rejects.toThrow();
  });
});

describe("admin.ota.install", () => {
  it("rejects if no downloaded image", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "idle" }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.install"]()).rejects.toThrow(
      "No downloaded image available for installation",
    );
  });

  it("rejects if already installing", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "installing" }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.install"]()).rejects.toThrow(
      "Installation is already in progress",
    );
  });

  it("calls install script when image is downloaded", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "downloaded" }),
    });
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.ota.install"]();

    expect(result).toEqual({ ok: true });
    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/ota-install.sh", "/data/ota/pending/rootfs.img.zst"],
      expect.any(Function),
    );
  });
});

describe("admin.ota.cancelDownload", () => {
  it("rejects if not downloading", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "idle" }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.cancelDownload"]()).rejects.toThrow(
      "No download in progress to cancel",
    );
  });

  it("cancels download, cleans up, and resets state", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({
        status: "downloading",
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: "success",
      }),
      "/data/ota/pending/download.pid": "12345",
    });
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.ota.cancelDownload"]();

    expect(result).toEqual({ ok: true });
    expect(mockExecFile).toHaveBeenCalledWith("sudo", ["kill", "12345"], expect.any(Function));
    expect(mockRm).toHaveBeenCalledWith("/data/ota/pending", {
      recursive: true,
      force: true,
    });
  });
});

describe("admin.ota.rollback", () => {
  it("calls rollback script from any state", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: "confirming" }),
    });
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.ota.rollback"]();

    expect(result).toEqual({ ok: true });
    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/ota-rollback.sh"],
      expect.any(Function),
    );
  });

  it("works when no state file exists", async () => {
    mockFiles({});
    mockSudoSuccess();

    const caller = createCaller({ store });
    const result = await caller["admin.ota.rollback"]();

    expect(result).toEqual({ ok: true });
  });

  it("throws on script failure", async () => {
    mockFiles({});
    mockSudoFailure(JSON.stringify({ error: "Rollback failed" }));

    const caller = createCaller({ store });

    await expect(caller["admin.ota.rollback"]()).rejects.toThrow("Rollback failed");
  });
});
