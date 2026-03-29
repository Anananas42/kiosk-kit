import type { ReleaseType } from "@kioskkit/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { devices, releases } from "../db/schema.js";
import { fetchDeviceProxy } from "./device-network.js";
import { getTailscaleClient } from "./tailscale.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look up a device by ID, verifying ownership (or admin access).
 * If the device's Tailscale IP is missing, attempts to fetch and cache it.
 */
export async function getAccessibleDevice(db: Db, deviceId: string, userId: string, role: string) {
  if (!UUID_RE.test(deviceId)) return null;

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
    } catch (err) {
      console.warn("Failed to fetch Tailscale IP for device %s: %s", device.id, err);
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
  /** Pre-resolved asset URL — skips release lookup when provided. */
  assetUrl?: string;
  /** Pre-resolved SHA256 — replaces __SHA256__ placeholders in headers. */
  sha256?: string | null;
};

/**
 * Fetch a release asset and stream it to a device endpoint.
 *
 * When `assetUrl` and `sha256` are provided, the release DB lookup is skipped.
 * Otherwise, it looks up the release by version and type.
 */
export async function fetchAndStreamToDevice(
  opts: FetchAndStreamOptions,
): Promise<{ ok: true; response: Response } | { ok: false; error: string; status: number }> {
  let assetUrl = opts.assetUrl;
  let sha256 = opts.sha256 ?? null;

  // Look up release if asset URL not pre-resolved
  if (!assetUrl) {
    const [release] = await opts.db
      .select()
      .from(releases)
      .where(and(eq(releases.version, opts.version), eq(releases.releaseType, opts.releaseType)));

    if (!release) {
      return { ok: false, error: "Version not found", status: 404 };
    }

    assetUrl =
      (opts.releaseType === "app" ? release.appAssetUrl : release.otaAssetUrl) ?? undefined;
    sha256 = opts.releaseType === "app" ? release.appSha256 : release.otaSha256;
  }

  if (!assetUrl) {
    return { ok: false, error: `Release has no ${opts.releaseType} asset`, status: 404 };
  }

  // Fetch asset from upstream
  let upstream: Response;
  try {
    const fetchHeaders: Record<string, string> = { Accept: "application/octet-stream" };
    if (process.env.GITHUB_TOKEN) {
      fetchHeaders.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }
    upstream = await fetch(assetUrl, {
      signal: AbortSignal.timeout(opts.fetchTimeout),
      headers: fetchHeaders,
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

  // Populate sha256 from release or pre-resolved value
  for (const [key, value] of Object.entries(deviceHeaders)) {
    if (value === "__SHA256__") {
      deviceHeaders[key] = sha256 ?? "";
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
