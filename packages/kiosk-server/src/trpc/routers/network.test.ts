import { describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockExecFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

const createCaller = createCallerFactory(appRouter);
const store = {} as unknown as Store;

function mockScript(stdout: string) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
    cb(null, { stdout, stderr: "" });
  });
}

function mockScriptFailure(errorJson: string) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
    const err = new Error("Script failed") as Error & { stdout: string; stderr: string };
    err.stdout = errorJson;
    err.stderr = "";
    cb(err);
  });
}

function mockEnoent() {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    cb(err);
  });
}

describe("admin.network.list", () => {
  it("returns merged WiFi status from scripts", async () => {
    const scanResult = JSON.stringify([
      { ssid: "Home", signal: -45, security: "wpa" },
      { ssid: "Guest", signal: -70, security: "open" },
    ]);
    const statusResult = JSON.stringify({
      current: { ssid: "Home", signal: -45 },
      ethernet: true,
      saved: [{ ssid: "Home" }, { ssid: "OldNetwork" }],
    });

    mockExecFile.mockImplementation((cmd: string, _args: string[], cb: Function) => {
      if (cmd.includes("wifi-scan")) {
        cb(null, { stdout: scanResult, stderr: "" });
      } else {
        cb(null, { stdout: statusResult, stderr: "" });
      }
    });

    const caller = createCaller({ store });
    const result = await caller["admin.network.list"]();

    expect(result.current).toEqual({ ssid: "Home", signal: -45 });
    expect(result.ethernet).toBe(true);
    expect(result.saved).toEqual([
      { ssid: "Home", inRange: true, signal: -45 },
      { ssid: "OldNetwork", inRange: false },
    ]);
    expect(result.available).toEqual([{ ssid: "Guest", signal: -70, security: "open" }]);
  });

  it("returns mock data when scripts are missing (dev mode)", async () => {
    mockEnoent();
    const caller = createCaller({ store });
    const result = await caller["admin.network.list"]();

    expect(result.current).toEqual({ ssid: "HomeNetwork", signal: -45 });
    expect(result.available.length).toBeGreaterThanOrEqual(2);
    expect(result.saved.length).toBeGreaterThanOrEqual(1);
  });
});

describe("admin.network.connect", () => {
  it("connects to a network with password", async () => {
    mockScript(JSON.stringify({ ok: true }));
    const caller = createCaller({ store });

    const result = await caller["admin.network.connect"]({
      ssid: "MyNetwork",
      password: "secret123",
    });
    expect(result).toEqual({ ok: true });

    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/wifi-connect.sh", "MyNetwork", "secret123"],
      expect.any(Function),
    );
  });

  it("connects to an open network without password", async () => {
    mockScript(JSON.stringify({ ok: true }));
    const caller = createCaller({ store });

    await caller["admin.network.connect"]({ ssid: "OpenNet" });

    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/wifi-connect.sh", "OpenNet"],
      expect.any(Function),
    );
  });

  it("throws tRPC error on script failure", async () => {
    mockScriptFailure(JSON.stringify({ error: "Wrong password" }));
    const caller = createCaller({ store });

    await expect(
      caller["admin.network.connect"]({ ssid: "Locked", password: "bad" }),
    ).rejects.toThrow("Wrong password");
  });

  it("returns ok when scripts missing (dev mode)", async () => {
    mockEnoent();
    const caller = createCaller({ store });

    const result = await caller["admin.network.connect"]({ ssid: "DevNet" });
    expect(result).toEqual({ ok: true });
  });
});

describe("admin.network.forget", () => {
  it("forgets a saved network", async () => {
    mockScript(JSON.stringify({ ok: true }));
    const caller = createCaller({ store });

    const result = await caller["admin.network.forget"]({ ssid: "OldNetwork" });
    expect(result).toEqual({ ok: true });

    expect(mockExecFile).toHaveBeenCalledWith(
      "sudo",
      ["/opt/kioskkit/system/wifi-forget.sh", "OldNetwork"],
      expect.any(Function),
    );
  });

  it("throws tRPC error on script failure", async () => {
    mockScriptFailure(JSON.stringify({ error: "Network not found" }));
    const caller = createCaller({ store });

    await expect(caller["admin.network.forget"]({ ssid: "Unknown" })).rejects.toThrow(
      "Network not found",
    );
  });

  it("returns ok when scripts missing (dev mode)", async () => {
    mockEnoent();
    const caller = createCaller({ store });

    const result = await caller["admin.network.forget"]({ ssid: "DevNet" });
    expect(result).toEqual({ ok: true });
  });
});
