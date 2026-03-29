import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { getDeviceUpdateInfo } from "./update-info.js";

// Mock device-network to avoid real network calls
vi.mock("./device-network.js", () => ({
  fetchDeviceProxy: vi.fn(),
}));

import { fetchDeviceProxy } from "./device-network.js";

const DEVICE = { id: "device-1", tailscaleIp: "100.64.1.5" };
const DEVICE_OFFLINE = { id: "device-1", tailscaleIp: null };

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    version: "1.0.0",
    releaseType: "ota",
    otaAssetUrl: null,
    otaSha256: null,
    appAssetUrl: "https://example.com/app.zip",
    appSha256: "abc123",
    releaseNotes: "Release notes",
    isPublished: true,
    isArchived: false,
    publishedBy: "user-1",
    publishedAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  };
}

function makeUpdateOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    deviceId: DEVICE.id,
    updateType: "live",
    action: "install",
    version: "1.0.0",
    startedAt: new Date(),
    finishedAt: new Date(),
    result: "success",
    triggeredBy: "user-1",
    ...overrides,
  };
}

/**
 * Create a mock DB that returns configurable results for each successive
 * select().from() chain. The order of calls in getDeviceUpdateInfo:
 *   1. resolveCurrentVersion → deviceUpdateOps (if device unreachable)
 *   2. releases query
 * OR:
 *   1. releases query (if device is reachable, resolveCurrentVersion doesn't hit DB)
 *   2. (no second call)
 *
 * We use fromResults array: each from() call pops the next result set.
 */
function createMockDb(opts: { fromResults: unknown[][] }) {
  const { fromResults } = opts;
  let callIndex = 0;

  function makeChain(result: unknown[]) {
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
  }

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation(() => {
      const result = fromResults[callIndex] ?? [];
      callIndex++;
      return makeChain(result);
    }),
  };

  return db as unknown as Db;
}

describe("getDeviceUpdateInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns up_to_date when device version matches latest release", async () => {
    vi.mocked(fetchDeviceProxy).mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { currentVersion: "1.0.0" } } })),
    );

    // Device reachable → only releases query
    const db = createMockDb({
      fromResults: [[makeRelease({ version: "1.0.0" })]],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("up_to_date");
    expect(result.currentVersion).toBe("1.0.0");
  });

  it("returns live update when newer app-only releases exist", async () => {
    vi.mocked(fetchDeviceProxy).mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { currentVersion: "1.0.0" } } })),
    );

    const db = createMockDb({
      fromResults: [
        [
          makeRelease({ version: "1.1.0", appAssetUrl: "https://example.com/app-1.1.zip" }),
          makeRelease({ version: "1.0.0" }),
        ],
      ],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("live");
    expect(result.targetVersion).toBe("1.1.0");
  });

  it("returns full update when OTA release exists in range", async () => {
    vi.mocked(fetchDeviceProxy).mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { currentVersion: "1.0.0" } } })),
    );

    const db = createMockDb({
      fromResults: [
        [
          makeRelease({
            version: "2.0.0",
            otaAssetUrl: "https://example.com/ota-2.0.zip",
            appAssetUrl: "https://example.com/app-2.0.zip",
          }),
          makeRelease({ version: "1.0.0" }),
        ],
      ],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("full");
    expect(result.targetVersion).toBe("2.0.0");
  });

  it("returns full update targeting latest OTA even when newer app-only release exists", async () => {
    vi.mocked(fetchDeviceProxy).mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { currentVersion: "1.0.0" } } })),
    );

    const db = createMockDb({
      fromResults: [
        [
          makeRelease({ version: "2.1.0", appAssetUrl: "https://example.com/app-2.1.zip" }),
          makeRelease({
            version: "2.0.0",
            otaAssetUrl: "https://example.com/ota-2.0.zip",
            appAssetUrl: "https://example.com/app-2.0.zip",
          }),
          makeRelease({ version: "1.0.0" }),
        ],
      ],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("full");
    expect(result.targetVersion).toBe("2.0.0");
  });

  it("falls back to last completed op version when device is unreachable", async () => {
    vi.mocked(fetchDeviceProxy).mockRejectedValue(new Error("timeout"));

    // Unreachable → ops query first, then releases query
    const db = createMockDb({
      fromResults: [
        [makeUpdateOp({ version: "1.0.0" })],
        [
          makeRelease({ version: "1.1.0", appAssetUrl: "https://example.com/app-1.1.zip" }),
          makeRelease({ version: "1.0.0" }),
        ],
      ],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("live");
    expect(result.targetVersion).toBe("1.1.0");
    expect(result.currentVersion).toBe("1.0.0");
  });

  it("returns up_to_date when no version is known at all", async () => {
    vi.mocked(fetchDeviceProxy).mockRejectedValue(new Error("timeout"));

    // Unreachable + no ops → ops query returns empty
    const db = createMockDb({
      fromResults: [[]],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE);

    expect(result.type).toBe("up_to_date");
    expect(result.currentVersion).toBeNull();
  });

  it("returns up_to_date when device has no tailscale IP and no op history", async () => {
    // No tailscaleIp → skips fetchDeviceProxy, queries ops → empty
    const db = createMockDb({
      fromResults: [[]],
    });

    const result = await getDeviceUpdateInfo(db, DEVICE_OFFLINE);

    expect(result.type).toBe("up_to_date");
    expect(result.currentVersion).toBeNull();
    expect(fetchDeviceProxy).not.toHaveBeenCalled();
  });
});
