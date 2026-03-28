import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { devices } from "../../db/schema.js";
import { pullBackupFromDevice } from "../../routes/backup-upload.js";
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

      return pullBackupFromDevice(ctx.db, device);
    }),
});
