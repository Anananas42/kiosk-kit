import { createHash } from "node:crypto";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { clearManifestCaches } from "../services/admin-manifest.js";
import { deviceProxyRoutes } from "./device-proxy.js";

type User = typeof users.$inferSelect;

const DEVICE = {
  id: "a0000000-0000-4000-8000-000000000001",
  userId: "user-1",
  name: "Test Kiosk",
  tailscaleIp: "100.64.1.5",
  hashVerifyEnabled: true,
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

    const res = await app.request("/devices/a0000000-0000-4000-8000-000000000001/kiosk/catalog");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://100.64.1.5:3001/catalog");

    vi.unstubAllGlobals();
  });

  it("returns 502 when device is unreachable", async () => {
    const app = makeApp(createMockDb([DEVICE]));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const res = await app.request("/devices/a0000000-0000-4000-8000-000000000001/kiosk/catalog");
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

    const res = await app.request("/devices/a0000000-0000-4000-8000-000000000001/kiosk/catalog");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });

    vi.unstubAllGlobals();
  });
});

describe("admin asset hash verification", () => {
  const JS_BODY = 'console.log("hello")';
  const JS_HASH = createHash("sha256").update(JS_BODY).digest("hex");
  const MANIFEST = { "assets/index-abc.js": JS_HASH };

  afterEach(() => {
    vi.unstubAllGlobals();
    clearManifestCaches();
  });

  function createChainedMockDb(queries: unknown[][]) {
    let callIndex = 0;
    function makeTerminal(result: unknown[]) {
      const p = Object.assign(Promise.resolve(result), {
        returning: vi.fn().mockResolvedValue(result),
        limit: vi.fn().mockReturnValue(Promise.resolve(result)),
      });
      return p;
    }
    const mockWhere = vi.fn().mockImplementation(() => {
      const result = queries[callIndex] ?? [];
      callIndex++;
      return makeTerminal(result);
    });
    return {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: mockWhere,
    } as unknown as Db;
  }

  function stubFetchForAdmin(assetBody: string, appVersion: string | null = "1.0.0") {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: "ok", appVersion }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(assetBody, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          }),
        );
      }),
    );
  }

  it("serves admin asset when hash matches manifest", async () => {
    const db = createChainedMockDb([[DEVICE], [{ adminManifest: MANIFEST }]]);
    const app = makeApp(db);
    stubFetchForAdmin(JS_BODY);

    const res = await app.request(`/devices/${DEVICE.id}/kiosk/admin/assets/index-abc.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JS_BODY);
  });

  it("blocks admin asset when hash does not match manifest", async () => {
    const db = createChainedMockDb([[DEVICE], [{ adminManifest: MANIFEST }]]);
    const app = makeApp(db);
    stubFetchForAdmin("TAMPERED CONTENT");

    const res = await app.request(`/devices/${DEVICE.id}/kiosk/admin/assets/index-abc.js`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Asset integrity check failed");
    expect(body.detail).toContain("Hash mismatch");
  });

  it("passes through admin asset when device version is unknown", async () => {
    const db = createChainedMockDb([[DEVICE]]);
    const app = makeApp(db);
    stubFetchForAdmin(JS_BODY, null);

    const res = await app.request(`/devices/${DEVICE.id}/kiosk/admin/assets/index-abc.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JS_BODY);
  });

  it("passes through admin asset when no manifest exists for version", async () => {
    const db = createChainedMockDb([[DEVICE], [{ adminManifest: null }]]);
    const app = makeApp(db);
    stubFetchForAdmin(JS_BODY);

    const res = await app.request(`/devices/${DEVICE.id}/kiosk/admin/assets/index-abc.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JS_BODY);
  });

  it("passes through admin asset when file not in manifest (SPA fallback)", async () => {
    const db = createChainedMockDb([[DEVICE], [{ adminManifest: MANIFEST }]]);
    const app = makeApp(db);
    stubFetchForAdmin(JS_BODY);

    const res = await app.request(`/devices/${DEVICE.id}/kiosk/admin/some-unknown-route`);
    expect(res.status).toBe(200);
  });
});
