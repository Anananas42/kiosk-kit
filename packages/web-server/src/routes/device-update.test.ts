import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { deviceUpdateRoutes } from "./device-update.js";

type User = typeof users.$inferSelect;

// Mock dependencies
vi.mock("../services/update-helpers.js", () => ({
  getAccessibleDevice: vi.fn(),
  fetchAndStreamToDevice: vi.fn(),
}));

vi.mock("../services/update-info.js", () => ({
  getDeviceUpdateInfo: vi.fn(),
}));

vi.mock("../services/device-network.js", () => ({
  fetchDeviceProxy: vi.fn(),
}));

import { fetchDeviceProxy } from "../services/device-network.js";
import { fetchAndStreamToDevice, getAccessibleDevice } from "../services/update-helpers.js";
import { getDeviceUpdateInfo } from "../services/update-info.js";

const DEVICE = {
  id: "device-1",
  userId: "user-1",
  name: "Test Kiosk",
  tailscaleIp: "100.64.1.5",
  tailscaleNodeId: "node-1",
  hostname: "kiosk-1",
  pairingCode: null,
  backupIntervalHours: 2,
  maxRetainedBackups: 30,
  lastSeen: null,
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

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    deviceId: DEVICE.id,
    updateType: "live",
    action: "push",
    version: "1.1.0",
    startedAt: new Date(),
    finishedAt: null,
    result: "pending",
    triggeredBy: adminUser.id,
    ...overrides,
  };
}

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    version: "1.1.0",
    releaseType: "ota",
    otaAssetUrl: null,
    otaSha256: null,
    appAssetUrl: "https://example.com/app.zip",
    appSha256: "abc123",
    releaseNotes: "Notes",
    isPublished: true,
    isArchived: false,
    publishedBy: "user-1",
    publishedAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  };
}

/**
 * Mock DB for route tests. Tracks different chains:
 * - getActiveOp: select from deviceUpdateOps where finishedAt IS NULL
 * - insert: for creating ops
 * - select from releases: for looking up target release
 * - select from deviceUpdateOps (last push): for install route
 * - update: for marking ops success/failed
 */
function createMockDb(opts: {
  activeOp?: unknown | null;
  insertResult?: unknown[];
  releaseResult?: unknown[];
  lastPushResult?: unknown[];
}) {
  const { activeOp = null, insertResult = [], releaseResult = [], lastPushResult = [] } = opts;

  let selectCount = 0;

  const updateSetWhere = Object.assign(Promise.resolve([]), {
    returning: vi.fn().mockResolvedValue([]),
  });
  const updateSet = Object.assign(Promise.resolve([]), {
    where: vi.fn().mockReturnValue(updateSetWhere),
  });

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation(() => {
      selectCount++;
      const makeTerminal = (result: unknown[]) => {
        const limitFn = vi.fn().mockResolvedValue(result);
        const orderByResult = Object.assign(Promise.resolve(result), { limit: limitFn });
        const whereResult = Object.assign(Promise.resolve(result), {
          orderBy: vi.fn().mockReturnValue(orderByResult),
          limit: limitFn,
        });
        return {
          where: vi.fn().mockReturnValue(whereResult),
          orderBy: vi.fn().mockReturnValue(orderByResult),
        };
      };

      if (selectCount === 1) {
        // First select: getActiveOp
        return makeTerminal(activeOp ? [activeOp] : []);
      }
      if (selectCount === 2) {
        // Second select: release lookup or last push lookup
        return makeTerminal(releaseResult.length > 0 ? releaseResult : lastPushResult);
      }
      // Third+: last push result
      return makeTerminal(lastPushResult);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertResult),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnValue(updateSet),
  };

  return db as unknown as Db;
}

function makeApp(db: Db, user: User = adminUser) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  app.route("/devices", deviceUpdateRoutes(db));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /devices/:id/update/info", () => {
  it("returns 404 when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/info");

    expect(res.status).toBe(404);
  });

  it("returns update info for device", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(getDeviceUpdateInfo).mockResolvedValue({
      type: "live",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      releaseNotes: "Notes",
      publishedAt: "2026-01-15T00:00:00.000Z",
    });
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/info");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ type: "live", targetVersion: "1.1.0" });
  });
});

