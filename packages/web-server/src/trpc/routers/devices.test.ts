import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import type { TrpcContext } from "../context.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

type User = typeof users.$inferSelect;

const createCaller = createCallerFactory(appRouter);

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
    where: vi.fn().mockReturnValue(terminal),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
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
  userId: "user-1",
  name: "Kiosk",
  tailscaleIp: "100.64.1.5",
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

describe("devices procedures", () => {
  describe("devices.list", () => {
    it("returns devices for admin with tailscaleIp", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.list"]();
      expect(result).toHaveLength(1);
      expect(result[0].tailscaleIp).toBe("100.64.1.5");
    });

    it("omits tailscaleIp for customers", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["devices.list"]();
      expect(result[0].tailscaleIp).toBeUndefined();
    });

    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = callerFor(null, createMockDb());
      await expect(caller["devices.list"]()).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.get", () => {
    it("returns device for admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.get"]({ id: deviceRow.id });
      expect(result.name).toBe("Kiosk");
      expect(result.tailscaleIp).toBe("100.64.1.5");
    });

    it("omits tailscaleIp for customers", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["devices.get"]({ id: deviceRow.id });
      expect(result.tailscaleIp).toBeUndefined();
    });

    it("throws NOT_FOUND when device missing", async () => {
      const caller = callerFor(adminUser, createMockDb([]));
      await expect(
        caller["devices.get"]({ id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("devices.create", () => {
    it("creates device as admin", async () => {
      const caller = callerFor(adminUser, createMockDb([deviceRow]));
      const result = await caller["devices.create"]({
        name: "Kiosk",
        tailscaleIp: "100.64.1.5",
        userId: "user-1",
      });
      expect(result.name).toBe("Kiosk");
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["devices.create"]({
          name: "Kiosk",
          tailscaleIp: "100.64.1.5",
          userId: "user-1",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("validates IP address", async () => {
      const caller = callerFor(adminUser, createMockDb());
      await expect(
        caller["devices.create"]({
          name: "Kiosk",
          tailscaleIp: "not-an-ip",
          userId: "user-1",
        }),
      ).rejects.toThrow();
    });

    it("rejects IP with octets > 255", async () => {
      const caller = callerFor(adminUser, createMockDb());
      await expect(
        caller["devices.create"]({
          name: "Kiosk",
          tailscaleIp: "999.999.999.999",
          userId: "user-1",
        }),
      ).rejects.toThrow();
    });

    it("validates name is required", async () => {
      const caller = callerFor(adminUser, createMockDb());
      await expect(
        caller["devices.create"]({
          name: "",
          tailscaleIp: "100.64.1.5",
          userId: "user-1",
        }),
      ).rejects.toThrow();
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
});
