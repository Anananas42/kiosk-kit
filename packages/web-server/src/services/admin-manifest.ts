import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { releases } from "../db/schema.js";

/**
 * In-memory cache of admin manifests keyed by version string.
 * Manifests only change on release, so this cache is effectively permanent
 * for the lifetime of the server process.
 */
const manifestCache = new Map<string, Record<string, string> | null>();

/**
 * Look up the admin asset manifest for a given release version.
 * Returns a map of file paths to SHA256 hex hashes, or null if the version
 * has no manifest (e.g. older releases created before this feature).
 */
export async function getAdminManifest(
  db: Db,
  version: string,
): Promise<Record<string, string> | null> {
  if (manifestCache.has(version)) {
    return manifestCache.get(version)!;
  }

  const [release] = await db
    .select({ adminManifest: releases.adminManifest })
    .from(releases)
    .where(eq(releases.version, version))
    .limit(1);

  const manifest = release?.adminManifest ?? null;
  manifestCache.set(version, manifest);
  return manifest;
}

/** Clear all in-memory caches. Exported for testing only. */
export function clearManifestCaches(): void {
  manifestCache.clear();
  deviceVersionCache.clear();
}

/**
 * Cache of device app versions keyed by device ID.
 * Entries expire after TTL_MS so version changes are picked up promptly.
 */
const deviceVersionCache = new Map<string, { version: string | null; fetchedAt: number }>();
const VERSION_TTL_MS = 60_000;

/**
 * Fetch the app version a device is currently running by calling its health endpoint.
 * Cached per-device for 60 seconds.
 */
export async function getDeviceAppVersion(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  deviceId: string,
): Promise<string | null> {
  const cached = deviceVersionCache.get(deviceId);
  if (cached && Date.now() - cached.fetchedAt < VERSION_TTL_MS) {
    return cached.version;
  }

  try {
    const res = await fetchFn("/api/health", { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { appVersion?: string | null };
    const version = body.appVersion ?? null;
    deviceVersionCache.set(deviceId, { version, fetchedAt: Date.now() });
    return version;
  } catch {
    return null;
  }
}
