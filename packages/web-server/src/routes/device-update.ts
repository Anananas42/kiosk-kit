import { ReleaseType } from "@kioskkit/shared";
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
import { fetchAndStreamToDevice, getAccessibleDevice } from "../services/update-helpers.js";
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

    const targetVersion = info.targetVersion!;

    // Look up the target release to get asset URLs
    const [release] = await db.select().from(releases).where(eq(releases.version, targetVersion));
    if (!release) {
      return c.json({ error: "Target release not found" }, 404);
    }

    const isFull = info.type === "full";
    const updateType = isFull ? ("full" as const) : ("live" as const);

    // Insert operation
    const [op] = await db
      .insert(deviceUpdateOps)
      .values({
        deviceId: device.id,
        updateType,
        action: "push",
        version: targetVersion,
        triggeredBy: user.id,
      })
      .returning();

    if (!op) {
      return c.json({ error: "Failed to create operation" }, 500);
    }

    // Delegate to shared fetch-and-stream helper
    const assetUrl = isFull ? release.otaAssetUrl : release.appAssetUrl;
    const sha256 = isFull ? release.otaSha256 : release.appSha256;
    const result = await fetchAndStreamToDevice({
      db,
      device,
      version: targetVersion,
      releaseType: isFull ? ReleaseType.Ota : ReleaseType.App,
      deviceEndpoint: isFull ? "/api/ota/upload" : "/api/app/upload",
      headers: isFull
        ? { "X-OTA-Version": targetVersion, "X-OTA-SHA256": "__SHA256__" }
        : { "X-App-Version": targetVersion, "X-SHA256": "__SHA256__" },
      fetchTimeout: isFull ? OTA_FETCH_TIMEOUT_MS : APP_FETCH_TIMEOUT_MS,
      pushTimeout: isFull ? OTA_PUSH_TIMEOUT_MS : APP_PUSH_TIMEOUT_MS,
      assetUrl: assetUrl ?? undefined,
      sha256,
    });

    if (!result.ok) {
      await markFailed(db, op.id, result.error);
      return c.json({ error: result.error }, result.status as ContentfulStatusCode);
    }

    if (!result.response.ok) {
      const err = (await result.response.json().catch(() => ({ error: "Push failed" }))) as {
        error?: string;
      };
      const errorMsg = err.error ?? "Push failed";
      await markFailed(db, op.id, errorMsg);
      return c.json({ error: errorMsg }, result.response.status as ContentfulStatusCode);
    }

    await markSuccess(db, op.id);
    return c.json({
      ok: true,
      operation: formatOp({ ...op, result: "success", finishedAt: new Date() }),
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

    if (!op) {
      return c.json({ error: "Failed to create operation" }, 500);
    }

    // Call device install endpoint — may timeout for live updates (service restarts)
    try {
      await fetchDeviceProxy(device, "/api/trpc/admin.update.install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });

      // If we got a response, mark success
      await markSuccess(db, op.id);
    } catch (err) {
      // Timeout or unreachable — leave as pending, frontend will poll status
      console.warn("Install call failed for device %s: %s", device.id, err);
    }

    return c.json({ ok: true, operation: formatOp(op) });
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
      // Device unreachable — still mark the op as failed below
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

async function markFailed(db: Db, opId: string, error: string) {
  console.warn("Update operation %s failed: %s", opId, error);
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
