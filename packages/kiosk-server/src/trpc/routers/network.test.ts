import { describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const mockExecFile = vi.hoisted(() => vi.fn());
const mockRunPrivileged = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("../../privileged.js", () => ({
  runPrivileged: mockRunPrivileged,
}));

const createCaller = createCallerFactory(appRouter);
const store = {} as unknown as Store;

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

    // execFile is used for isWifiEnabled (systemctl) and checkEthernet (cat)
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: unknown, result: { stdout: string; stderr: string }) => void,
      ) => {
        if (cmd === "systemctl") {
          cb(null, { stdout: "", stderr: "" });
        } else if (cmd === "cat") {
          cb(null, { stdout: "1", stderr: "" });
        } else {
          cb(new Error(`unexpected cmd: ${cmd}`), { stdout: "", stderr: "" });
        }
      },
    );

    // runPrivileged is used for wifi-scan and wifi-status
    mockRunPrivileged.mockImplementation((action: string) => {
      if (action === "wifi-scan") return Promise.resolve(scanResult);
      if (action === "wifi-status") return Promise.resolve(statusResult);
      return Promise.reject(new Error(`unexpected action: ${action}`));
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
});

describe("admin.network.connect", () => {
  it("connects to a network with password", async () => {
    mockRunPrivileged.mockResolvedValue("");
    const caller = createCaller({ store });

    const result = await caller["admin.network.connect"]({
      ssid: "MyNetwork",
      password: "secret123",
    });
    expect(result).toEqual({ ok: true });

    expect(mockRunPrivileged).toHaveBeenCalledWith("wifi-connect", ["MyNetwork", "secret123"]);
  });

  it("connects to an open network without password", async () => {
    mockRunPrivileged.mockResolvedValue("");
    const caller = createCaller({ store });

    await caller["admin.network.connect"]({ ssid: "OpenNet" });

    expect(mockRunPrivileged).toHaveBeenCalledWith("wifi-connect", ["OpenNet"]);
  });

  it("throws tRPC error on script failure", async () => {
    mockRunPrivileged.mockRejectedValue(new Error("Wrong password"));
    const caller = createCaller({ store });

    await expect(
      caller["admin.network.connect"]({ ssid: "Locked", password: "bad" }),
    ).rejects.toThrow("Wrong password");
  });
});

describe("admin.network.forget", () => {
  it("forgets a saved network", async () => {
    mockRunPrivileged.mockResolvedValue("");
    const caller = createCaller({ store });

    const result = await caller["admin.network.forget"]({ ssid: "OldNetwork" });
    expect(result).toEqual({ ok: true });

    expect(mockRunPrivileged).toHaveBeenCalledWith("wifi-forget", ["OldNetwork"]);
  });

  it("throws tRPC error on script failure", async () => {
    mockRunPrivileged.mockRejectedValue(new Error("Network not found"));
    const caller = createCaller({ store });

    await expect(caller["admin.network.forget"]({ ssid: "Unknown" })).rejects.toThrow(
      "Network not found",
    );
  });
});
