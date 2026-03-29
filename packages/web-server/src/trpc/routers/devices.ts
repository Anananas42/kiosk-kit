import {
  type Device,
  DeviceClaimInputSchema,
  DeviceSchema,
  DeviceStatusSchema,
  DeviceUpdateInputSchema,
} from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_TIMEOUT_MS } from "../../config.js";
import { backups, devices } from "../../db/schema.js";
import { enrichWithTailscale } from "../../services/device-enrichment.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import { getDeviceStatus } from "../../services/device-status.js";
import { authedProcedure, router } from "../trpc.js";

export const devicesRouter = router({
  "devices.get": authedProcedure
    .input(z.object({ id: z.uuid() }))
    .output(DeviceSchema)
    .query(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .select()
        .from(devices)
        .where(and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const { tailscaleIp: _, ...rest } = await enrichWithTailscale(ctx.db, device);
      return rest;
    }),

  "devices.status": authedProcedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ status: DeviceStatusSchema }))
    .query(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .select()
        .from(devices)
        .where(and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id)));

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { status: await getDeviceStatus(device) };
    }),

  "devices.list": authedProcedure.output(z.array(DeviceSchema)).query(async ({ ctx }) => {
    return listForCustomer(ctx.db, ctx.user.id);
  }),

  "devices.claim": authedProcedure
    .input(DeviceClaimInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .select()
        .from(devices)
        .where(and(eq(devices.pairingCode, input.code), isNull(devices.userId)));

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or already claimed pairing code",
        });
      }

      const [updated] = await ctx.db
        .update(devices)
        .set({ userId: ctx.user.id, pairingCode: null })
        .where(eq(devices.id, device.id))
        .returning();

      // Best-effort: notify device that pairing was consumed
      if (updated.tailscaleIp) {
        try {
          await fetchDeviceProxy(
            { id: updated.id, tailscaleIp: updated.tailscaleIp },
            "/api/pairing/consume",
            { method: "POST", signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS) },
          );
        } catch {
          // Device may be unreachable — not critical
        }
      }

      return {
        id: updated.id,
        tailscaleNodeId: updated.tailscaleNodeId,
        userId: updated.userId,
        name: updated.name,
        online: false,
        hashVerifyEnabled: updated.hashVerifyEnabled,
        lastSeen: null,
        hostname: updated.hostname,
        createdAt: updated.createdAt.toISOString(),
      };
    }),

  "devices.rename": authedProcedure
    .input(DeviceUpdateInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .update(devices)
        .set({ name: input.name })
        .where(and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id)))
        .returning();

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return {
        id: device.id,
        tailscaleNodeId: device.tailscaleNodeId,
        userId: device.userId,
        name: device.name,
        online: false,
        hashVerifyEnabled: device.hashVerifyEnabled,
        lastSeen: null,
        hostname: device.hostname,
        createdAt: device.createdAt.toISOString(),
      };
    }),
});

// ── Customer list: DB + Tailscale status ────────────────────────────

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

async function listForCustomer(
  db: import("../../db/index.js").Db,
  userId: string,
): Promise<Device[]> {
  const [dbDevices, lastBackupMap] = await Promise.all([
    db.select().from(devices).where(eq(devices.userId, userId)),
    getLastBackupMap(db),
  ]);

  return Promise.all(
    dbDevices.map(async (d) => {
      const { tailscaleIp: _, ...rest } = await enrichWithTailscale(db, d);
      return { ...rest, lastBackupAt: lastBackupMap.get(d.id) ?? null };
    }),
  );
}
