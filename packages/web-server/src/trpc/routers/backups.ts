import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { backups, devices } from "../../db/schema.js";
import { pullBackupFromDevice } from "../../routes/backup-upload.js";
import { getSignedDownloadUrl } from "../../services/s3.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

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
});
