import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deviceOperations } from "../db/schema.js";

/**
 * Start a new operation for a device. If an in_progress operation of the same
 * type already exists, return it if it's still fresh, or mark it failed and
 * create a new one if it's stale.
 */
export async function startOperation(
  db: Db,
  opts: { deviceId: string; type: string; metadata?: unknown; staleThresholdMs: number },
) {
  const cutoff = new Date(Date.now() - opts.staleThresholdMs);

  // Check for existing in_progress operation of same type on same device
  const [existing] = await db
    .select()
    .from(deviceOperations)
    .where(
      and(
        eq(deviceOperations.deviceId, opts.deviceId),
        eq(deviceOperations.type, opts.type),
        eq(deviceOperations.status, "in_progress"),
      ),
    )
    .orderBy(desc(deviceOperations.startedAt))
    .limit(1);

  if (existing) {
    if (existing.startedAt > cutoff) {
      // Still fresh — return as-is (idempotent)
      return existing;
    }
    // Stale — mark it failed
    await db
      .update(deviceOperations)
      .set({ status: "failed", completedAt: new Date(), error: "Operation timed out" })
      .where(eq(deviceOperations.id, existing.id));
  }

  const [op] = await db
    .insert(deviceOperations)
    .values({
      deviceId: opts.deviceId,
      type: opts.type,
      status: "in_progress",
      metadata: opts.metadata ?? null,
    })
    .returning();

  return op!;
}

/** Mark an operation as completed. */
export async function completeOperation(db: Db, operationId: string) {
  await db
    .update(deviceOperations)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(deviceOperations.id, operationId));
}

/** Mark an operation as failed with an error message. */
export async function failOperation(db: Db, operationId: string, error: string) {
  await db
    .update(deviceOperations)
    .set({ status: "failed", completedAt: new Date(), error })
    .where(eq(deviceOperations.id, operationId));
}

/** Get the most recent operation of a given type for a device. */
export async function getLatestOperation(db: Db, deviceId: string, type: string) {
  const [op] = await db
    .select()
    .from(deviceOperations)
    .where(and(eq(deviceOperations.deviceId, deviceId), eq(deviceOperations.type, type)))
    .orderBy(desc(deviceOperations.startedAt))
    .limit(1);

  return op ?? null;
}

/**
 * Find all in_progress operations older than maxAgeMs and mark them failed.
 * Returns the number of operations cleaned up.
 */
export async function cleanupStale(db: Db, maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);

  const stale = await db
    .update(deviceOperations)
    .set({ status: "failed", completedAt: new Date(), error: "Operation timed out" })
    .where(and(eq(deviceOperations.status, "in_progress"), lt(deviceOperations.startedAt, cutoff)))
    .returning({ id: deviceOperations.id });

  return stale.length;
}
