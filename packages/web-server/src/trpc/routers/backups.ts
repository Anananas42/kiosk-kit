import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_TIMEOUT_MS, RESTORE_TIMEOUT_MS } from "../../config.js";
import { backups, devices } from "../../db/schema.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import { downloadFile, getSignedDownloadUrl } from "../../services/s3.js";
import { authedProcedure, router } from "../trpc.js";

export const backupsRouter = router({
  "backups.list": authedProcedure
    .input(z.object({ deviceId: z.string().uuid() }))
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
          createdAt: backups.createdAt,
        })
        .from(backups)
        .where(eq(backups.deviceId, input.deviceId))
        .orderBy(desc(backups.createdAt));

      return rows.map((r) => ({
        id: r.id,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  "backups.getDownloadUrl": authedProcedure
    .input(z.object({ backupId: z.string().uuid() }))
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
    .input(z.object({ backupId: z.string().uuid() }))
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

      return result;
    }),
});
