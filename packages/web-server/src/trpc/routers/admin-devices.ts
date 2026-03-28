import {
  type Device,
  DeviceAssignInputSchema,
  DeviceSchema,
  DeviceUpdateInputSchema,
} from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_TIMEOUT_MS } from "../../config.js";
import { backups, devices } from "../../db/schema.js";
import { makeLocalDevice } from "../../local-dev.js";
import { fetchDeviceProxy } from "../../services/device-network.js";
import { getTailscaleClient, type TailscaleDevice } from "../../services/tailscale.js";
import { adminProcedure, router } from "../trpc.js";

const isDev = process.env.NODE_ENV === "development";

function tailscaleIpFromDevice(td: TailscaleDevice): string | null {
  return td.addresses.find((a) => a.startsWith("100.")) ?? null;
}

export const adminDevicesRouter = router({
  "devices.listAll": adminProcedure.output(z.array(DeviceSchema)).query(async ({ ctx }) => {
    return listForAdmin(ctx.db);
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
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(devices).where(eq(devices.id, input.id)).returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { ok: true };
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
