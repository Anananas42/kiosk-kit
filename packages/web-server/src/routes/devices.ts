import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";

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

  // Customers see only their own devices; admins see all
  app.get("/", async (c) => {
    const user = c.get("user");
    const query = db.select().from(devices);
    const result =
      user.role === "admin" ? await query : await query.where(eq(devices.userId, user.id));
    return c.json(result);
  });

  // Admin only: create a device and assign it to a user
  app.post("/", requireAdmin, async (c) => {
    const body = await c.req.json<{ name?: string; tailscale_ip?: string; user_id?: string }>();

    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.tailscale_ip || !isValidIp(body.tailscale_ip)) {
      return c.json({ error: "tailscale_ip must be a valid IP address" }, 400);
    }
    if (!body.user_id?.trim()) {
      return c.json({ error: "user_id is required" }, 400);
    }

    const [device] = await db
      .insert(devices)
      .values({
        userId: body.user_id.trim(),
        name: body.name.trim(),
        tailscaleIp: body.tailscale_ip,
      })
      .returning();

    return c.json(device, 201);
  });

  // Customers see only their own device and tailscale_ip is omitted; admins see everything
  app.get("/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const conditions =
      user.role === "admin"
        ? eq(devices.id, id)
        : and(eq(devices.id, id), eq(devices.userId, user.id));

    const [device] = await db.select().from(devices).where(conditions);

    if (!device) return c.json({ error: "Not found" }, 404);

    if (user.role !== "admin") {
      const { tailscaleIp: _, ...rest } = device;
      return c.json(rest);
    }

    return c.json(device);
  });

  // Admin only: delete a device
  app.delete("/:id", requireAdmin, async (c) => {
    const id = c.req.param("id");

    const [deleted] = await db.delete(devices).where(eq(devices.id, id)).returning();

    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
