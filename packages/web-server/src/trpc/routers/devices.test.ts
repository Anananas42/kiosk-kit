import { DeviceStatus } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import type { TrpcContext } from "../context.js";
import { adminRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

vi.mock("../../services/tailscale.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/tailscale.js")>();
  return { ...original, getCachedDevice: vi.fn() };
});

import { getCachedDevice } from "../../services/tailscale.js";

const mockGetCachedDevice = vi.mocked(getCachedDevice);

type User = typeof users.$inferSelect;

const createCaller = createCallerFactory(adminRouter);

const adminUser: User = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  googleId: "g-admin",
  role: "admin",
  stripeCustomerId: null,
  createdAt: new Date(),
};

const customerUser: User = {
  id: "user-1",
  email: "test@test.com",
  name: "Test",
  googleId: "g-1",
  role: "customer",
  stripeCustomerId: null,
  createdAt: new Date(),
};

function createMockDb(returnValue: unknown[] = []) {
  const terminal = Object.assign(Promise.resolve(returnValue), {
    returning: vi.fn().mockResolvedValue(returnValue),
  });
  // Make the chainable object thenable so `await db.select().from(table)` works
  const chainable = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
    where: vi.fn().mockReturnValue(terminal),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: mock db needs thenable for drizzle query chain
    then: (resolve: (v: unknown) => void) => Promise.resolve(returnValue).then(resolve),
  };
  return chainable as unknown as Db;
}

function callerFor(user: User | null, db: Db) {
  return createCaller({
    db,
    user,
    session: user ? { id: "s-1", userId: user.id, expiresAt: new Date() } : null,
  } as TrpcContext);
}

const deviceRow = {
  id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a",
  tailscaleNodeId: "node-123",
  tailscaleIp: "100.64.1.5",
  userId: "user-1",
  name: "Kiosk",
  hostname: "kiosk-1",
  pairingCode: null,
  backupIntervalHours: 2,
  maxRetainedBackups: 30,
  hashVerifyEnabled: true,
  lastSeen: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

describe("devices procedures", () => {
  describe("devices.list", () => {
    it("returns devices for customer from DB (plus local dev device)", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["devices.list"]();
      // 1 from DB + 1 local dev device (NODE_ENV=development in test)
      const dbDevice = result.find((d) => d.tailscaleNodeId === "node-123");
      expect(dbDevice).toBeDefined();
      expect(dbDevice!.tailscaleIp).toBeUndefined();
    });

    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = callerFor(null, createMockDb());
      await expect(caller["devices.list"]()).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.get", () => {
    it("returns device with tailscaleIp and hostname for admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.get"]({ id: deviceRow.id });
      expect(result.name).toBe("Kiosk");
      expect(result.hostname).toBe("kiosk-1");
      expect(result.tailscaleIp).toBe("100.64.1.5");
    });

    it("throws NOT_FOUND when device missing", async () => {
      const caller = callerFor(adminUser, createMockDb([]));
      await expect(
        caller["devices.get"]({ id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a" }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      await expect(caller["devices.get"]({ id: deviceRow.id })).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.update", () => {
    it("updates device name as admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.update"]({
        id: deviceRow.id,
        name: "New Name",
      });
      expect(result.name).toBe("Kiosk");
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["devices.update"]({ id: deviceRow.id, name: "New Name" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.assign", () => {
    it("assigns user to device as admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.assign"]({
        id: deviceRow.id,
        userId: "user-2",
      });
      expect(result.id).toBe(deviceRow.id);
    });

    it("unassigns user from device as admin", async () => {
      const caller = callerFor(adminUser, createMockDb([{ ...deviceRow, userId: null }]));
      const result = await caller["devices.assign"]({
        id: deviceRow.id,
        userId: null,
      });
      expect(result.userId).toBeNull();
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["devices.assign"]({ id: deviceRow.id, userId: "user-2" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.delete", () => {
    it("deletes device as admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.delete"]({ id: deviceRow.id });
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND when device missing", async () => {
      const caller = callerFor(adminUser, createMockDb([]));
      await expect(
        caller["devices.delete"]({ id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a" }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["devices.delete"]({ id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.status", () => {
    const tailscaleDevice = {
      nodeId: "node-123",
      name: "test",
      addresses: ["100.64.1.5"],
      online: true,
      lastSeen: new Date().toISOString(),
      hostname: "test-host",
    };

    it("returns online when tailscale online and health responds OK", async () => {
      mockGetCachedDevice.mockResolvedValue(tailscaleDevice);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.status"]({ id: deviceRow.id });
      expect(result.status).toBe(DeviceStatus.Online);

      vi.unstubAllGlobals();
    });

    it("returns app-not-connected when tailscale online but health fails", async () => {
      mockGetCachedDevice.mockResolvedValue(tailscaleDevice);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.status"]({ id: deviceRow.id });
      expect(result.status).toBe(DeviceStatus.AppNotConnected);

      vi.unstubAllGlobals();
    });

    it("returns offline when tailscale says offline", async () => {
      mockGetCachedDevice.mockResolvedValue({ ...tailscaleDevice, online: false });

      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.status"]({ id: deviceRow.id });
      expect(result.status).toBe(DeviceStatus.Offline);
    });

    it("returns offline when tailscale API fails", async () => {
      mockGetCachedDevice.mockRejectedValue(new Error("Tailscale unreachable"));

      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.status"]({ id: deviceRow.id });
      expect(result.status).toBe(DeviceStatus.Offline);
    });

    it("throws NOT_FOUND for non-owned device (customer)", async () => {
      const caller = callerFor(customerUser, createMockDb([]));
      await expect(
        caller["devices.status"]({ id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a" }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
