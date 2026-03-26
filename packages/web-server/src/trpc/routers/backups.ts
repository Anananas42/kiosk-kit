import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { backups, devices } from "../../db/schema.js";
import { LOCAL_DEVICE_HOST, LOCAL_DEVICE_ID } from "../../local-dev.js";
import { pullBackupFromDevice } from "../../routes/backup-upload.js";
import { downloadFile, getSignedDownloadUrl } from "../../services/s3.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

const HEALTH_TIMEOUT_MS = 5_000;
const RESTORE_TIMEOUT_MS = 60_000;
const isDev = process.env.NODE_ENV === "development";

export const backupsRouter = router({
  /** Admin-only: trigger an on-demand backup pull from a device. */
  "backups.trigger": adminProcedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .select({ id: devices.id, tailscaleIp: devices.tailscaleIp })
        .from(devices)
        .where(eq(devices.id, input.deviceId));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      if (!device.tailscaleIp) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Device has no known IP" });
      }

      return pullBackupFromDevice(ctx.db, device);
    }),

  "backups.list": authedProcedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify device exists and user has access
      const conditions =
        ctx.user.role === "admin"
          ? eq(devices.id, input.deviceId)
          : and(eq(devices.id, input.deviceId), eq(devices.userId, ctx.user.id));

      const [device] = await ctx.db.select({ id: devices.id }).from(devices).where(conditions);

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

      // Verify user owns the device (or is admin)
      if (ctx.user.role !== "admin") {
        const [device] = await ctx.db
          .select({ id: devices.id })
          .from(devices)
          .where(and(eq(devices.id, backup.deviceId), eq(devices.userId, ctx.user.id)));

        if (!device) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
        }
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
      const deviceConditions =
        ctx.user.role === "admin"
          ? eq(devices.id, backup.deviceId)
          : and(eq(devices.id, backup.deviceId), eq(devices.userId, ctx.user.id));

      const [device] = await ctx.db.select().from(devices).where(deviceConditions);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Resolve device host
      const deviceHost =
        isDev && device.id === LOCAL_DEVICE_ID ? LOCAL_DEVICE_HOST : `${device.tailscaleIp}:3001`;

      // Check device is online
      try {
        const healthRes = await fetch(`http://${deviceHost}/api/health`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
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
      const restoreRes = await fetch(`http://${deviceHost}/api/restore`, {
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
