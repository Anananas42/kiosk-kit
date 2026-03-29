import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { otaProxyRoutes } from "./ota-proxy.js";

const RELEASE = {
  id: "r-1",
  version: "v1.0.0",
  otaAssetUrl: "https://github.com/org/repo/releases/download/v1.0.0/rootfs.img.zst",
  otaSha256: "abc123def456",
  appAssetUrl: null,
  appSha256: null,
  releaseNotes: "First release",
  publishedBy: "admin-1",
  publishedAt: new Date("2025-06-01T00:00:00Z"),
};

function createMockDb(releaseResult: unknown[] = [], deviceResult: unknown[] = []) {
  let callCount = 0;
  const makeTerminal = (value: unknown[]) =>
    Object.assign(Promise.resolve(value), {
      returning: vi.fn().mockResolvedValue(value),
    });
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      callCount++;
      // In non-dev mode: first call is device lookup, second is release lookup
      // In dev mode (our tests): first call is release lookup (no device check)
      return makeTerminal(callCount === 1 ? releaseResult : releaseResult);
    }),
  } as unknown as Db;
}

function makeApp(db: Db) {
  const app = new Hono();
  app.route("/api/ota/image", otaProxyRoutes(db));
  return app;
}

describe("OTA image proxy", () => {
  it("streams response with correct headers", async () => {
    const app = makeApp(createMockDb([RELEASE]));
    const imageData = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(imageData, {
          status: 200,
          headers: { "content-length": "4" },
        }),
      ),
    );

    const res = await app.request("/api/ota/image/v1.0.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("X-Checksum-SHA256")).toBe("abc123def456");
    expect(res.headers.get("Content-Length")).toBe("4");

    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(imageData);

    vi.unstubAllGlobals();
  });

  it("returns 404 for unknown version", async () => {
    const app = makeApp(createMockDb([]));
    const res = await app.request("/api/ota/image/v99.0.0");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Version not found" });
  });

  it("returns 502 when upstream fetch fails", async () => {
    const app = makeApp(createMockDb([RELEASE]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const res = await app.request("/api/ota/image/v1.0.0");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to fetch image from upstream" });

    vi.unstubAllGlobals();
  });
});
