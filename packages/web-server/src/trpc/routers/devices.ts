import {
  type Device,
  DeviceAssignInputSchema,
  DeviceClaimInputSchema,
  DeviceSchema,
  DeviceStatus,
  DeviceStatusSchema,
  DeviceUpdateInputSchema,
} from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_TIMEOUT_MS } from "../../config.js";
import { backups, devices } from "../../db/schema.js";
import { LOCAL_DEVICE_ID, makeLocalDevice } from "../../local-dev.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import {
  getCachedDevice,
  getTailscaleClient,
  type TailscaleDevice,
} from "../../services/tailscale.js";
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

      // Fetch live status from Tailscale API (cached 30s)
      let online = false;
      let lastSeen: string | null = device.lastSeen?.toISOString() ?? null;
      let { tailscaleIp } = device;

      try {
        const td = await getCachedDevice(device.tailscaleNodeId);
        online = td.online;
        lastSeen = td.lastSeen;
        tailscaleIp = tailscaleIpFromDevice(td) ?? tailscaleIp;

        await ctx.db
          .update(devices)
          .set({ lastSeen: new Date(td.lastSeen), tailscaleIp })
          .where(eq(devices.id, device.id));
      } catch (err) {
        console.warn(
          `[devices] Tailscale API error for device ${device.id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      return {
        id: device.id,
        tailscaleNodeId: device.tailscaleNodeId,
        userId: device.userId,
        name: device.name,
        tailscaleIp: ctx.user.role === "admin" ? tailscaleIp : undefined,
        online,
        lastSeen,
        hostname: device.name,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.status": authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ status: DeviceStatusSchema }))
    .query(async ({ ctx, input }) => {
      const conditions =
        ctx.user.role === "admin"
          ? eq(devices.id, input.id)
          : and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id));

      const [device] = await ctx.db.select().from(devices).where(conditions);
      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Check Tailscale connectivity
      let tailscaleOnline = false;
      if (isDev && device.id === LOCAL_DEVICE_ID) {
        tailscaleOnline = true;
      } else {
        try {
          const td = await getCachedDevice(device.tailscaleNodeId);
          tailscaleOnline = td.online;
        } catch {
          return { status: DeviceStatus.Offline };
        }
      }

      if (!tailscaleOnline) {
        return { status: DeviceStatus.Offline };
      }

      // Tailscale says online — check app health
      try {
        const res = await fetchDeviceProxy(
          { id: device.id, tailscaleIp: device.tailscaleIp },
          "/api/health",
          { signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS) },
        );
        return { status: res.ok ? DeviceStatus.Online : DeviceStatus.AppNotConnected };
      } catch {
        return { status: DeviceStatus.AppNotConnected };
      }
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
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(devices).where(eq(devices.id, input.id)).returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { ok: true };
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
        lastSeen: null,
        hostname: updated.name,
        createdAt: updated.createdAt.toISOString(),
      };
    }),
});

// ── Pairing code fetch helper ────────────────────────────────────────

async function fetchPairingCode(device: {
  id: string;
  tailscaleIp: string | null;
}): Promise<string | null> {
  if (!device.tailscaleIp) return null;
  try {
    const res = await fetchDeviceProxy(device, "/api/pairing", {
      signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string };
    return body.code && /^\d{9}$/.test(body.code) ? body.code : null;
  } catch {
    return null;
  }
}

// ── Admin list: merge Tailscale API with DB ─────────────────────────

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

async function listForAdmin(db: import("../../db/index.js").Db): Promise<Device[]> {
  const ts = getTailscaleClient();
  const tailscaleDevices = await ts.listDevices();

  const [dbDevices, lastBackupMap] = await Promise.all([
    db.select().from(devices),
    getLastBackupMap(db),
  ]);
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

      // Fetch pairing code from the device
      const code = await fetchPairingCode({ id: dbDevice.id, tailscaleIp: tsIp });
      if (code) {
        await db.update(devices).set({ pairingCode: code }).where(eq(devices.id, dbDevice.id));
        dbDevice = { ...dbDevice, pairingCode: code };
      }
    } else {
      // Update cached IP and lastSeen
      const updates: Record<string, unknown> = { lastSeen: new Date(td.lastSeen) };
      if (tsIp && dbDevice.tailscaleIp !== tsIp) {
        updates.tailscaleIp = tsIp;
      }

      // Retry fetching pairing code for devices that don't have one yet
      if (!dbDevice.pairingCode && !dbDevice.userId) {
        const code = await fetchPairingCode({ id: dbDevice.id, tailscaleIp: tsIp });
        if (code) {
          updates.pairingCode = code;
          dbDevice = { ...dbDevice, pairingCode: code };
        }
      }

      await db.update(devices).set(updates).where(eq(devices.id, dbDevice.id));
      dbDevice = { ...dbDevice, tailscaleIp: tsIp ?? dbDevice.tailscaleIp };
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
      lastBackupAt: lastBackupMap.get(dbDevice.id) ?? null,
      hostname: td.hostname,
      createdAt: dbDevice.createdAt.toISOString(),
    });
  }

  // Remove DB devices no longer in Tailscale.
  // Guard: if Tailscale returned zero devices, it's likely a misconfiguration —
  // don't wipe the entire device table.
  if (tailscaleDevices.length > 0) {
    const staleIds = [...dbByNodeId.values()].map((d) => d.id);
    if (staleIds.length > 0) {
      await db.delete(devices).where(inArray(devices.id, staleIds));
    }
  } else if (dbDevices.length > 0) {
    console.warn(
      `[devices] Tailscale returned 0 devices but DB has ${dbDevices.length} — possible misconfiguration, skipping cleanup`,
    );
  }

  if (isDev) {
    result.push(makeLocalDevice(null));
  }

  return result;
}

// ── Customer list: DB + Tailscale status ────────────────────────────

async function listForCustomer(
  db: import("../../db/index.js").Db,
  userId: string,
): Promise<Device[]> {
  const [dbDevices, lastBackupMap] = await Promise.all([
    db.select().from(devices).where(eq(devices.userId, userId)),
    getLastBackupMap(db),
  ]);

  const list: Device[] = await Promise.all(
    dbDevices.map(async (d) => {
      let online = false;
      let lastSeen: string | null = d.lastSeen?.toISOString() ?? null;

      try {
        const td = await getCachedDevice(d.tailscaleNodeId);
        online = td.online;
        lastSeen = td.lastSeen;

        // Persist lastSeen back to DB as fallback
        await db
          .update(devices)
          .set({ lastSeen: new Date(td.lastSeen) })
          .where(eq(devices.id, d.id));
      } catch (err) {
        console.warn(
          `[devices] Tailscale API error for device ${d.id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      return {
        id: d.id,
        tailscaleNodeId: d.tailscaleNodeId,
        userId: d.userId,
        name: d.name,
        online,
        lastSeen,
        lastBackupAt: lastBackupMap.get(d.id) ?? null,
        hostname: d.name,
        createdAt: d.createdAt.toISOString(),
      };
    }),
  );

  if (isDev) {
    list.push(makeLocalDevice(userId));
  }

  return list;
}
