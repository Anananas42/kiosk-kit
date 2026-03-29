import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  APP_FETCH_TIMEOUT_MS,
  APP_PUSH_TIMEOUT_MS,
  DEVICE_TIMEOUT_MS,
  OTA_FETCH_TIMEOUT_MS,
  OTA_PUSH_TIMEOUT_MS,
} from "../config.js";
import type { Db } from "../db/index.js";
import { deviceUpdateOps, releases } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import { getAccessibleDevice } from "../services/update-helpers.js";
import { getDeviceUpdateInfo } from "../services/update-info.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Unified device update routes:
 *   POST /:id/update/push    — push the correct asset to the device
 *   POST /:id/update/install — trigger install on the device
 *   POST /:id/update/cancel  — cancel an in-progress update
 *   GET  /:id/update/status  — get active operation status
 *   GET  /:id/update/info    — what update does this device need?
 */
export function deviceUpdateRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  // ── GET /:id/update/info ──────────────────────────────────────────
  app.get("/:id/update/info", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const info = await getDeviceUpdateInfo(db, device);
    return c.json(info);
  });

  // ── POST /:id/update/push ─────────────────────────────────────────
  app.post("/:id/update/push", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Check for active op
    const activeOp = await getActiveOp(db, device.id);
    if (activeOp) {
      return c.json({ error: "Operation already in progress", operation: formatOp(activeOp) }, 409);
    }

    // Determine what the device needs
    const info = await getDeviceUpdateInfo(db, device);
    if (info.type === "up_to_date") {
      return c.json({ upToDate: true });
    }

    // Look up the target release
    const [release] = await db
      .select()
      .from(releases)
      .where(eq(releases.version, info.targetVersion!));
    if (!release) {
      return c.json({ error: "Target release not found" }, 404);
    }

    // Insert operation
    const [op] = await db
      .insert(deviceUpdateOps)
      .values({
        deviceId: device.id,
        updateType: info.type as "full" | "live",
        action: "push",
        version: info.targetVersion!,
        triggeredBy: user.id,
      })
      .returning();

    // Determine asset details based on update type
    const isFull = info.type === "full";
    const assetUrl = isFull ? release.otaAssetUrl : release.appAssetUrl;
    const sha256 = isFull ? release.otaSha256 : release.appSha256;
    const deviceEndpoint = isFull ? "/api/ota/upload" : "/api/app/upload";
    const versionHeader: Record<string, string> = isFull
      ? { "X-OTA-Version": info.targetVersion!, "X-OTA-SHA256": sha256 ?? "" }
      : { "X-App-Version": info.targetVersion!, "X-SHA256": sha256 ?? "" };
    const fetchTimeout = isFull ? OTA_FETCH_TIMEOUT_MS : APP_FETCH_TIMEOUT_MS;
    const pushTimeout = isFull ? OTA_PUSH_TIMEOUT_MS : APP_PUSH_TIMEOUT_MS;

    if (!assetUrl) {
      await markFailed(db, op!.id, "Release has no asset URL");
      return c.json({ error: "Release has no asset URL" }, 404);
    }

    // Fetch asset from upstream
    let upstream: Response;
    try {
      upstream = await fetch(assetUrl, {
        signal: AbortSignal.timeout(fetchTimeout),
        headers: { Accept: "application/octet-stream" },
      });
    } catch {
      await markFailed(db, op!.id, "Failed to fetch asset from upstream");
      return c.json({ error: "Failed to fetch asset from upstream" }, 502);
    }

    if (!upstream.ok) {
      await markFailed(db, op!.id, "Failed to fetch asset from upstream");
      return c.json({ error: "Failed to fetch asset from upstream" }, 502);
    }

    const contentLength = upstream.headers.get("content-length");
    if (!contentLength) {
      await markFailed(db, op!.id, "Upstream did not provide Content-Length");
      return c.json({ error: "Upstream did not provide Content-Length" }, 502);
    }

    // Stream to device
    try {
      const deviceHeaders: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        "Content-Length": contentLength,
        ...versionHeader,
      };

      const pushRes = await fetchDeviceProxy(device, deviceEndpoint, {
        method: "POST",
        headers: deviceHeaders,
        body: upstream.body,
        signal: AbortSignal.timeout(pushTimeout),
        // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
        duplex: "half",
      });

      if (!pushRes.ok) {
        const err = (await pushRes.json().catch(() => ({ error: "Push failed" }))) as {
          error?: string;
        };
        const errorMsg = err.error ?? "Push failed";
        await markFailed(db, op!.id, errorMsg);
        return c.json({ error: errorMsg }, pushRes.status as ContentfulStatusCode);
      }
    } catch {
      await markFailed(db, op!.id, "Device unreachable during push");
      return c.json({ error: "Device unreachable during push" }, 502);
    }

    await markSuccess(db, op!.id);
    return c.json({
      ok: true,
      operation: formatOp({ ...op!, result: "success", finishedAt: new Date() }),
    });
  });

  // ── POST /:id/update/install ──────────────────────────────────────
  app.post("/:id/update/install", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Check for active op
    const activeOp = await getActiveOp(db, device.id);
    if (activeOp) {
      return c.json({ error: "Operation already in progress", operation: formatOp(activeOp) }, 409);
    }

    // Insert op — we don't know the exact version here, use the last push op's version
    const [lastPush] = await db
      .select()
      .from(deviceUpdateOps)
      .where(
        and(
          eq(deviceUpdateOps.deviceId, device.id),
          eq(deviceUpdateOps.action, "push"),
          eq(deviceUpdateOps.result, "success"),
        ),
      )
      .orderBy(desc(deviceUpdateOps.startedAt))
      .limit(1);

    const version = lastPush?.version ?? "unknown";
    const updateType = lastPush?.updateType ?? "live";

    const [op] = await db
      .insert(deviceUpdateOps)
      .values({
        deviceId: device.id,
        updateType,
        action: "install",
        version,
        triggeredBy: user.id,
      })
      .returning();

    // Call device install endpoint — may timeout for live updates (service restarts)
    try {
      await fetchDeviceProxy(device, "/api/trpc/admin.update.install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });

      // If we got a response, mark success
      await markSuccess(db, op!.id);
    } catch {
      // Timeout or unreachable — leave as pending, frontend will poll status
    }

    return c.json({ ok: true, operation: formatOp(op!) });
  });

  // ── POST /:id/update/cancel ───────────────────────────────────────
  app.post("/:id/update/cancel", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Tell device to cancel
    try {
      await fetchDeviceProxy(device, "/api/trpc/admin.update.cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });
    } catch {
      // Device unreachable — still mark the op as failed
    }

    // Mark active op as failed
    const activeOp = await getActiveOp(db, device.id);
    if (activeOp) {
      await markFailed(db, activeOp.id, "Cancelled by user");
    }

    return c.json({ ok: true });
  });

  // ── GET /:id/update/status ────────────────────────────────────────
  app.get("/:id/update/status", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const activeOp = await getActiveOp(db, device.id);
    if (!activeOp) {
      return c.json({ operation: null });
    }

    return c.json({ operation: formatOp(activeOp) });
  });

  return app;
}

