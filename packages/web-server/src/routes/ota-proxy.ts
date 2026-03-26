import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { devices, releases } from "../db/schema.js";

const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
const FETCH_TIMEOUT_MS = 60_000;

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return null;
}

export function otaProxyRoutes(db: Db) {
  const app = new Hono();

  // GET /api/ota/image/:version — stream rootfs image to Pi devices
  app.get("/:version", async (c) => {
    const version = c.req.param("version");

    // Authenticate: verify request comes from a registered device (Tailscale IP)
    if (!isDev) {
      const clientIp = getClientIp(c);
      if (!clientIp) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.tailscaleIp, clientIp));

      if (!device) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    // Look up release by version
    const [release] = await db.select().from(releases).where(eq(releases.version, version));

    if (!release) {
      return c.json({ error: "Version not found" }, 404);
    }

    // Fetch the image from GitHub and stream it
    const upstream = await fetch(release.githubAssetUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/octet-stream" },
    });

    if (!upstream.ok) {
      return c.json({ error: "Failed to fetch image from upstream" }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Checksum-SHA256": release.sha256,
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length")! }
          : {}),
      },
    });
  });

  return app;
}
