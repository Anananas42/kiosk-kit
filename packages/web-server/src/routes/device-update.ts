import { ReleaseType } from "@kioskkit/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  APP_FETCH_TIMEOUT_MS,
  APP_PUSH_TIMEOUT_MS,
  OTA_FETCH_TIMEOUT_MS,
  OTA_PUSH_TIMEOUT_MS,
} from "../config.js";
import type { Db } from "../db/index.js";
import { deviceUpdateOps, releases } from "../db/schema.js";
import type { AuthEnv } from "../middleware/auth.js";
import { fetchAndStreamToDevice, getAccessibleDevice } from "../services/update-helpers.js";
import { getDeviceUpdateInfo } from "../services/update-info.js";
import { formatOp, getActiveOp, markFailed, markSuccess } from "../trpc/routers/device-update.js";

/**
 * REST route for streaming asset push — cannot be a tRPC procedure because
 * it fetches a binary asset from upstream and streams it to the device.
 *
 *   POST /:id/update/push
 */
export function deviceUpdateRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  app.post("/:id/update/push", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const activeOp = await getActiveOp(db, device.id);
    if (activeOp) {
      return c.json({ error: "Operation already in progress", operation: formatOp(activeOp) }, 409);
    }

    const info = await getDeviceUpdateInfo(db, device);
    if (info.type === "up_to_date") {
      return c.json({ upToDate: true });
    }

    const targetVersion = info.targetVersion!;

    const [release] = await db.select().from(releases).where(eq(releases.version, targetVersion));
    if (!release) {
      return c.json({ error: "Target release not found" }, 404);
    }

    const isFull = info.type === "full";
    const updateType = isFull ? ("full" as const) : ("live" as const);

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

  return app;
}
