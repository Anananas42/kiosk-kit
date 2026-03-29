import {
  DeviceAssignInputSchema,
  DeviceSchema,
  DeviceStatusSchema,
  DeviceUpdateInputSchema,
} from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { asc, eq, isNotNull, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { backups, devices } from "../../db/schema.js";
import { enrichWithTailscale } from "../../services/device-enrichment.js";
import { getDeviceStatus } from "../../services/device-status.js";
import { getTailscaleClient } from "../../services/tailscale.js";
import { adminProcedure, router } from "../trpc.js";

export const adminDevicesRouter = router({
  "devices.status": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ status: DeviceStatusSchema }))
    .query(async ({ ctx, input }) => {
      const [device] = await ctx.db.select().from(devices).where(eq(devices.id, input.id));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { status: await getDeviceStatus(device) };
    }),

  "devices.get": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .output(DeviceSchema)
    .query(async ({ ctx, input }) => {
      const [device] = await ctx.db.select().from(devices).where(eq(devices.id, input.id));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return enrichWithTailscale(ctx.db, device);
    }),

  "devices.listAll": adminProcedure
    .input(z.object({ assigned: z.boolean().optional() }).optional())
    .output(z.array(DeviceSchema))
    .query(async ({ ctx, input }) => {
      let query = ctx.db.select().from(devices).$dynamic();
      if (input?.assigned === true) {
        query = query.where(isNotNull(devices.userId));
      } else if (input?.assigned === false) {
        query = query.where(isNull(devices.userId));
      }
      query = query.orderBy(asc(devices.createdAt));

      const [dbDevices, lastBackupMap] = await Promise.all([query, getLastBackupMap(ctx.db)]);

      const list = await Promise.all(
        dbDevices.map(async (d) => ({
          ...(await enrichWithTailscale(ctx.db, d)),
          lastBackupAt: lastBackupMap.get(d.id) ?? null,
        })),
      );

      return list;
    }),

  "devices.assign": adminProcedure
    .input(DeviceAssignInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .update(devices)
        .set({ userId: input.userId })
        .where(eq(devices.id, input.id))
        .returning();

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return {
        id: device.id,
        tailscaleNodeId: device.tailscaleNodeId,
        userId: device.userId,
        name: device.name,
        tailscaleIp: device.tailscaleIp,
        online: false,
        hashVerifyEnabled: device.hashVerifyEnabled,
        lastSeen: null,
        hostname: device.hostname,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.update": adminProcedure
    .input(DeviceUpdateInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .update(devices)
        .set({
          name: input.name,
          ...(input.hashVerifyEnabled !== undefined && {
            hashVerifyEnabled: input.hashVerifyEnabled,
          }),
        })
        .where(eq(devices.id, input.id))
        .returning();

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return {
        id: device.id,
        tailscaleNodeId: device.tailscaleNodeId,
        userId: device.userId,
        name: device.name,
        tailscaleIp: device.tailscaleIp,
        online: false,
        hashVerifyEnabled: device.hashVerifyEnabled,
        lastSeen: null,
        hostname: device.hostname,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.tailscaleStatus": adminProcedure
    .output(z.object({ reachable: z.boolean(), error: z.string().nullable() }))
    .query(async () => {
      try {
        const ts = getTailscaleClient();
        await ts.listDevices();
        return { reachable: true, error: null };
      } catch (err) {
        return { reachable: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),

  "devices.delete": adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(devices).where(eq(devices.id, input.id)).returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { ok: true };
    }),
});

async function getLastBackupMap(db: import("../../db/index.js").Db): Promise<Map<string, string>> {
  const rows = await db
    .select({
      deviceId: backups.deviceId,
      lastBackupAt: max(backups.createdAt),
    })
    .from(backups)
    .groupBy(backups.deviceId);

  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.lastBackupAt) {
      map.set(r.deviceId, r.lastBackupAt.toISOString());
    }
  }
  return map;
}
