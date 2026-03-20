import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { deviceProxyRoutes } from "./device-proxy.js";

type User = typeof users.$inferSelect;

const DEVICE = {
  id: "device-1",
  userId: "user-1",
  name: "Test Kiosk",
  tailscaleIp: "100.64.1.5",
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

const adminUser: User = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  googleId: "g-admin",
  role: "admin",
  stripeCustomerId: null,
  createdAt: new Date(),
};

function createMockDb(returnValue: unknown[] = []) {
  const terminal = Object.assign(Promise.resolve(returnValue), {
    returning: vi.fn().mockResolvedValue(returnValue),
  });
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(terminal),
  } as unknown as Db;
}

function makeApp(db: Db, user: User = customerUser) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  app.route("/devices", deviceProxyRoutes(db));
  return app;
}

describe("device health check", () => {
  it("returns online: true when device responds OK", async () => {
    const app = makeApp(createMockDb([DEVICE]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await app.request("/devices/device-1/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ online: true });

    vi.unstubAllGlobals();
  });

  it("returns online: false on timeout/error", async () => {
    const app = makeApp(createMockDb([DEVICE]));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const res = await app.request("/devices/device-1/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ online: false });

    vi.unstubAllGlobals();
  });

  it("returns 404 for non-owned device (customer)", async () => {
    const app = makeApp(createMockDb([]));
    const res = await app.request("/devices/unknown/status");
    expect(res.status).toBe(404);
  });

  it("admin can health-check any device", async () => {
    const app = makeApp(createMockDb([DEVICE]), adminUser);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await app.request("/devices/device-1/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ online: true });

    vi.unstubAllGlobals();
  });
});

describe("device proxy", () => {
  it("proxies GET request to kiosk-server", async () => {
    const app = makeApp(createMockDb([DEVICE]));
    const body = JSON.stringify({ items: [] });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
        ),
    );

    const res = await app.request("/devices/device-1/kiosk/catalog");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://100.64.1.5:3001/api/catalog");

    vi.unstubAllGlobals();
  });

  it("returns 502 when device is unreachable", async () => {
    const app = makeApp(createMockDb([DEVICE]));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const res = await app.request("/devices/device-1/kiosk/catalog");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Device unreachable" });

    vi.unstubAllGlobals();
  });

  it("returns 404 for non-owned device (customer)", async () => {
    const app = makeApp(createMockDb([]));
    const res = await app.request("/devices/unknown/kiosk/catalog");
    expect(res.status).toBe(404);
  });

  it("admin can proxy any device", async () => {
    const app = makeApp(createMockDb([DEVICE]), adminUser);
    const body = JSON.stringify({ items: [] });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
        ),
    );

    const res = await app.request("/devices/device-1/kiosk/catalog");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });

    vi.unstubAllGlobals();
  });
});
