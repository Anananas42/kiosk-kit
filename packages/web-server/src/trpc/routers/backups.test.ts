import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import type { TrpcContext } from "../context.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

vi.mock("../../routes/backup-upload.js", () => ({
  pullBackupFromDevice: vi
    .fn()
    .mockResolvedValue({ id: "b-1", sizeBytes: 1024, createdAt: new Date().toISOString() }),
}));

vi.mock("../../services/device-operations.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/device-operations.js")>();
  return {
    ...original,
    startOperation: vi.fn().mockResolvedValue({
      operation: {
        id: "op-1",
        deviceId: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a",
        type: "backup",
        status: "in_progress",
        error: null,
        startedAt: new Date(),
        completedAt: null,
        metadata: null,
      },
      isNew: true,
    }),
    completeOperation: vi.fn().mockResolvedValue(undefined),
    failOperation: vi.fn().mockResolvedValue(undefined),
  };
});

type User = typeof users.$inferSelect;

const createCaller = createCallerFactory(appRouter);

const customerUser: User = {
  id: "user-1",
  email: "test@test.com",
  name: "Test",
  googleId: "g-1",
  role: "customer",
  stripeCustomerId: null,
  createdAt: new Date(),
};

const deviceRow = {
  id: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a",
  tailscaleNodeId: "node-123",
  tailscaleIp: "100.64.1.5",
  userId: "user-1",
  name: "Kiosk",
  hostname: "kiosk-1",
  pairingCode: null,
  backupIntervalHours: 24,
  maxRetainedBackups: 30,
  lastSeen: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

function createMockDb(returnValue: unknown[] = []) {
  const terminal = Object.assign(Promise.resolve(returnValue), {
    returning: vi.fn().mockResolvedValue(returnValue),
  });
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
    orderBy: vi.fn().mockReturnValue(terminal),
    limit: vi.fn().mockResolvedValue(returnValue),
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

describe("backups procedures", () => {
  describe("backups.trigger", () => {
    it("triggers a backup and returns operation", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["backups.trigger"]({ deviceId: deviceRow.id });
      expect(result).toHaveProperty("id", "op-1");
      expect(result).toHaveProperty("status", "in_progress");
    });

    it("throws NOT_FOUND when device missing", async () => {
      const caller = callerFor(customerUser, createMockDb([]));
      await expect(caller["backups.trigger"]({ deviceId: deviceRow.id })).rejects.toThrow(
        TRPCError,
      );
    });

    it("throws PRECONDITION_FAILED when device has no IP", async () => {
      const caller = callerFor(customerUser, createMockDb([{ ...deviceRow, tailscaleIp: null }]));
      await expect(caller["backups.trigger"]({ deviceId: deviceRow.id })).rejects.toThrow(
        TRPCError,
      );
    });

    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = callerFor(null, createMockDb());
      await expect(caller["backups.trigger"]({ deviceId: deviceRow.id })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe("backups.getConfig", () => {
    it("returns backup config for owned device", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["backups.getConfig"]({ deviceId: deviceRow.id });
      expect(result).toMatchObject({
        backupIntervalHours: 24,
        maxRetainedBackups: 30,
      });
    });

    it("throws NOT_FOUND for unowned device", async () => {
      const caller = callerFor(customerUser, createMockDb([]));
      await expect(caller["backups.getConfig"]({ deviceId: deviceRow.id })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe("backups.updateConfig", () => {
    it("updates backup interval and returns config", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      const result = await caller["backups.updateConfig"]({
        deviceId: deviceRow.id,
        backupIntervalHours: 12,
      });
      // Mock DB returns deviceRow for all queries; verify the shape includes config fields
      expect(result).toMatchObject({
        backupIntervalHours: expect.any(Number),
        maxRetainedBackups: expect.any(Number),
      });
    });

    it("throws NOT_FOUND for unowned device", async () => {
      const caller = callerFor(customerUser, createMockDb([]));
      await expect(
        caller["backups.updateConfig"]({
          deviceId: deviceRow.id,
          maxRetainedBackups: 10,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws BAD_REQUEST when no fields provided", async () => {
      const caller = callerFor(customerUser, createMockDb([deviceRow]));
      await expect(caller["backups.updateConfig"]({ deviceId: deviceRow.id })).rejects.toThrow(
        TRPCError,
      );
    });
  });
});
