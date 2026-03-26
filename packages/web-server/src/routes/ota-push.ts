import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { devices, releases } from "../db/schema.js";
import { LOCAL_DEVICE_HOST, LOCAL_DEVICE_ID } from "../local-dev.js";
import type { AuthEnv } from "../middleware/auth.js";
import { getTailscaleClient } from "../services/tailscale.js";

const isDev = process.env.NODE_ENV === "development";
const FETCH_TIMEOUT_MS = 120_000;
const PUSH_TIMEOUT_MS = 300_000; // 5 min for large images

function getDeviceHost(device: { id: string; tailscaleIp: string | null }): string {
  if (isDev && device.id === LOCAL_DEVICE_ID) {
    return LOCAL_DEVICE_HOST;
  }
  return `${device.tailscaleIp}:3001`;
}

async function getAccessibleDevice(db: Db, deviceId: string, userId: string, role: string) {
  if (isDev && deviceId === LOCAL_DEVICE_ID) {
    return { id: LOCAL_DEVICE_ID, tailscaleNodeId: "local-dev", tailscaleIp: null, userId };
  }

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

/**
 * POST /api/devices/:id/ota/push — trigger OTA image push to a device.
 *
 * Body: { version: string }
 *
 * Fetches the image from GitHub and streams it to the device's upload endpoint.
 * Only admins and device owners can trigger this.
 */
export function otaPushRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  app.post("/:id/ota/push", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const body = (await c.req.json()) as { version?: string };
    if (!body.version) {
      return c.json({ error: "version is required" }, 400);
    }

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Look up release
    const [release] = await db.select().from(releases).where(eq(releases.version, body.version));
    if (!release) {
      return c.json({ error: "Version not found" }, 404);
    }

    // Fetch image from GitHub
    let upstream: Response;
    try {
      upstream = await fetch(release.githubAssetUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/octet-stream" },
      });
    } catch {
      return c.json({ error: "Failed to fetch image from upstream" }, 502);
    }

    if (!upstream.ok) {
      return c.json({ error: "Failed to fetch image from upstream" }, 502);
    }

    const contentLength = upstream.headers.get("content-length");
    if (!contentLength) {
      return c.json({ error: "Upstream did not provide Content-Length" }, 502);
    }

    // Push to device
    const host = getDeviceHost(device);
    try {
      const pushRes = await fetch(`http://${host}/api/ota/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-OTA-Version": release.version,
          "X-OTA-SHA256": release.sha256,
          "Content-Length": contentLength,
        },
        body: upstream.body,
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
        duplex: "half",
      });

      if (!pushRes.ok) {
        const err = (await pushRes.json().catch(() => ({ error: "Push failed" }))) as {
          error?: string;
        };
        return c.json({ error: err.error ?? "Push failed" }, pushRes.status as 400);
      }

      return c.json({ ok: true });
    } catch {
      return c.json({ error: "Device unreachable" }, 502);
    }
  });

  return app;
}
