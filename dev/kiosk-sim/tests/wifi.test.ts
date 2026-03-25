import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetMockState, trpc, waitForHealthy } from "./setup.js";

describe("WiFi integration tests", () => {
  beforeAll(async () => {
    await waitForHealthy();
  });

  beforeEach(() => {
    resetMockState();
  });

  it("scan returns seeded mock networks", async () => {
    const status = await trpc["admin.network.list"].query();

    // All 3 seeded networks should appear as available (none saved yet)
    expect(status.available).toHaveLength(3);

    const ssids = status.available.map((n) => n.ssid).sort();
    expect(ssids).toEqual(["Guest", "Neighbor", "Office"]);

    // Check signal and security for a known network
    const office = status.available.find((n) => n.ssid === "Office");
    expect(office).toBeDefined();
    expect(office!.signal).toBe(-45);
    expect(office!.security).toBe("wpa");

    const guest = status.available.find((n) => n.ssid === "Guest");
    expect(guest).toBeDefined();
    expect(guest!.security).toBe("open");
  });

  it("connect to WPA network with password", async () => {
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });

    const status = await trpc["admin.network.list"].query();

    // Office should be current
    expect(status.current).not.toBeNull();
    expect(status.current!.ssid).toBe("Office");
    expect(status.current!.signal).toBe(-45);

    // Office should be in saved (and in range)
    const saved = status.saved.find((n) => n.ssid === "Office");
    expect(saved).toBeDefined();
    expect(saved!.inRange).toBe(true);

    // Office should NOT be in available (it's saved now)
    expect(status.available.find((n) => n.ssid === "Office")).toBeUndefined();
  });

  it("connect to open network without password", async () => {
    await trpc["admin.network.connect"].mutate({
      ssid: "Guest",
    });

    const status = await trpc["admin.network.list"].query();

    expect(status.current).not.toBeNull();
    expect(status.current!.ssid).toBe("Guest");
  });

  it("connect to second network — first stays saved, second becomes current", async () => {
    // Connect to Office first
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });

    // Connect to Guest second (higher priority)
    await trpc["admin.network.connect"].mutate({
      ssid: "Guest",
    });

    const status = await trpc["admin.network.list"].query();

    // Guest should be current (highest priority)
    expect(status.current).not.toBeNull();
    expect(status.current!.ssid).toBe("Guest");

    // Both should be saved
    const savedSsids = status.saved.map((n) => n.ssid).sort();
    expect(savedSsids).toEqual(["Guest", "Office"]);
  });

  it("reconnect to saved network with new password updates it", async () => {
    // Connect with first password
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });

    // Reconnect with new password
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "newpassword456",
    });

    const status = await trpc["admin.network.list"].query();

    // Still connected to Office
    expect(status.current).not.toBeNull();
    expect(status.current!.ssid).toBe("Office");

    // Only one saved entry for Office (not duplicated)
    const officeSaved = status.saved.filter((n) => n.ssid === "Office");
    expect(officeSaved).toHaveLength(1);
  });

  it("forget a non-connected saved network removes it", async () => {
    // Save two networks
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });
    await trpc["admin.network.connect"].mutate({
      ssid: "Guest",
    });

    // Guest is current (highest priority). Forget Office.
    await trpc["admin.network.forget"].mutate({ ssid: "Office" });

    const status = await trpc["admin.network.list"].query();

    // Office should not be in saved
    expect(status.saved.find((n) => n.ssid === "Office")).toBeUndefined();

    // Office should be back in available
    expect(status.available.find((n) => n.ssid === "Office")).toBeDefined();

    // Guest should still be current
    expect(status.current).not.toBeNull();
    expect(status.current!.ssid).toBe("Guest");
  });

  it("forget connected network disconnects", async () => {
    // Connect to only one network
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });

    // Forget it
    await trpc["admin.network.forget"].mutate({ ssid: "Office" });

    const status = await trpc["admin.network.list"].query();

    // Should be disconnected (no other saved network, or fallback)
    expect(status.current).toBeNull();
    expect(status.saved).toHaveLength(0);
  });

  it("ethernet status reflects MOCK_ETHERNET_CARRIER", async () => {
    const status = await trpc["admin.network.list"].query();

    // Default MOCK_ETHERNET_CARRIER=1
    expect(status.ethernet).toBe(true);
  });

  it("after reset, state returns to initial seed", async () => {
    // Connect to a network
    await trpc["admin.network.connect"].mutate({
      ssid: "Office",
      password: "password123",
    });

    // Verify connected
    let status = await trpc["admin.network.list"].query();
    expect(status.current).not.toBeNull();

    // Reset
    resetMockState();

    // Should be back to initial state
    status = await trpc["admin.network.list"].query();
    expect(status.current).toBeNull();
    expect(status.saved).toHaveLength(0);
    expect(status.available).toHaveLength(3);
  });
});
