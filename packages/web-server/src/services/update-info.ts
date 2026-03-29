import type { DeviceUpdateInfo, UpdateStatus } from "@kioskkit/shared";
import { and, desc, eq } from "drizzle-orm";
import semver from "semver";
import { DEVICE_TIMEOUT_MS } from "../config.js";
import type { Db } from "../db/index.js";
import { deviceUpdateOps, releases } from "../db/schema.js";
import { fetchDeviceProxy } from "./device-network.js";

type DeviceLike = { id: string; tailscaleIp: string | null };

/**
 * Determine what update a device needs: full OTA, live app bundle, or up-to-date.
 *
 * 1. Get current version from device (or fallback to last completed op).
 * 2. Find published releases newer than that version.
 * 3. If any release has ota_asset_url → full update (target = latest with OTA asset).
 * 4. Otherwise if newer releases exist → live update (target = latest release).
 * 5. Otherwise → up to date.
 */
export async function getDeviceUpdateInfo(
  db: Db,
  device: DeviceLike,
): Promise<DeviceUpdateInfo & { currentVersion: string | null }> {
  const currentVersion = await resolveCurrentVersion(db, device);

  if (!currentVersion) {
    return { type: "up_to_date", currentVersion: null };
  }

  // Get all published, non-archived releases
  const allReleases = await db
    .select()
    .from(releases)
    .where(and(eq(releases.isPublished, true), eq(releases.isArchived, false)))
    .orderBy(desc(releases.publishedAt));

  // Filter to releases newer than current version
  const newerReleases = allReleases.filter(
    (r) => semver.valid(r.version) && semver.gt(r.version, currentVersion),
  );

  if (newerReleases.length === 0) {
    return { type: "up_to_date", currentVersion };
  }

  // Check if any release in the newer range has an OTA asset → full update needed
  const otaRelease = newerReleases.find((r) => r.otaAssetUrl != null);

  if (otaRelease) {
    // Target = the latest release that has an OTA asset
    const latestOta = newerReleases.reduce(
      (best, r) => {
        if (!r.otaAssetUrl) return best;
        if (!best) return r;
        return semver.gt(r.version, best.version) ? r : best;
      },
      null as (typeof newerReleases)[number] | null,
    )!;

    return {
      type: "full",
      currentVersion,
      targetVersion: latestOta.version,
      releaseNotes: latestOta.releaseNotes,
      publishedAt: latestOta.publishedAt.toISOString(),
    };
  }

  // Live update — target = latest release overall
  const latestRelease = newerReleases.reduce(
    (best, r) => {
      if (!best) return r;
      return semver.gt(r.version, best.version) ? r : best;
    },
    null as (typeof newerReleases)[number] | null,
  )!;

  return {
    type: "live",
    currentVersion,
    targetVersion: latestRelease.version,
    releaseNotes: latestRelease.releaseNotes,
    publishedAt: latestRelease.publishedAt.toISOString(),
  };
}

/**
 * Try to get device version from the device directly; fall back to the last
 * completed push operation in device_update_ops.
 */
async function resolveCurrentVersion(db: Db, device: DeviceLike): Promise<string | null> {
  // Try device endpoint first
  if (device.tailscaleIp) {
    try {
      const res = await fetchDeviceProxy(device, "/api/trpc/admin.update.status", {
        method: "GET",
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });

      if (res.ok) {
        const data = (await res.json()) as { result?: { data?: UpdateStatus } };
        const version = data?.result?.data?.currentVersion;
        if (version) return version;
      }
    } catch {
      // Device unreachable — fall through to DB lookup
    }
  }

  // Fallback: last completed push op
  const [lastOp] = await db
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

  return lastOp?.version ?? null;
}