// ── Helpers ─────────────────────────────────────────────────────────

type UpdateOp = typeof deviceUpdateOps.$inferSelect;

async function getActiveOp(db: Db, deviceId: string): Promise<UpdateOp | null> {
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);

  const [op] = await db
    .select()
    .from(deviceUpdateOps)
    .where(and(eq(deviceUpdateOps.deviceId, deviceId), isNull(deviceUpdateOps.finishedAt)))
    .orderBy(desc(deviceUpdateOps.startedAt))
    .limit(1);

  if (!op) return null;

  // If started more than 1 hour ago, mark as stale and return null
  if (op.startedAt < cutoff) {
    await markFailed(db, op.id, "Operation timed out");
    return null;
  }

  return op;
}

async function markSuccess(db: Db, opId: string) {
  await db
    .update(deviceUpdateOps)
    .set({ finishedAt: new Date(), result: "success" })
    .where(eq(deviceUpdateOps.id, opId));
}

async function markFailed(db: Db, opId: string, _error: string) {
  await db
    .update(deviceUpdateOps)
    .set({ finishedAt: new Date(), result: "failed" })
    .where(eq(deviceUpdateOps.id, opId));
}

function formatOp(op: UpdateOp) {
  return {
    id: op.id,
    deviceId: op.deviceId,
    updateType: op.updateType,
    action: op.action,
    version: op.version,
    result: op.result,
    startedAt: op.startedAt.toISOString(),
    finishedAt: op.finishedAt?.toISOString() ?? null,
  };
}
