import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isValidIp(ip: string): boolean {
  if (!IP_REGEX.test(ip)) return false;
  return ip.split(".").every((octet) => {
    const n = Number(octet);
    return n >= 0 && n <= 255;
  });
}

export function devicesRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  app.get("/", async (c) => {
    const user = c.get("user");
    const result = await db.select().from(devices).where(eq(devices.userId, user.id));
    return c.json(result);
  });

  app.post("/", async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{ name?: string; tailscale_ip?: string }>();

    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.tailscale_ip || !isValidIp(body.tailscale_ip)) {
      return c.json({ error: "tailscale_ip must be a valid IP address" }, 400);
    }

    const [device] = await db
      .insert(devices)
      .values({
        userId: user.id,
        name: body.name.trim(),
        tailscaleIp: body.tailscale_ip,
      })
      .returning();

    return c.json(device, 201);
  });

  app.get("/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, id), eq(devices.userId, user.id)));

    if (!device) return c.json({ error: "Not found" }, 404);
    return c.json(device);
  });

  app.delete("/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const [deleted] = await db
      .delete(devices)
      .where(and(eq(devices.id, id), eq(devices.userId, user.id)))
      .returning();

    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
