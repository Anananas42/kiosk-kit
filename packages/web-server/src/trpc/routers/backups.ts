import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  BACKUP_STALE_OP_MS,
  DEVICE_TIMEOUT_MS,
  RESTORE_STALE_OP_MS,
  RESTORE_TIMEOUT_MS,
} from "../../config.js";
import { backups, deviceOperations, devices } from "../../db/schema.js";
import { pullBackupFromDevice } from "../../routes/backup-upload.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import {
  completeOperation,
  failOperation,
  formatOperationResponse,
  OperationType,
  startOperation,
} from "../../services/device-operations.js";
import { downloadFile, getSignedDownloadUrl } from "../../services/s3.js";
import { authedProcedure, router } from "../trpc.js";

export const backupsRouter = router({
  "backups.list": authedProcedure
    .input(z.object({ deviceId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify device exists and user owns it
      const [device] = await ctx.db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const rows = await ctx.db
        .select({
          id: backups.id,
          sizeBytes: backups.sizeBytes,
          restoredAt: backups.restoredAt,
          createdAt: backups.createdAt,
        })
        .from(backups)
        .where(eq(backups.deviceId, input.deviceId))
        .orderBy(desc(backups.createdAt));

      return rows.map((r) => ({
        id: r.id,
        sizeBytes: r.sizeBytes,
        restoredAt: r.restoredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  "backups.getDownloadUrl": authedProcedure
    .input(z.object({ backupId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [backup] = await ctx.db
        .select({
          id: backups.id,
          s3Key: backups.s3Key,
          deviceId: backups.deviceId,
        })
        .from(backups)
        .where(eq(backups.id, input.backupId));

      if (!backup) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
      }

      // Verify user owns the device
      const [device] = await ctx.db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, backup.deviceId), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
      }

      const url = await getSignedDownloadUrl(backup.s3Key, 3600);
      return { url };
    }),

  "backups.restore": authedProcedure
    .input(z.object({ backupId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Look up the backup
      const [backup] = await ctx.db
        .select({
          id: backups.id,
          s3Key: backups.s3Key,
          deviceId: backups.deviceId,
        })
        .from(backups)
        .where(eq(backups.id, input.backupId));

      if (!backup) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
      }

      // Look up the device and verify ownership
      const [device] = await ctx.db
        .select()
        .from(devices)
        .where(and(eq(devices.id, backup.deviceId), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Track the restore operation
      const { operation: op } = await startOperation(ctx.db, {
        deviceId: device.id,
        type: OperationType.Restore,
        metadata: { backupId: backup.id },
        staleThresholdMs: RESTORE_STALE_OP_MS,
      });

      try {
        // Check device is online
        try {
          const healthRes = await fetchDeviceProxy(device, "/api/health", {
            signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
          });
          if (!healthRes.ok) throw new Error("Health check failed");
        } catch {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Device is offline. Restore is only available when the device is connected.",
          });
        }

        // Download the backup from S3
        const backupData = await downloadFile(backup.s3Key);

        // POST the backup to the device's restore endpoint
        const restoreRes = await fetchDeviceProxy(device, "/api/restore", {
          method: "POST",
          headers: { "Content-Type": "application/gzip" },
          body: new Uint8Array(backupData),
          signal: AbortSignal.timeout(RESTORE_TIMEOUT_MS),
        });

        const result = await restoreRes.json();

        if (!restoreRes.ok) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error ?? "Restore failed on device",
          });
        }

        await completeOperation(ctx.db, op.id);

        // Mark the backup as restored
        await ctx.db
          .update(backups)
          .set({ restoredAt: new Date() })
          .where(eq(backups.id, backup.id));

        return result;
      } catch (err) {
        await failOperation(ctx.db, op.id, err instanceof Error ? err.message : "Restore failed");
        throw err;
      }
    }),

  "backups.operationStatus": authedProcedure
    .input(z.object({ deviceId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify device exists and user owns it
      const [device] = await ctx.db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Get the most recent backup or restore operation for this device
      const [op] = await ctx.db
        .select()
        .from(deviceOperations)
        .where(
          and(
            eq(deviceOperations.deviceId, input.deviceId),
            inArray(deviceOperations.type, [OperationType.Backup, OperationType.Restore]),
          ),
        )
        .orderBy(desc(deviceOperations.startedAt))
        .limit(1);

      if (!op) return null;

      return formatOperationResponse(op);
    }),

  "backups.trigger": authedProcedure
    .input(z.object({ deviceId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify device exists and user owns it
      const [device] = await ctx.db
        .select({ id: devices.id, tailscaleIp: devices.tailscaleIp })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      if (!device.tailscaleIp) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Device has no known IP",
        });
      }

      const { operation: op, isNew } = await startOperation(ctx.db, {
        deviceId: device.id,
        type: OperationType.Backup,
        staleThresholdMs: BACKUP_STALE_OP_MS,
      });

      // Only kick off a new backup if this is a freshly created operation
      if (isNew) {
        pullBackupFromDevice(ctx.db, device)
          .then(() => completeOperation(ctx.db, op.id))
          .catch((err) =>
            failOperation(ctx.db, op.id, err instanceof Error ? err.message : "Backup failed"),
          );
      }

      return formatOperationResponse(op);
    }),
});
