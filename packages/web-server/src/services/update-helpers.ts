import type { ReleaseType } from "@kioskkit/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { devices, releases } from "../db/schema.js";
import { fetchDeviceProxy } from "./device-network.js";
import { getTailscaleClient } from "./tailscale.js";

/**
 * Look up a device by ID, verifying ownership (or admin access).
 * If the device's Tailscale IP is missing, attempts to fetch and cache it.
 */
export async function getAccessibleDevice(db: Db, deviceId: string, userId: string, role: string) {
  const conditions =
    role === "admin"
      ? eq(devices.id, deviceId)
      : and(eq(devices.id, deviceId), eq(devices.userId, userId));
  const [device] = await db.select().from(devices).where(conditions);

  if (!device) return null;

  if (!device.tailscaleIp) {
    try {
      const ts = getTailscaleClient();
      const td = await ts.getDevice(device.tailscaleNodeId);
      const ip = td.addresses.find((a: string) => a.startsWith("100.")) ?? null;
      if (ip) {
        await db.update(devices).set({ tailscaleIp: ip }).where(eq(devices.id, device.id));
        return { ...device, tailscaleIp: ip };
      }
    } catch {
      // Tailscale API unavailable
    }
  }

  return device;
}

export type FetchAndStreamOptions = {
  db: Db;
  device: { id: string; tailscaleIp: string | null };
  version: string;
  releaseType: ReleaseType;
  deviceEndpoint: string;
  headers: Record<string, string>;
  fetchTimeout: number;
  pushTimeout: number;
};

/**
 * Fetch a release asset from GitHub and stream it to a device endpoint.
 *
 * 1. Looks up the release by version and type
 * 2. Fetches the asset from the release URL (otaAssetUrl or appAssetUrl)
 * 3. Streams it to the device at the given endpoint path
 */
export async function fetchAndStreamToDevice(
  opts: FetchAndStreamOptions,
): Promise<{ ok: true; response: Response } | { ok: false; error: string; status: number }> {
  // Look up release
  const [release] = await opts.db
    .select()
    .from(releases)
    .where(and(eq(releases.version, opts.version), eq(releases.releaseType, opts.releaseType)));

  if (!release) {
    return { ok: false, error: "Version not found", status: 404 };
  }

  // Fetch asset from GitHub
  let upstream: Response;
  try {
    const assetUrl = release.otaAssetUrl;
    if (!assetUrl) {
      return { ok: false, error: "Release has no OTA asset", status: 404 };
    }

    upstream = await fetch(assetUrl, {
      signal: AbortSignal.timeout(opts.fetchTimeout),
      headers: { Accept: "application/octet-stream" },
    });
  } catch {
    return { ok: false, error: "Failed to fetch image from upstream", status: 502 };
  }

  if (!upstream.ok) {
    return { ok: false, error: "Failed to fetch image from upstream", status: 502 };
  }

  const contentLength = upstream.headers.get("content-length");
  if (!contentLength) {
    return { ok: false, error: "Upstream did not provide Content-Length", status: 502 };
  }

  // Build device headers — include version/sha256 headers + Content-Length + Content-Type
  const deviceHeaders: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Length": contentLength,
    ...opts.headers,
  };

  // Populate sha256 from release
  for (const [key, value] of Object.entries(deviceHeaders)) {
    if (value === "__SHA256__") {
      deviceHeaders[key] = release.otaSha256 ?? "";
    }
  }

  // Push to device
  const pushRes = await fetchDeviceProxy(opts.device, opts.deviceEndpoint, {
    method: "POST",
    headers: deviceHeaders,
    body: upstream.body,
    signal: AbortSignal.timeout(opts.pushTimeout),
    // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
    duplex: "half",
  });

  return { ok: true, response: pushRes };
}
