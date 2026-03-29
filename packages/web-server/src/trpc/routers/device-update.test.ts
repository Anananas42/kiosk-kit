import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import type { TrpcContext } from "../context.js";
import { createCallerFactory } from "../trpc.js";
import { deviceUpdateRouter } from "./device-update.js";

type User = typeof users.$inferSelect;

vi.mock("../../services/update-helpers.js", () => ({
  getAccessibleDevice: vi.fn(),
  fetchAndStreamToDevice: vi.fn(),
}));

vi.mock("../../services/update-info.js", () => ({
  getDeviceUpdateInfo: vi.fn(),
}));

vi.mock("../../services/device-network.js", () => ({
  fetchDeviceProxy: vi.fn(),
}));

import { fetchDeviceProxy } from "../../services/device-network.js";
import { getAccessibleDevice } from "../../services/update-helpers.js";
import { getDeviceUpdateInfo } from "../../services/update-info.js";

const createCaller = createCallerFactory(deviceUpdateRouter);

const DEVICE = {
  id: "a0000000-0000-4000-8000-000000000001",
  userId: "admin-1",
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

function createMockDb(opts: {
  activeOp?: unknown | null;
  insertResult?: unknown[];
  lastPushResult?: unknown[];
}) {
  const { activeOp = null, insertResult = [], lastPushResult = [] } = opts;
  let selectCount = 0;

  const updateSetWhere = Object.assign(Promise.resolve([]), {
    returning: vi.fn().mockResolvedValue([]),
  });
  const updateSet = Object.assign(Promise.resolve([]), {
    where: vi.fn().mockReturnValue(updateSetWhere),
  });

  return {
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
      if (selectCount === 1) return makeTerminal(activeOp ? [activeOp] : []);
      return makeTerminal(lastPushResult);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertResult),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnValue(updateSet),
  } as unknown as Db;
}

function callerFor(db: Db) {
  return createCaller({
    db,
    user: adminUser,
    session: { id: "s-1", userId: adminUser.id, expiresAt: new Date() },
  } as TrpcContext);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("devices.updateInfo", () => {
  it("returns update info for device", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(getDeviceUpdateInfo).mockResolvedValue({
      type: "live",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      releaseNotes: "Notes",
      publishedAt: "2026-01-15T00:00:00.000Z",
    });

    const caller = callerFor(createMockDb({}));
    const result = await caller["devices.updateInfo"]({ id: DEVICE.id });

    expect(result.type).toBe("live");
    expect(result.targetVersion).toBe("1.1.0");
  });

  it("throws NOT_FOUND when device not found", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(null);

    const caller = callerFor(createMockDb({}));
    await expect(caller["devices.updateInfo"]({ id: DEVICE.id })).rejects.toThrow(
      "Device not found",
    );
  });
});

describe("devices.updateInstall", () => {
  it("creates install op and calls device", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const lastPush = makeOp({ action: "push", result: "success", version: "1.1.0" });
    const installOp = makeOp({ action: "install", version: "1.1.0" });

    const caller = callerFor(
      createMockDb({ activeOp: null, lastPushResult: [lastPush], insertResult: [installOp] }),
    );
    const result = await caller["devices.updateInstall"]({ id: DEVICE.id });

    expect(result.ok).toBe(true);
    expect(fetchDeviceProxy).toHaveBeenCalledWith(
      DEVICE,
      "/api/trpc/admin.update.install",
      expect.any(Object),
    );
  });

  it("throws CONFLICT when active op exists", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);

    const caller = callerFor(createMockDb({ activeOp: makeOp() }));
    await expect(caller["devices.updateInstall"]({ id: DEVICE.id })).rejects.toThrow(
      "Operation already in progress",
    );
  });

  it("throws BAD_REQUEST when no prior push exists", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);

    const caller = callerFor(createMockDb({ activeOp: null, lastPushResult: [] }));
    await expect(caller["devices.updateInstall"]({ id: DEVICE.id })).rejects.toThrow(
      "No downloaded update to install",
    );
  });

  it("handles device timeout gracefully", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockRejectedValue(new Error("timeout"));

    const lastPush = makeOp({ action: "push", result: "success", version: "1.1.0" });
    const installOp = makeOp({ action: "install" });
    const caller = callerFor(
      createMockDb({ activeOp: null, lastPushResult: [lastPush], insertResult: [installOp] }),
    );
    const result = await caller["devices.updateInstall"]({ id: DEVICE.id });

    expect(result.ok).toBe(true);
  });
});

describe("devices.updateCancel", () => {
  it("cancels active op", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);
    vi.mocked(fetchDeviceProxy).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const caller = callerFor(createMockDb({ activeOp: makeOp() }));
    const result = await caller["devices.updateCancel"]({ id: DEVICE.id });

    expect(result.ok).toBe(true);
    expect(fetchDeviceProxy).toHaveBeenCalledWith(
      DEVICE,
      "/api/trpc/admin.update.cancel",
      expect.any(Object),
    );
  });
});

describe("devices.updateStatus", () => {
  it("returns null when no active op", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);

    const caller = callerFor(createMockDb({ activeOp: null }));
    const result = await caller["devices.updateStatus"]({ id: DEVICE.id });

    expect(result.operation).toBeNull();
  });

  it("returns active operation", async () => {
    vi.mocked(getAccessibleDevice).mockResolvedValue(DEVICE);

    const op = makeOp();
    const caller = callerFor(createMockDb({ activeOp: op }));
    const result = await caller["devices.updateStatus"]({ id: DEVICE.id });

    expect(result.operation).toBeTruthy();
    expect(result.operation!.id).toBe("op-1");
  });
});
