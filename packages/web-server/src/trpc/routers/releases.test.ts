import { ReleaseType } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import type { TrpcContext } from "../context.js";
import { adminRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

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

const releaseRow = {
  id: "a0000000-0000-4000-a000-000000000001",
  version: "v1.0.0",
  releaseType: ReleaseType.Ota,
  otaAssetUrl: "https://github.com/org/repo/releases/download/v1.0.0/rootfs.img.zst",
  otaSha256: "abc123",
  appAssetUrl: null,
  appSha256: null,
  releaseNotes: "First release",
  isPublished: false,
  isArchived: false,
  publishedBy: "admin-1",
  publishedAt: new Date("2025-06-01T00:00:00Z"),
};

function createMockDb(returnValue: unknown[] = [], insertReturnValue?: unknown[]) {
  const insertResult = insertReturnValue ?? returnValue;
  const terminal = Object.assign(Promise.resolve(returnValue), {
    returning: vi.fn().mockResolvedValue(returnValue),
  });
  const chainable = Object.assign(Promise.resolve(returnValue), {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(terminal),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertResult),
  });
  return chainable as unknown as Db;
}

function callerFor(user: User | null, db: Db) {
  return createCaller({
    db,
    user,
    session: user ? { id: "s-1", userId: user.id, expiresAt: new Date() } : null,
  } as TrpcContext);
}

describe("releases procedures", () => {
  describe("releases.publish", () => {
    it("creates a release record", async () => {
      // select/where returns [] (no duplicate), insert/returning returns the new row
      const db = createMockDb([], [releaseRow]);
      const caller = callerFor(adminUser, db);
      const result = await caller["releases.publish"]({
        version: "v1.0.0",
        releaseType: ReleaseType.Ota,
        otaAssetUrl: "https://github.com/org/repo/releases/download/v1.0.0/rootfs.img.zst",
        otaSha256: "abc123",
        releaseNotes: "First release",
      });

      expect(result.version).toBe("v1.0.0");
      expect(result.releaseType).toBe("ota");
      expect(result.otaSha256).toBe("abc123");
      expect(result.publishedAt).toBeDefined();
    });

    it("rejects duplicate versions", async () => {
      const db = createMockDb([{ id: "existing" }]);
      const caller = callerFor(adminUser, db);

      await expect(
        caller["releases.publish"]({
          version: "v1.0.0",
          releaseType: ReleaseType.Ota,
          otaAssetUrl: "https://github.com/org/repo/releases/download/v1.0.0/rootfs.img.zst",
          otaSha256: "abc123",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["releases.publish"]({
          version: "v1.0.0",
          releaseType: ReleaseType.Ota,
          otaAssetUrl: "https://github.com/org/repo/releases/download/v1.0.0/rootfs.img.zst",
          otaSha256: "abc123",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("releases.update", () => {
    it("updates release fields", async () => {
      const updated = { ...releaseRow, isPublished: true };
      const db = createMockDb([releaseRow], [updated]);
      const caller = callerFor(adminUser, db);
      const result = await caller["releases.update"]({
        id: "a0000000-0000-4000-a000-000000000001",
        isPublished: true,
      });

      expect(result.isPublished).toBe(true);
    });

    it("throws NOT_FOUND for missing release", async () => {
      const db = createMockDb([], []);
      const caller = callerFor(adminUser, db);
      await expect(
        caller["releases.update"]({
          id: "00000000-0000-0000-0000-000000000000",
          isPublished: true,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws BAD_REQUEST when no fields provided", async () => {
      const db = createMockDb([releaseRow]);
      const caller = callerFor(adminUser, db);
      await expect(
        caller["releases.update"]({ id: "a0000000-0000-4000-a000-000000000001" }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(
        caller["releases.update"]({
          id: "a0000000-0000-4000-a000-000000000001",
          isPublished: true,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("releases.latest", () => {
    it("returns the most recent release", async () => {
      const caller = callerFor(customerUser, createMockDb([releaseRow]));
      const result = await caller["releases.latest"]();

      expect(result).not.toBeNull();
      expect(result!.version).toBe("v1.0.0");
      expect(result!.otaSha256).toBe("abc123");
      expect(result!.releaseNotes).toBe("First release");
    });

    it("returns null when no releases exist", async () => {
      const caller = callerFor(customerUser, createMockDb([]));
      const result = await caller["releases.latest"]();
      expect(result).toBeNull();
    });

    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = callerFor(null, createMockDb());
      await expect(caller["releases.latest"]()).rejects.toThrow(TRPCError);
    });
  });

  describe("releases.list", () => {
    it("returns all releases ordered by date", async () => {
      const rows = [
        releaseRow,
        {
          ...releaseRow,
          id: "a0000000-0000-4000-a000-000000000002",
          version: "v0.9.0",
          publishedAt: new Date("2025-05-01"),
        },
      ];
      const caller = callerFor(adminUser, createMockDb(rows));
      const result = await caller["releases.list"]();

      expect(result).toHaveLength(2);
      expect(result[0]!.version).toBe("v1.0.0");
      expect(result[1]!.version).toBe("v0.9.0");
    });

    it("throws FORBIDDEN for customers", async () => {
      const caller = callerFor(customerUser, createMockDb());
      await expect(caller["releases.list"]()).rejects.toThrow(TRPCError);
    });
  });
});
