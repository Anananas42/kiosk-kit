import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import {
  cleanupStale,
  completeOperation,
  failOperation,
  formatOperationResponse,
  getLatestOperation,
  OperationType,
  startOperation,
} from "./device-operations.js";

const DEVICE_ID = "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a";
const OP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_ID,
    deviceId: DEVICE_ID,
    type: "backup",
    status: "in_progress",
    error: null,
    startedAt: new Date(),
    completedAt: null,
    metadata: null,
    ...overrides,
  };
}

/**
 * Build a mock Db whose query chains resolve to configurable values.
 * - selectResult: what select().from().where().orderBy().limit() resolves to
 * - insertResult: what insert().values().returning() resolves to
 * - updateResult: what update().set().where().returning() resolves to
 */
function createMockDb(opts: {
  selectResult?: unknown[];
  insertResult?: unknown[];
  updateResult?: unknown[];
}) {
  const { selectResult = [], insertResult = [], updateResult = [] } = opts;

  const setFn = vi.fn();
  const valuesFn = vi.fn();

  // Terminal for select chains: where().orderBy().limit()
  const selectTerminal = Object.assign(Promise.resolve(selectResult), {
    limit: vi.fn().mockResolvedValue(selectResult),
  });
  const selectOrderBy = Object.assign(Promise.resolve(selectResult), {
    orderBy: vi.fn().mockReturnValue(selectTerminal),
    limit: vi.fn().mockResolvedValue(selectResult),
  });

  // Terminal for update().set().where() chains — awaitable with .returning()
  const updateWhereTerminal = Object.assign(Promise.resolve(updateResult), {
    returning: vi.fn().mockResolvedValue(updateResult),
  });

  // set() returns object with where()
  const setResult = Object.assign(Promise.resolve(updateResult), {
    where: vi.fn().mockReturnValue(updateWhereTerminal),
  });

  const chainable = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(selectOrderBy),
    orderBy: vi.fn().mockReturnValue(selectTerminal),
    limit: vi.fn().mockResolvedValue(selectResult),
    insert: vi.fn().mockReturnThis(),
    values: valuesFn.mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertResult),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: setFn.mockReturnValue(setResult),
    // biome-ignore lint/suspicious/noThenProperty: mock db needs thenable for drizzle query chain
    then: (resolve: (v: unknown) => void) => Promise.resolve(selectResult).then(resolve),
    _mocks: { setFn, valuesFn },
  };
  return chainable as unknown as Db & { _mocks: typeof chainable._mocks };
}

describe("formatOperationResponse", () => {
  it("serializes dates and nulls correctly", () => {
    const op = makeOp({ completedAt: new Date("2026-01-01T00:00:00Z") });
    const response = formatOperationResponse(op as Parameters<typeof formatOperationResponse>[0]);

    expect(response.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.completedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(response.error).toBeNull();
    expect(response.metadata).toBeNull();
  });

  it("handles null completedAt", () => {
    const op = makeOp();
    const response = formatOperationResponse(op as Parameters<typeof formatOperationResponse>[0]);

    expect(response.completedAt).toBeNull();
  });
});

describe("device-operations service", () => {
  describe("startOperation", () => {
    it("creates a new record when no existing in_progress op", async () => {
      const newOp = makeOp();
      const db = createMockDb({ selectResult: [], insertResult: [newOp] });

      const { operation, isNew } = await startOperation(db, {
        deviceId: DEVICE_ID,
        type: OperationType.Backup,
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(operation).toEqual(newOp);
      expect(isNew).toBe(true);
    });

    it("returns existing in_progress record when not stale (idempotent)", async () => {
      const existingOp = makeOp({ startedAt: new Date() });
      const db = createMockDb({ selectResult: [existingOp] });

      const { operation, isNew } = await startOperation(db, {
        deviceId: DEVICE_ID,
        type: OperationType.Backup,
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(operation.id).toBe(existingOp.id);
      expect(operation.status).toBe("in_progress");
      expect(isNew).toBe(false);
    });

    it("marks stale op as failed and creates a new one", async () => {
      const staleOp = makeOp({ startedAt: new Date(Date.now() - 10 * 60 * 1000) });
      const newOp = makeOp({ id: "new-op-id" });
      const db = createMockDb({
        selectResult: [staleOp],
        insertResult: [newOp],
        updateResult: [],
      });

      const { operation, isNew } = await startOperation(db, {
        deviceId: DEVICE_ID,
        type: OperationType.Backup,
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(operation).toEqual(newOp);
      expect(operation.id).toBe("new-op-id");
      expect(isNew).toBe(true);
    });

    it("stores metadata when provided", async () => {
      const newOp = makeOp({ metadata: { backupId: "abc-123" } });
      const db = createMockDb({ selectResult: [], insertResult: [newOp] });

      const { operation } = await startOperation(db, {
        deviceId: DEVICE_ID,
        type: OperationType.Restore,
        metadata: { backupId: "abc-123" },
        staleThresholdMs: 5 * 60 * 1000,
      });

      expect(operation.metadata).toEqual({ backupId: "abc-123" });
    });
  });

  describe("completeOperation", () => {
    it("calls update with completed status", async () => {
      const db = createMockDb({});

      await completeOperation(db, OP_ID);

      expect(db._mocks.setFn).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed", completedAt: expect.any(Date) }),
      );
    });
  });

  describe("failOperation", () => {
    it("calls update with failed status and error", async () => {
      const db = createMockDb({});

      await failOperation(db, OP_ID, "Something went wrong");

      expect(db._mocks.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          completedAt: expect.any(Date),
          error: "Something went wrong",
        }),
      );
    });
  });

  describe("getLatestOperation", () => {
    it("returns the most recent operation", async () => {
      const op = makeOp();
      const db = createMockDb({ selectResult: [op] });

      const result = await getLatestOperation(db, DEVICE_ID, OperationType.Backup);

      expect(result).toEqual(op);
    });

    it("returns null when no operations exist", async () => {
      const db = createMockDb({ selectResult: [] });

      const result = await getLatestOperation(db, DEVICE_ID, OperationType.Backup);

      expect(result).toBeNull();
    });
  });

  describe("cleanupStale", () => {
    it("returns count of cleaned up operations", async () => {
      const staleOps = [{ id: "op-1" }, { id: "op-2" }];
      const db = createMockDb({ updateResult: staleOps });

      const count = await cleanupStale(db, { backup: 0, restore: 0 });

      expect(count).toBe(2);
      expect(db._mocks.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error: "Operation timed out",
          completedAt: expect.any(Date),
        }),
      );
    });

    it("returns 0 when no stale operations exist", async () => {
      const db = createMockDb({ updateResult: [] });

      const count = await cleanupStale(db, { backup: 5 * 60 * 1000 });

      expect(count).toBe(0);
    });

    it("returns 0 when thresholds map is empty", async () => {
      const db = createMockDb({ updateResult: [] });

      const count = await cleanupStale(db, {});

      expect(count).toBe(0);
    });
  });
});
