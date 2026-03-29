import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BACKUP_STALE_OP_MS } from "../../config.js";
import { devices } from "../../db/schema.js";
import { pullBackupFromDevice } from "../../routes/backup-upload.js";
import {
  completeOperation,
  failOperation,
  startOperation,
} from "../../services/device-operations.js";
import { adminProcedure, router } from "../trpc.js";

export const adminBackupsRouter = router({
  "backups.trigger": adminProcedure
    .input(z.object({ deviceId: z.uuid() }))
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

      const op = await startOperation(ctx.db, {
        deviceId: device.id,
        type: "backup",
        staleThresholdMs: BACKUP_STALE_OP_MS,
      });

      // If already in progress (idempotent), return immediately
      if (op.status === "in_progress" && op.startedAt.getTime() < Date.now() - 1000) {
        return {
          id: op.id,
          deviceId: op.deviceId,
          type: op.type,
          status: op.status,
          startedAt: op.startedAt.toISOString(),
        };
      }

      // Fire-and-forget
      pullBackupFromDevice(ctx.db, device)
        .then(() => completeOperation(ctx.db, op.id))
        .catch((err) =>
          failOperation(ctx.db, op.id, err instanceof Error ? err.message : "Backup failed"),
        );

      return {
        id: op.id,
        deviceId: op.deviceId,
        type: op.type,
        status: op.status,
        startedAt: op.startedAt.toISOString(),
      };
    }),
});
