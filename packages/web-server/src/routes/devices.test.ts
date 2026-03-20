import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { devicesRoutes } from "./devices.js";

type User = typeof users.$inferSelect;

// Minimal mock DB that records calls and returns canned data
function createMockDb(returnValue: unknown[] = []) {
  // where() must be both awaitable (for SELECT) and chainable (for DELETE...returning())
  const terminal = Object.assign(Promise.resolve(returnValue), {
    returning: vi.fn().mockResolvedValue(returnValue),
  });
  const chainable = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(terminal),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    delete: vi.fn().mockReturnThis(),
  };
  return chainable as unknown as Db;
}

const adminUser: User = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  googleId: "g-admin",
  role: "admin",
  stripeCustomerId: null,
  createdAt: new Date(),
};

const customerUser: User = {
  id: "user-1",
  email: "test@test.com",
  name: "Test",
  googleId: "g-1",
  role: "customer",
  stripeCustomerId: null,
  createdAt: new Date(),
};

function makeApp(db: Db, user: User = adminUser) {
  const app = new Hono<AuthEnv>();

  app.use("*", async (c, next) => {
    c.set("user", user);
    await next();
  });

  app.route("/devices", devicesRoutes(db));
  return app;
}

describe("devices routes", () => {
  it("POST /devices validates name is required", async () => {
    const app = makeApp(createMockDb());
    const res = await app.request("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tailscale_ip: "100.64.1.5", user_id: "user-1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("POST /devices validates tailscale_ip", async () => {
    const app = makeApp(createMockDb());
    const res = await app.request("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Kiosk", tailscale_ip: "not-an-ip", user_id: "user-1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "tailscale_ip must be a valid IP address" });
  });

  it("POST /devices rejects IP with octets > 255", async () => {
    const app = makeApp(createMockDb());
    const res = await app.request("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Kiosk",
        tailscale_ip: "999.999.999.999",
        user_id: "user-1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /devices returns 201 on success", async () => {
    const device = { id: "abc", userId: "user-1", name: "Kiosk", tailscaleIp: "100.64.1.5" };
    const app = makeApp(createMockDb([device]));
    const res = await app.request("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kiosk", tailscale_ip: "100.64.1.5", user_id: "user-1" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(device);
  });

  it("POST /devices returns 403 for customers", async () => {
    const app = makeApp(createMockDb(), customerUser);
    const res = await app.request("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kiosk", tailscale_ip: "100.64.1.5", user_id: "user-1" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("GET /devices/:id returns 404 when not found", async () => {
    const app = makeApp(createMockDb([]));
    const res = await app.request("/devices/nonexistent");
    expect(res.status).toBe(404);
  });

  it("GET /devices/:id omits tailscale_ip for customers", async () => {
    const device = {
      id: "abc",
      userId: "user-1",
      name: "Kiosk",
      tailscaleIp: "100.64.1.5",
      createdAt: new Date().toISOString(),
    };
    const app = makeApp(createMockDb([device]), customerUser);
    const res = await app.request("/devices/abc");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("tailscaleIp");
    expect(body.name).toBe("Kiosk");
  });

  it("DELETE /devices/:id returns 404 when not found", async () => {
    const app = makeApp(createMockDb([]));
    const res = await app.request("/devices/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("DELETE /devices/:id returns 403 for customers", async () => {
    const app = makeApp(createMockDb(), customerUser);
    const res = await app.request("/devices/some-id", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});
