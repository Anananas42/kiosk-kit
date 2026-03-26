import {
  type Device,
  DeviceAssignInputSchema,
  DeviceSchema,
  DeviceUpdateInputSchema,
} from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { devices } from "../../db/schema.js";
import { LOCAL_DEVICE_ID, makeLocalDevice } from "../../local-dev.js";
import { getTailscaleClient, type TailscaleDevice } from "../../services/tailscale.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

const isDev = process.env.NODE_ENV === "development";

function tailscaleIpFromDevice(td: TailscaleDevice): string | null {
  return td.addresses.find((a) => a.startsWith("100.")) ?? null;
}

export const devicesRouter = router({
  "devices.get": authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(DeviceSchema)
    .query(async ({ ctx, input }) => {
      if (isDev && input.id === LOCAL_DEVICE_ID) {
        return makeLocalDevice(ctx.user.id);
      }

      const conditions =
        ctx.user.role === "admin"
          ? eq(devices.id, input.id)
          : and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id));

      const [device] = await ctx.db.select().from(devices).where(conditions);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // If tailscaleIp is missing, try to fetch from Tailscale API and cache it
      let { tailscaleIp } = device;
      if (!tailscaleIp) {
        try {
          const ts = getTailscaleClient();
          const td = await ts.getDevice(device.tailscaleNodeId);
          tailscaleIp = tailscaleIpFromDevice(td);
          if (tailscaleIp) {
            await ctx.db.update(devices).set({ tailscaleIp }).where(eq(devices.id, device.id));
          }
        } catch {
          // Tailscale API unavailable — return without IP
        }
      }

      return {
        id: device.id,
        tailscaleNodeId: device.tailscaleNodeId,
        userId: device.userId,
        name: device.name,
        tailscaleIp: ctx.user.role === "admin" ? tailscaleIp : undefined,
        online: false,
        lastSeen: null,
        hostname: device.name,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.list": authedProcedure.output(z.array(DeviceSchema)).query(async ({ ctx }) => {
    if (ctx.user.role === "admin") {
      return listForAdmin(ctx.db);
    }
    return listForCustomer(ctx.db, ctx.user.id);
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
        lastSeen: null,
        hostname: device.name,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.update": adminProcedure
    .input(DeviceUpdateInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .update(devices)
        .set({ name: input.name })
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
        lastSeen: null,
        hostname: device.name,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.delete": adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(devices).where(eq(devices.id, input.id)).returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { ok: true };
    }),
});

// ── Admin list: merge Tailscale API with DB ─────────────────────────

async function listForAdmin(db: import("../../db/index.js").Db): Promise<Device[]> {
  let tailscaleDevices: TailscaleDevice[] = [];
  try {
    const ts = getTailscaleClient();
    tailscaleDevices = await ts.listDevices();
  } catch {
    // Tailscale API unavailable — fall back to DB-only
  }

  const dbDevices = await db.select().from(devices);
  const dbByNodeId = new Map(dbDevices.map((d) => [d.tailscaleNodeId, d]));

  const result: Device[] = [];

  for (const td of tailscaleDevices) {
    const tsIp = tailscaleIpFromDevice(td);
    let dbDevice = dbByNodeId.get(td.nodeId);

    if (!dbDevice) {
      // Auto-upsert: create DB row for newly discovered Tailscale device
      const [inserted] = await db
        .insert(devices)
        .values({
          tailscaleNodeId: td.nodeId,
          tailscaleIp: tsIp,
          name: td.hostname,
        })
        .returning();
      dbDevice = inserted;
    } else if (tsIp && dbDevice.tailscaleIp !== tsIp) {
      // Update cached IP if changed
      await db.update(devices).set({ tailscaleIp: tsIp }).where(eq(devices.id, dbDevice.id));
      dbDevice = { ...dbDevice, tailscaleIp: tsIp };
    }

    dbByNodeId.delete(td.nodeId);

    result.push({
      id: dbDevice.id,
      tailscaleNodeId: td.nodeId,
      userId: dbDevice.userId,
      name: dbDevice.name,
      tailscaleIp: tsIp,
      online: td.online,
      lastSeen: td.lastSeen,
      hostname: td.hostname,
      createdAt: dbDevice.createdAt.toISOString(),
    });
  }

  // Remove DB devices no longer in Tailscale (only if API was reachable)
  if (tailscaleDevices.length > 0) {
    const staleIds = [...dbByNodeId.values()].map((d) => d.id);
    if (staleIds.length > 0) {
      await db.delete(devices).where(inArray(devices.id, staleIds));
    }
  } else {
    // Tailscale API was unavailable — keep DB devices as offline fallback
    for (const dbDevice of dbByNodeId.values()) {
      result.push({
        id: dbDevice.id,
        tailscaleNodeId: dbDevice.tailscaleNodeId,
        userId: dbDevice.userId,
        name: dbDevice.name,
        tailscaleIp: dbDevice.tailscaleIp,
        online: false,
        lastSeen: null,
        hostname: dbDevice.name,
        createdAt: dbDevice.createdAt.toISOString(),
      });
    }
  }

  if (isDev) {
    result.push(makeLocalDevice(null));
  }

  return result;
}

// ── Customer list: DB only ──────────────────────────────────────────

async function listForCustomer(
  db: import("../../db/index.js").Db,
  userId: string,
): Promise<Device[]> {
  const dbDevices = await db.select().from(devices).where(eq(devices.userId, userId));

  const list: Device[] = dbDevices.map((d) => ({
    id: d.id,
    tailscaleNodeId: d.tailscaleNodeId,
    userId: d.userId,
    name: d.name,
    online: false,
    lastSeen: null,
    hostname: d.name,
    createdAt: d.createdAt.toISOString(),
  }));

  if (isDev) {
    list.push(makeLocalDevice(userId));
  }

  return list;
}
