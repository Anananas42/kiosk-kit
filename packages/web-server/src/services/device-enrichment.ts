import type { Device } from "@kioskkit/shared";
import { parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import { getCachedDevice } from "./tailscale.js";

type DeviceRow = typeof devices.$inferSelect;

/** Enrich a DB device row with live Tailscale data (online, lastSeen, hostname, tailscaleIp). */
export async function enrichWithTailscale(
  db: Db,
  d: DeviceRow,
): Promise<Omit<Device, "lastBackupAt">> {
  const live = {
    online: false,
    lastSeen: d.lastSeen?.toISOString() ?? null,
    hostname: d.hostname,
    tailscaleIp: d.tailscaleIp,
  };

  try {
    const td = await getCachedDevice(d.tailscaleNodeId);
    live.online = td.online;
    live.lastSeen = td.lastSeen;
    live.hostname = td.hostname;
    live.tailscaleIp = td.addresses.find((a) => a.startsWith("100.")) ?? d.tailscaleIp;

    await db
      .update(devices)
      .set({
        lastSeen: parseISO(td.lastSeen),
        tailscaleIp: live.tailscaleIp,
        hostname: td.hostname,
      })
      .where(eq(devices.id, d.id));
  } catch {
    // Tailscale API unavailable — use DB fallback
  }

  return {
    id: d.id,
    tailscaleNodeId: d.tailscaleNodeId,
    userId: d.userId,
    name: d.name,
    validateProxyHash: d.validateProxyHash,
    ...live,
    createdAt: d.createdAt.toISOString(),
  };
}
