import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";

const PROXY_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;

async function getAccessibleDevice(db: Db, deviceId: string, userId: string, role: string) {
  const conditions =
    role === "admin"
      ? eq(devices.id, deviceId)
      : and(eq(devices.id, deviceId), eq(devices.userId, userId));
  const [device] = await db.select().from(devices).where(conditions);
  return device ?? null;
}

export function deviceProxyRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  // Health check: GET /api/devices/:id/status
  app.get("/:id/status", async (c) => {
    const user = c.get("user");
    const device = await getAccessibleDevice(db, c.req.param("id"), user.id, user.role);
    if (!device) return c.json({ error: "Not found" }, 404);

    try {
      const res = await fetch(`http://${device.tailscaleIp}:3001/api/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return c.json({ online: res.ok });
    } catch {
      return c.json({ online: false });
    }
  });

  // Proxy: /api/devices/:id/kiosk/* → http://{tailscale_ip}:3001/api/*
  app.all("/:id/kiosk/*", async (c) => {
    const user = c.get("user");
    const device = await getAccessibleDevice(db, c.req.param("id"), user.id, user.role);
    if (!device) return c.json({ error: "Not found" }, 404);

    const kioskPath = c.req.path.replace(/^.*?\/kiosk\//, "");
    const targetUrl = `http://${device.tailscaleIp}:3001/api/${kioskPath}`;

    try {
      const headers = new Headers(c.req.raw.headers);
      // Remove hop-by-hop headers
      headers.delete("host");
      headers.delete("connection");

      const res = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
        duplex: "half",
      });

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
