import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.js";
import { deviceOperations, devices, users } from "../db/schema.js";
import {
  cleanupStale,
  completeOperation,
  failOperation,
  getLatestOperation,
  startOperation,
} from "./device-operations.js";

let db: Db;
const TEST_DEVICE_ID = "00000000-0000-4000-a000-000000000001";
const TEST_USER_ID = "test-user-device-ops";

beforeAll(async () => {
  db = createDb(process.env.DATABASE_URL!);

  // Seed a user and device for FK constraints
  await db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      email: "devops-test@test.local",
      googleId: "g-devops-test",
      role: "customer",
    })
    .onConflictDoNothing();

  await db
    .insert(devices)
    .values({
      id: TEST_DEVICE_ID,
      tailscaleNodeId: "devops-test-node",
      name: "Test Device",
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  // Clean up operations between tests
  await db.delete(deviceOperations).where(eq(deviceOperations.deviceId, TEST_DEVICE_ID));
});

afterAll(async () => {
  await db.delete(devices).where(eq(devices.id, TEST_DEVICE_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
});

describe("device-operations service", () => {
  describe("startOperation", () => {
    it("creates a new in_progress record", async () => {
      const op = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(op.id).toBeDefined();
      expect(op.deviceId).toBe(TEST_DEVICE_ID);
      expect(op.type).toBe("backup");
      expect(op.status).toBe("in_progress");
      expect(op.error).toBeNull();
      expect(op.startedAt).toBeInstanceOf(Date);
      expect(op.completedAt).toBeNull();
    });

    it("returns existing in_progress record when not stale (idempotent)", async () => {
      const first = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      const second = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(second.id).toBe(first.id);
    });

    it("marks stale ops as failed and creates a new one", async () => {
      const first = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      // Use a 0ms threshold so the existing op is immediately stale
      const second = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 0,
      });

      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe("in_progress");

      // Verify the old one was marked failed
      const [old] = await db
        .select()
        .from(deviceOperations)
        .where(eq(deviceOperations.id, first.id));

      expect(old!.status).toBe("failed");
      expect(old!.error).toBe("Operation timed out");
      expect(old!.completedAt).toBeInstanceOf(Date);
    });

    it("stores metadata", async () => {
      const op = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "restore",
        metadata: { backupId: "abc-123" },
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(op.metadata).toEqual({ backupId: "abc-123" });
    });
  });

  describe("completeOperation", () => {
    it("sets status to completed and completedAt", async () => {
      const op = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      await completeOperation(db, op.id);

      const [updated] = await db
        .select()
        .from(deviceOperations)
        .where(eq(deviceOperations.id, op.id));

      expect(updated!.status).toBe("completed");
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("failOperation", () => {
    it("sets status to failed with error and completedAt", async () => {
      const op = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      await failOperation(db, op.id, "Something went wrong");

      const [updated] = await db
        .select()
        .from(deviceOperations)
        .where(eq(deviceOperations.id, op.id));

      expect(updated!.status).toBe("failed");
      expect(updated!.error).toBe("Something went wrong");
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("getLatestOperation", () => {
    it("returns the most recent operation of the given type", async () => {
      // Create and complete a first op
      const first = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 0, // force stale so we can create another
      });
      await completeOperation(db, first.id);

      // Create a second
      const second = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      const latest = await getLatestOperation(db, TEST_DEVICE_ID, "backup");
      expect(latest!.id).toBe(second.id);
    });

    it("returns null when no operations exist", async () => {
      const result = await getLatestOperation(db, TEST_DEVICE_ID, "backup");
      expect(result).toBeNull();
    });
  });

  describe("cleanupStale", () => {
    it("marks old in_progress operations as failed", async () => {
      const op = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });

      // Clean up with 0ms threshold — everything is stale
      const count = await cleanupStale(db, 0);

      expect(count).toBe(1);

      const [updated] = await db
        .select()
        .from(deviceOperations)
        .where(eq(deviceOperations.id, op.id));

      expect(updated!.status).toBe("failed");
      expect(updated!.error).toBe("Operation timed out");
    });

    it("does not touch completed or failed operations", async () => {
      const op1 = await startOperation(db, {
        deviceId: TEST_DEVICE_ID,
        type: "backup",
        staleThresholdMs: 5 * 60 * 1000,
      });
      await completeOperation(db, op1.id);

      const count = await cleanupStale(db, 0);
      expect(count).toBe(0);
    });
  });
});
