import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deviceOperations } from "../db/schema.js";

// ── Operation types ─────────────────────────────────────────────────
export const OP_TYPE_BACKUP = "backup" as const;
export const OP_TYPE_RESTORE = "restore" as const;
export const OP_TYPE_OTA_PUSH = "ota_push" as const;
export const OP_TYPE_OTA_INSTALL = "ota_install" as const;
export const OP_TYPE_APP_PUSH = "app_push" as const;
export const OP_TYPE_APP_INSTALL = "app_install" as const;

export type OperationType =
  | typeof OP_TYPE_BACKUP
  | typeof OP_TYPE_RESTORE
  | typeof OP_TYPE_OTA_PUSH
  | typeof OP_TYPE_OTA_INSTALL
  | typeof OP_TYPE_APP_PUSH
  | typeof OP_TYPE_APP_INSTALL;

// ── Operation statuses ──────────────────────────────────────────────
export const OP_STATUS_IN_PROGRESS = "in_progress" as const;
export const OP_STATUS_COMPLETED = "completed" as const;
export const OP_STATUS_FAILED = "failed" as const;

export type OperationStatus =
  | typeof OP_STATUS_IN_PROGRESS
  | typeof OP_STATUS_COMPLETED
  | typeof OP_STATUS_FAILED;

export type OperationRecord = typeof deviceOperations.$inferSelect;

export type StartOperationResult = {
  operation: OperationRecord;
  isNew: boolean;
};

/** Serialized operation for API responses. */
export type OperationResponse = {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: unknown;
};

/** Format an operation record for API responses. */
export function formatOperationResponse(op: OperationRecord): OperationResponse {
  return {
    id: op.id,
    deviceId: op.deviceId,
    type: op.type,
    status: op.status,
    error: op.error,
    startedAt: op.startedAt.toISOString(),
    completedAt: op.completedAt?.toISOString() ?? null,
    metadata: op.metadata,
  };
}

/**
 * Start a new operation for a device. If an in_progress operation of the same
 * type already exists, return it if it's still fresh, or mark it failed and
 * create a new one if it's stale.
 *
 * Returns the operation and whether it was newly created.
 */
export async function startOperation(
  db: Db,
  opts: { deviceId: string; type: OperationType; metadata?: unknown; staleThresholdMs: number },
): Promise<StartOperationResult> {
  const cutoff = new Date(Date.now() - opts.staleThresholdMs);

  // Check for existing in_progress operation of same type on same device
  const [existing] = await db
    .select()
    .from(deviceOperations)
    .where(
      and(
        eq(deviceOperations.deviceId, opts.deviceId),
        eq(deviceOperations.type, opts.type),
        eq(deviceOperations.status, OP_STATUS_IN_PROGRESS),
      ),
    )
    .orderBy(desc(deviceOperations.startedAt))
    .limit(1);

  if (existing) {
    if (existing.startedAt > cutoff) {
      // Still fresh — return as-is (idempotent)
      return { operation: existing, isNew: false };
    }
    // Stale — mark it failed
    await db
      .update(deviceOperations)
      .set({ status: OP_STATUS_FAILED, completedAt: new Date(), error: "Operation timed out" })
      .where(eq(deviceOperations.id, existing.id));
  }

  const [op] = await db
    .insert(deviceOperations)
    .values({
      deviceId: opts.deviceId,
      type: opts.type,
      status: OP_STATUS_IN_PROGRESS,
      metadata: opts.metadata ?? null,
    })
    .returning();

  return { operation: op!, isNew: true };
}

/** Mark an operation as completed. */
export async function completeOperation(db: Db, operationId: string) {
  await db
    .update(deviceOperations)
    .set({ status: OP_STATUS_COMPLETED, completedAt: new Date() })
    .where(eq(deviceOperations.id, operationId));
}

/** Mark an operation as failed with an error message. */
export async function failOperation(db: Db, operationId: string, error: string) {
  await db
    .update(deviceOperations)
    .set({ status: OP_STATUS_FAILED, completedAt: new Date(), error })
    .where(eq(deviceOperations.id, operationId));
}

/** Get the most recent operation of a given type for a device. */
export async function getLatestOperation(db: Db, deviceId: string, type: OperationType) {
  const [op] = await db
    .select()
    .from(deviceOperations)
    .where(and(eq(deviceOperations.deviceId, deviceId), eq(deviceOperations.type, type)))
    .orderBy(desc(deviceOperations.startedAt))
    .limit(1);

  return op ?? null;
}

/**
 * Find all in_progress operations older than their type-specific thresholds
 * and mark them failed. Returns the number of operations cleaned up.
 */
export async function cleanupStale(db: Db, thresholds: Record<string, number>): Promise<number> {
  // Build per-type conditions: type = X AND startedAt < cutoff_for_X
  const conditions = Object.entries(thresholds).map(([type, ms]) =>
    and(eq(deviceOperations.type, type), lt(deviceOperations.startedAt, new Date(Date.now() - ms))),
  );

  if (conditions.length === 0) return 0;

  const stale = await db
    .update(deviceOperations)
    .set({ status: OP_STATUS_FAILED, completedAt: new Date(), error: "Operation timed out" })
    .where(and(eq(deviceOperations.status, OP_STATUS_IN_PROGRESS), or(...conditions)))
    .returning({ id: deviceOperations.id });

  return stale.length;
}