describe("POST /devices/:id/update/push", () => {
  it("returns 404 when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/push", { method: "POST" });

    expect(res.status).toBe(404);
  });

  it("returns 409 when active op exists", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    const app = makeApp(createMockDb({ activeOp: makeOp() }));

    const res = await app.request("/devices/device-1/update/push", { method: "POST" });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe("Operation already in progress");
  });

  it("returns upToDate when device is current", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(getDeviceUpdateInfo).mockResolvedValue({
      type: "up_to_date",
      currentVersion: "1.0.0",
    });
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/push", { method: "POST" });
    const body = (await res.json()) as { upToDate: boolean };

    expect(res.status).toBe(200);
    expect(body.upToDate).toBe(true);
  });

  it("pushes live update and returns success", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(getDeviceUpdateInfo).mockResolvedValue({
      type: "live",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      releaseNotes: "Notes",
      publishedAt: "2026-01-15T00:00:00.000Z",
    });
    vi.mocked(fetchAndStreamToDevice).mockResolvedValue({
      ok: true,
      response: new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });

    const release = makeRelease({ version: "1.1.0" });
    const newOp = makeOp({ version: "1.1.0" });

    const app = makeApp(
      createMockDb({
        activeOp: null,
        releaseResult: [release],
        insertResult: [newOp],
      }),
    );

    const res = await app.request("/devices/device-1/update/push", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchAndStreamToDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "1.1.0",
        deviceEndpoint: "/api/app/upload",
      }),
    );
  });

  it("returns 502 when upstream fetch fails", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(getDeviceUpdateInfo).mockResolvedValue({
      type: "live",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      releaseNotes: null,
      publishedAt: "2026-01-15T00:00:00.000Z",
    });
    vi.mocked(fetchAndStreamToDevice).mockResolvedValue({
      ok: false,
      error: "Failed to fetch image from upstream",
      status: 502,
    });

    const release = makeRelease({ version: "1.1.0" });
    const newOp = makeOp({ version: "1.1.0" });

    const app = makeApp(
      createMockDb({
        activeOp: null,
        releaseResult: [release],
        insertResult: [newOp],
      }),
    );

    const res = await app.request("/devices/device-1/update/push", { method: "POST" });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toBe("Failed to fetch image from upstream");
  });
});

describe("POST /devices/:id/update/install", () => {
  it("returns 404 when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/install", { method: "POST" });

    expect(res.status).toBe(404);
  });

  it("returns 409 when active op exists", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    const app = makeApp(createMockDb({ activeOp: makeOp() }));

    const res = await app.request("/devices/device-1/update/install", { method: "POST" });

    expect(res.status).toBe(409);
  });

  it("creates install op and calls device", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const lastPush = makeOp({ action: "push", result: "success", version: "1.1.0" });
    const installOp = makeOp({ action: "install", version: "1.1.0" });

    const app = makeApp(
      createMockDb({
        activeOp: null,
        lastPushResult: [lastPush],
        insertResult: [installOp],
      }),
    );

    const res = await app.request("/devices/device-1/update/install", { method: "POST" });
    const body = (await res.json()) as { ok: boolean; operation: { action: string } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchDeviceProxy).toHaveBeenCalledWith(
      DEVICE,
      "/api/trpc/admin.update.install",
      expect.any(Object),
    );
  });

  it("handles device timeout gracefully (leaves op as pending)", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockRejectedValue(new Error("timeout"));

    const installOp = makeOp({ action: "install" });

    const app = makeApp(
      createMockDb({
        activeOp: null,
        lastPushResult: [],
        insertResult: [installOp],
      }),
    );

    const res = await app.request("/devices/device-1/update/install", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe("POST /devices/:id/update/cancel", () => {
  it("returns 404 when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/cancel", { method: "POST" });

    expect(res.status).toBe(404);
  });

  it("cancels active op and calls device", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const activeOp = makeOp();

    const app = makeApp(createMockDb({ activeOp }));

    const res = await app.request("/devices/device-1/update/cancel", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchDeviceProxy).toHaveBeenCalledWith(
      DEVICE,
      "/api/trpc/admin.update.cancel",
      expect.any(Object),
    );
  });

  it("handles unreachable device gracefully", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockRejectedValue(new Error("timeout"));

    const app = makeApp(createMockDb({ activeOp: makeOp() }));

    const res = await app.request("/devices/device-1/update/cancel", { method: "POST" });

    expect(res.status).toBe(200);
  });
});

describe("GET /devices/:id/update/status", () => {
  it("returns 404 when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);
    const app = makeApp(createMockDb({}));

    const res = await app.request("/devices/device-1/update/status");

    expect(res.status).toBe(404);
  });

  it("returns null when no active op", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    const app = makeApp(createMockDb({ activeOp: null }));

    const res = await app.request("/devices/device-1/update/status");
    const body = (await res.json()) as { operation: null };

    expect(res.status).toBe(200);
    expect(body.operation).toBeNull();
  });

  it("returns active operation", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    const op = makeOp();
    const app = makeApp(createMockDb({ activeOp: op }));

    const res = await app.request("/devices/device-1/update/status");
    const body = (await res.json()) as { operation: { id: string; version: string } };

    expect(res.status).toBe(200);
    expect(body.operation).toBeTruthy();
    expect(body.operation.id).toBe("op-1");
    expect(body.operation.version).toBe("1.1.0");
  });
});
