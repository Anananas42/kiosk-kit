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

const userRow = {
  id: "user-1",
  email: "test@test.com",
  name: "Test",
  googleId: "g-1",
  role: "customer" as const,
  stripeCustomerId: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

describe("users procedures", () => {
  describe("users.list", () => {
    it("returns users for admin", async () => {
      const caller = callerFor(adminUser, createMockDb([userRow]));
      const result = await caller["users.list"]();
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("test@test.com");
      expect(result[0].createdAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(caller["users.list"]()).rejects.toThrow(TRPCError);
    });

    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = callerFor(null, createMockDb());
      await expect(caller["users.list"]()).rejects.toThrow(TRPCError);
    });
  });

  describe("users.getOne", () => {
    it("returns user for admin", async () => {
      const caller = callerFor(adminUser, createMockDb([userRow]));
      const result = await caller["users.getOne"]({ id: "user-1" });
      expect(result.name).toBe("Test");
      expect(result.email).toBe("test@test.com");
    });

    it("throws NOT_FOUND when user missing", async () => {
      const caller = callerFor(adminUser, createMockDb([]));
      await expect(caller["users.getOne"]({ id: "nonexistent" })).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(caller["users.getOne"]({ id: "user-1" })).rejects.toThrow(TRPCError);
    });
  });
});
