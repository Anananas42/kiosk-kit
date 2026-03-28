import { OtaResult, OtaStep } from "@kioskkit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockRunPrivileged = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());

vi.mock("../../privileged.js", () => ({
  runPrivileged: mockRunPrivileged,
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
        status: OtaStep.Idle,
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: OtaResult.Success,
      }),
      "/data/ota/boot-slot": "A",
      "/etc/kioskkit/version": "1.0.0",
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result).toEqual({
      status: OtaStep.Idle,
      activeSlot: "A",
      committedSlot: "A",
      currentVersion: "1.0.0",
      upload: null,
      lastUpdate: "2026-03-01T00:00:00Z",
      lastResult: OtaResult.Success,
    });
  });

  it("returns defaults for fresh device (no files)", async () => {
    mockFiles({});

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result).toEqual({
      status: OtaStep.Idle,
      activeSlot: "A",
      committedSlot: "A",
      currentVersion: null,
      upload: null,
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

  it("includes upload progress when uploading", async () => {
    const progress = {
      version: "2.0.0",
      progress: 45,
      bytesReceived: 450000,
      bytesTotal: 1000000,
    };
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Uploading }),
      "/data/ota/boot-slot": "A",
      "/etc/kioskkit/version": "1.0.0",
      "/data/ota/pending/progress.json": JSON.stringify(progress),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.status"]();

    expect(result.status).toBe(OtaStep.Uploading);
    expect(result.upload).toEqual(progress);
  });
});

describe("admin.ota.install", () => {
  it("rejects if no downloaded image", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Idle }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.install"]()).rejects.toThrow(
      "No downloaded image available for installation",
    );
  });

  it("rejects if already installing", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Installing }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.install"]()).rejects.toThrow(
      "Installation is already in progress",
    );
  });

  it("calls install via privileged helper when image is downloaded", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Downloaded }),
    });
    mockRunPrivileged.mockResolvedValue("");

    const caller = createCaller({ store });
    const result = await caller["admin.ota.install"]();

    expect(result).toEqual({ ok: true });
    expect(mockRunPrivileged).toHaveBeenCalledWith("ota-install", [
      "/data/ota/pending/rootfs.img.zst",
    ]);
  });
});

describe("admin.ota.cancelUpload", () => {
  it("rejects if not uploading", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Idle }),
    });

    const caller = createCaller({ store });

    await expect(caller["admin.ota.cancelUpload"]()).rejects.toThrow(
      "No upload in progress to cancel",
    );
  });

  it("cleans up and resets state", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({
        status: OtaStep.Uploading,
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: OtaResult.Success,
      }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.ota.cancelUpload"]();

    expect(result).toEqual({ ok: true });
    expect(mockRm).toHaveBeenCalledWith("/data/ota/pending", {
      recursive: true,
      force: true,
    });
  });
});

describe("admin.ota.rollback", () => {
  it("calls rollback via privileged helper", async () => {
    mockFiles({
      "/data/ota/state.json": JSON.stringify({ status: OtaStep.Confirming }),
    });
    mockRunPrivileged.mockResolvedValue("");

    const caller = createCaller({ store });
    const result = await caller["admin.ota.rollback"]();

    expect(result).toEqual({ ok: true });
    expect(mockRunPrivileged).toHaveBeenCalledWith("ota-rollback");
  });

  it("works when no state file exists", async () => {
    mockFiles({});
    mockRunPrivileged.mockResolvedValue("");

    const caller = createCaller({ store });
    const result = await caller["admin.ota.rollback"]();

    expect(result).toEqual({ ok: true });
  });

  it("throws on script failure", async () => {
    mockFiles({});
    mockRunPrivileged.mockRejectedValue(new Error("Rollback failed"));

    const caller = createCaller({ store });

    await expect(caller["admin.ota.rollback"]()).rejects.toThrow("Rollback failed");
  });
});
