import { ReleaseType } from "@kioskkit/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { OTA_FETCH_TIMEOUT_MS, OTA_PUSH_TIMEOUT_MS, UPDATE_STALE_OP_MS } from "../config.js";
import type { Db } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import {
  completeOperation,
  failOperation,
  formatOperationResponse,
  OperationStatus,
  OperationType,
  startOperation,
} from "../services/device-operations.js";
import { fetchAndStreamToDevice, getAccessibleDevice } from "../services/update-helpers.js";

/**
 * POST /api/devices/:id/ota/push — trigger OTA image push to a device.
 *
 * Body: { version: string }
 *
 * Fetches the image from GitHub and streams it to the device's upload endpoint.
 * Only admins and device owners can trigger this.
 */
export function otaPushRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  app.post("/:id/ota/push", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const body = (await c.req.json()) as { version?: string };
    if (!body.version) {
      return c.json({ error: "version is required" }, 400);
    }

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Start operation — returns existing if one is already in progress
    const { operation, isNew } = await startOperation(db, {
      deviceId: device.id,
      type: OperationType.OtaPush,
      staleThresholdMs: UPDATE_STALE_OP_MS,
      metadata: { version: body.version },
    });

    if (!isNew) {
      return c.json(
        { error: "Operation already in progress", operation: formatOperationResponse(operation) },
        409,
      );
    }

    const result = await fetchAndStreamToDevice({
      db,
      device,
      version: body.version,
      releaseType: ReleaseType.Ota,
      deviceEndpoint: "/api/ota/upload",
      headers: {
        "X-OTA-Version": body.version,
        "X-OTA-SHA256": "__SHA256__",
      },
      fetchTimeout: OTA_FETCH_TIMEOUT_MS,
      pushTimeout: OTA_PUSH_TIMEOUT_MS,
    });

    if (!result.ok) {
      await failOperation(db, operation.id, result.error);
      return c.json({ error: result.error }, result.status as ContentfulStatusCode);
    }

    if (!result.response.ok) {
      const err = (await result.response.json().catch(() => ({ error: "Push failed" }))) as {
        error?: string;
      };
      const errorMsg = err.error ?? "Push failed";
      await failOperation(db, operation.id, errorMsg);
      return c.json({ error: errorMsg }, result.response.status as ContentfulStatusCode);
    }

    await completeOperation(db, operation.id);
    return c.json({
      ok: true,
      operation: formatOperationResponse({ ...operation, status: OperationStatus.Completed }),
    });
  });

  return app;
}
