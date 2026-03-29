import { createHash } from "node:crypto";
import { Hono } from "hono";
import { PROXY_TIMEOUT_MS } from "../config.js";
import type { Db } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { getAdminManifest, getDeviceAppVersion } from "../services/admin-manifest.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import { getAccessibleDevice } from "../services/update-helpers.js";

/** Returns true for paths that should be hash-verified (static admin assets). */
function isAdminAssetPath(kioskPath: string): boolean {
  return kioskPath.startsWith("admin/") || kioskPath === "admin";
}

export function deviceProxyRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  // Proxy: /api/devices/:id/kiosk/* → http://{tailscale_ip}:3001/api/*
  app.all("/:id/kiosk/*", async (c) => {
    const user = c.get("user");
    const device = await getAccessibleDevice(db, c.req.param("id"), user.id, user.role);
    if (!device) return c.json({ error: "Not found" }, 404);

    const kioskPath = c.req.path.replace(/^.*?\/kiosk\//, "");
    const queryString = new URL(c.req.url).search;
    const path = `/${kioskPath}${queryString}`;

    try {
      const headers = new Headers(c.req.raw.headers);
      for (const h of [
        "host",
        "connection",
        "keep-alive",
        "transfer-encoding",
        "te",
        "trailer",
        "upgrade",
        "proxy-authorization",
      ]) {
        headers.delete(h);
      }

      const fetchInit = {
        method: c.req.method,
        headers,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        duplex: "half",
      };

      const res = await fetchDeviceProxy(device, path, fetchInit);

      // Only verify static admin assets — API/tRPC calls are validated separately
      if (isAdminAssetPath(kioskPath) && res.ok) {
        const body = Buffer.from(await res.arrayBuffer());

        // Attempt hash verification against the release manifest
        const verificationError = await verifyAdminAsset(db, device, kioskPath, body);
        if (verificationError) {
          console.error(
            `[device-proxy] Asset verification failed for device ${device.id}: ${verificationError}`,
          );
          return c.json(
            {
              error: "Asset integrity check failed",
              detail: verificationError,
            },
            502,
          );
        }

        // Inject <base> into admin HTML so relative asset paths resolve through the proxy prefix
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          const html = body.toString("utf-8");
          const proxyBase = `/api/devices/${c.req.param("id")}/kiosk/admin/`;
          const rewritten = html.replace("<head>", `<head><base href="${proxyBase}">`);
          return new Response(rewritten, {
            status: res.status,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache, no-store, must-revalidate",
            },
          });
        }

        return new Response(body, {
          status: res.status,
          headers: res.headers,
        });
      }

      // Non-admin paths or non-OK responses: pass through as-is
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        const html = await res.text();
        const proxyBase = `/api/devices/${c.req.param("id")}/kiosk/admin/`;
        const rewritten = html.replace("<head>", `<head><base href="${proxyBase}">`);
        return new Response(rewritten, {
          status: res.status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      return new Response(res.body, {
        status: res.status,
        headers: res.headers,
      });
    } catch {
      return c.json({ error: "Device unreachable" }, 502);
    }
  });

  return app;
}

/**
 * Verify an admin asset's integrity against the release manifest.
 * Returns an error message if verification fails, or null if OK.
 *
 * Verification is skipped (returns null) when:
 * - The device's version cannot be determined
 * - No manifest exists for that version (older release)
 * - The asset path is not in the manifest (e.g. SPA fallback routes)
 */
async function verifyAdminAsset(
  db: Db,
  device: { id: string; tailscaleIp: string | null },
  kioskPath: string,
  body: Buffer,
): Promise<string | null> {
  const deviceFetch = (p: string, init?: RequestInit) => fetchDeviceProxy(device, p, init);
  const version = await getDeviceAppVersion(deviceFetch, device.id);
  if (!version) return null;

  const manifest = await getAdminManifest(db, version);
  if (!manifest) return null;

  // Normalize path: "admin/assets/index-abc.js" → "assets/index-abc.js"
  const assetPath = kioskPath.replace(/^admin\/?/, "") || "index.html";
  const expectedHash = manifest[assetPath];
  if (!expectedHash) return null;

  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== expectedHash) {
    return `Hash mismatch for ${assetPath}: expected ${expectedHash.slice(0, 12)}…, got ${actualHash.slice(0, 12)}… — device ${device.id} may be compromised`;
  }

  return null;
}
