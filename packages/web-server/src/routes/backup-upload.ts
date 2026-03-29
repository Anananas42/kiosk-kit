import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  BACKUP_FETCH_TIMEOUT_MS,
  BACKUP_STALE_OP_MS,
  MAX_BACKUP_SIZE_BYTES,
  MAX_RETAINED_BACKUPS,
} from "../config.js";
import type { Db } from "../db/index.js";
import { backups, devices } from "../db/schema.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import {
  completeOperation,
  failOperation,
  OperationType,
  startOperation,
} from "../services/device-operations.js";
import { deleteFile, uploadFile } from "../services/s3.js";

/**
 * Pull a backup from a single device: fetch its /api/backup endpoint,
 * upload the gzipped snapshot to S3, and record metadata in the DB.
 */
export async function pullBackupFromDevice(
  db: Db,
  device: { id: string; tailscaleIp: string | null },
  maxRetainedBackups: number = MAX_RETAINED_BACKUPS,
): Promise<{ id: string; sizeBytes: number; createdAt: string }> {
  const res = await fetchDeviceProxy(device, "/api/backup", {
    signal: AbortSignal.timeout(BACKUP_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Device ${device.id} backup fetch failed: ${res.status}`);
  }

  const contentLength = Number(res.headers.get("content-length") || "0");
  if (contentLength > MAX_BACKUP_SIZE_BYTES) {
    throw new Error(
      `Device ${device.id} backup too large: ${contentLength} bytes (max ${MAX_BACKUP_SIZE_BYTES})`,
    );
  }

  const body = Buffer.from(await res.arrayBuffer());
  const sizeBytes = body.length;

  if (sizeBytes === 0) {
    throw new Error(`Device ${device.id} returned empty backup`);
  }

  if (sizeBytes > MAX_BACKUP_SIZE_BYTES) {
    throw new Error(
      `Device ${device.id} backup too large: ${sizeBytes} bytes (max ${MAX_BACKUP_SIZE_BYTES})`,
    );
  }

  // Upload to S3
  const timestamp = new Date().toISOString();
  const s3Key = `backups/${device.id}/${timestamp}.sqlite.gz`;
  await uploadFile(s3Key, body, "application/gzip");

  // Insert metadata into DB
  const [backup] = await db
    .insert(backups)
    .values({ deviceId: device.id, s3Key, sizeBytes })
    .returning({ id: backups.id, sizeBytes: backups.sizeBytes, createdAt: backups.createdAt });

  // Enforce retention: delete backups beyond the limit
  const allBackups = await db
    .select({ id: backups.id, s3Key: backups.s3Key })
    .from(backups)
    .where(eq(backups.deviceId, device.id))
    .orderBy(desc(backups.createdAt));

  const toDelete = allBackups.slice(maxRetainedBackups);
  if (toDelete.length > 0) {
    await Promise.all(
      toDelete.map(async (old) => {
        await deleteFile(old.s3Key);
        await db.delete(backups).where(eq(backups.id, old.id));
      }),
    );
  }

  return {
    id: backup!.id,
    sizeBytes: backup!.sizeBytes,
    createdAt: backup!.createdAt.toISOString(),
  };
}

/**
 * Pull backups from devices that are due based on their per-device backupIntervalHours.
 * A device is due if it has a tailscaleIp, a userId, and either no backups exist
 * or the most recent backup is older than the device's configured interval.
 * Errors on individual devices are logged but do not stop the batch.
 * Each device pull is tracked as a device operation.
 */
export async function pullBackupsFromDueDevices(db: Db): Promise<void> {
  // Subquery: most recent backup createdAt per device
  const latestBackup = db
    .select({
      deviceId: backups.deviceId,
      latestCreatedAt: sql<Date>`max(${backups.createdAt})`.as("latest_created_at"),
    })
    .from(backups)
    .groupBy(backups.deviceId)
    .as("latest_backup");

  const dueDevices = await db
    .select({
      id: devices.id,
      tailscaleIp: devices.tailscaleIp,
      maxRetainedBackups: devices.maxRetainedBackups,
    })
    .from(devices)
    .leftJoin(latestBackup, eq(devices.id, latestBackup.deviceId))
    .where(
      and(
        isNotNull(devices.tailscaleIp),
        isNotNull(devices.userId),
        or(
          isNull(latestBackup.latestCreatedAt),
          lt(
            latestBackup.latestCreatedAt,
            sql`now() - make_interval(hours => ${devices.backupIntervalHours})`,
          ),
        ),
      ),
    );

  for (const device of dueDevices) {
    const { operation: op } = await startOperation(db, {
      deviceId: device.id,
      type: OperationType.Backup,
      staleThresholdMs: BACKUP_STALE_OP_MS,
    });

    try {
      const result = await pullBackupFromDevice(db, device, device.maxRetainedBackups);
      await completeOperation(db, op.id);
      console.log(`[backup] Pulled backup from device ${device.id} (${result.sizeBytes} bytes)`);
    } catch (err) {
      await failOperation(db, op.id, err instanceof Error ? err.message : "Backup failed");
      console.error(
        `[backup] Failed to pull backup from device ${device.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
