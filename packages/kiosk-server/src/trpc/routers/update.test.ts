import { AppUpdateResult, AppUpdateStep, UpdateStep } from "@kioskkit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockRunPrivileged = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());
const mockAccess = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());

vi.mock("../../privileged.js", () => ({
  runPrivileged: mockRunPrivileged,
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
  mockRunPrivileged.mockResolvedValue("");
  mockReleaseCount(0);
});

describe("admin.update.status", () => {
  it("returns unified status from version file and app-update state", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({
        status: AppUpdateStep.Idle,
        lastUpdate: "2026-03-01T00:00:00Z",
        lastResult: AppUpdateResult.Success,
      }),
      "/etc/kioskkit/version": "2.0.0",
    });
    mockReleaseCount(2);

    const caller = createCaller({ store });
    const result = await caller["admin.update.status"]();

    expect(result).toEqual({
      currentVersion: "2.0.0",
      status: UpdateStep.Idle,
      upload: null,
      lastResult: "success",
      rollbackAvailable: true,
    });
  });

  it("returns defaults for fresh device", async () => {
    mockFiles({});

    const caller = createCaller({ store });
    const result = await caller["admin.update.status"]();

    expect(result).toEqual({
      currentVersion: null,
      status: UpdateStep.Idle,
      upload: null,
      lastResult: null,
      rollbackAvailable: false,
    });
  });

  it("includes upload progress when uploading", async () => {
    const progress = {
      version: "3.0.0",
      progress: 60,
      bytesReceived: 600000,
      bytesTotal: 1000000,
    };
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Uploading }),
      "/etc/kioskkit/version": "2.0.0",
      "/data/app-update/pending/progress.json": JSON.stringify(progress),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.update.status"]();

    expect(result.status).toBe(UpdateStep.Uploading);
    expect(result.upload).toEqual(progress);
  });
});

describe("admin.update.install", () => {
  it("delegates to app-update install", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Downloaded }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.update.install"]();

    expect(result).toEqual({ ok: true });
    expect(mockRunPrivileged).toHaveBeenCalledWith("app-update", [
      "/data/app-update/pending/app-bundle.tar.gz",
    ]);
  });

  it("rejects if no downloaded bundle", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });

    const caller = createCaller({ store });
    await expect(caller["admin.update.install"]()).rejects.toThrow(
      "No downloaded bundle available for installation",
    );
  });
});

describe("admin.update.cancel", () => {
  it("delegates to app-update cancel", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({
        status: AppUpdateStep.Uploading,
        lastUpdate: "2026-03-01T00:00:00Z",
      }),
    });

    const caller = createCaller({ store });
    const result = await caller["admin.update.cancel"]();

    expect(result).toEqual({ ok: true });
    expect(mockRm).toHaveBeenCalledWith("/data/app-update/pending", {
      recursive: true,
      force: true,
    });
  });

  it("rejects if not uploading", async () => {
    mockFiles({
      "/data/app-update/state.json": JSON.stringify({ status: AppUpdateStep.Idle }),
    });

    const caller = createCaller({ store });
    await expect(caller["admin.update.cancel"]()).rejects.toThrow(
      "No upload in progress to cancel",
    );
  });
});
