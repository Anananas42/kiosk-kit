import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { PROXY_TIMEOUT_MS } from "../config.js";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import { getTailscaleClient } from "../services/tailscale.js";

async function getAccessibleDevice(db: Db, deviceId: string, userId: string, role: string) {
  const conditions =
    role === "admin"
      ? eq(devices.id, deviceId)
      : and(eq(devices.id, deviceId), eq(devices.userId, userId));
  const [device] = await db.select().from(devices).where(conditions);

  if (!device) return null;

  // If tailscaleIp is missing, fetch from Tailscale API and cache it
  if (!device.tailscaleIp) {
    try {
      const ts = getTailscaleClient();
      const td = await ts.getDevice(device.tailscaleNodeId);
      const ip = td.addresses.find((a) => a.startsWith("100.")) ?? null;
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

      // Inject <base> into admin HTML so relative asset paths and API calls
      // resolve through the proxy prefix.
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
