import { DeviceUpdateInfoSchema } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_TIMEOUT_MS, UPDATE_ACTIVE_OP_MS } from "../../config.js";
import { deviceUpdateOps } from "../../db/schema.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import { getAccessibleDevice } from "../../services/update-helpers.js";
import { getDeviceUpdateInfo } from "../../services/update-info.js";
import { adminProcedure, router } from "../trpc.js";

const UpdateOpSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  updateType: z.string(),
  action: z.string(),
  version: z.string(),
  result: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});

type UpdateOp = typeof deviceUpdateOps.$inferSelect;

function formatOp(op: UpdateOp) {
  return {
    id: op.id,
    deviceId: op.deviceId,
    updateType: op.updateType,
    action: op.action,
    version: op.version,
    result: op.result,
    startedAt: op.startedAt.toISOString(),
    finishedAt: op.finishedAt?.toISOString() ?? null,
  };
}

async function getActiveOp(db: import("../../db/index.js").Db, deviceId: string) {
  const cutoff = new Date(Date.now() - UPDATE_ACTIVE_OP_MS);

  const [op] = await db
    .select()
    .from(deviceUpdateOps)
    .where(and(eq(deviceUpdateOps.deviceId, deviceId), isNull(deviceUpdateOps.finishedAt)))
    .orderBy(desc(deviceUpdateOps.startedAt))
    .limit(1);

  if (!op) return null;

  if (op.startedAt < cutoff) {
    await markFailed(db, op.id, "Operation timed out");
    return null;
  }

  return op;
}

async function markSuccess(db: import("../../db/index.js").Db, opId: string) {
  await db
    .update(deviceUpdateOps)
    .set({ finishedAt: new Date(), result: "success" })
    .where(eq(deviceUpdateOps.id, opId));
}

async function markFailed(db: import("../../db/index.js").Db, opId: string, error: string) {
  console.warn("Update operation %s failed: %s", opId, error);
  await db
    .update(deviceUpdateOps)
    .set({ finishedAt: new Date(), result: "failed" })
    .where(eq(deviceUpdateOps.id, opId));
}

export { formatOp, getActiveOp, markFailed, markSuccess, UpdateOpSchema };

export const deviceUpdateRouter = router({
  "devices.updateInfo": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(DeviceUpdateInfoSchema)
    .query(async ({ ctx, input }) => {
      const device = await getAccessibleDevice(ctx.db, input.id, ctx.user.id, ctx.user.role);
      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const info = await getDeviceUpdateInfo(ctx.db, device);
      return {
        type: info.type,
        targetVersion: info.targetVersion,
        releaseNotes: info.releaseNotes,
        publishedAt: info.publishedAt,
      };
    }),

  "devices.updateInstall": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ ok: z.boolean(), operation: UpdateOpSchema }))
    .mutation(async ({ ctx, input }) => {
      const device = await getAccessibleDevice(ctx.db, input.id, ctx.user.id, ctx.user.role);
      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const activeOp = await getActiveOp(ctx.db, device.id);
      if (activeOp) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Operation already in progress",
        });
      }

      const [lastPush] = await ctx.db
        .select()
        .from(deviceUpdateOps)
        .where(
          and(
            eq(deviceUpdateOps.deviceId, device.id),
            eq(deviceUpdateOps.action, "push"),
            eq(deviceUpdateOps.result, "success"),
          ),
        )
        .orderBy(desc(deviceUpdateOps.startedAt))
        .limit(1);

      const version = lastPush?.version ?? "unknown";
      const updateType = lastPush?.updateType ?? "live";

      const [op] = await ctx.db
        .insert(deviceUpdateOps)
        .values({
          deviceId: device.id,
          updateType,
          action: "install",
          version,
          triggeredBy: ctx.user.id,
        })
        .returning();

      if (!op) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create operation",
        });
      }

      try {
        await fetchDeviceProxy(device, "/api/trpc/admin.update.install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
        });
        await markSuccess(ctx.db, op.id);
      } catch (err) {
        console.warn("Install call failed for device %s: %s", device.id, err);
      }

      return { ok: true, operation: formatOp(op) };
    }),

  "devices.updateCancel": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const device = await getAccessibleDevice(ctx.db, input.id, ctx.user.id, ctx.user.role);
      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      try {
        await fetchDeviceProxy(device, "/api/trpc/admin.update.cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
        });
      } catch {
        // Device unreachable — still mark the op as failed below
      }

      const activeOp = await getActiveOp(ctx.db, device.id);
      if (activeOp) {
        await markFailed(ctx.db, activeOp.id, "Cancelled by user");
      }

      return { ok: true };
    }),

  "devices.updateStatus": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ operation: UpdateOpSchema.nullable() }))
    .query(async ({ ctx, input }) => {
      const device = await getAccessibleDevice(ctx.db, input.id, ctx.user.id, ctx.user.role);
      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const activeOp = await getActiveOp(ctx.db, device.id);
      return { operation: activeOp ? formatOp(activeOp) : null };
    }),
});
