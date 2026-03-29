import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DEVICE_TIMEOUT_MS, UPDATE_STALE_OP_MS } from "../config.js";
import type { Db } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import {
  completeOperation,
  failOperation,
  formatOperationResponse,
  getLatestOperation,
  OperationStatus,
  OperationType,
  startOperation,
} from "../services/device-operations.js";
import { getAccessibleDevice } from "../services/update-helpers.js";

export function appUpdateRoutes(db: Db) {
  const app = new Hono<AuthEnv>();

  // POST /api/devices/:id/app/install
  app.post("/:id/app/install", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Check for active app_push — can't install while pushing
    const activePush = await getLatestOperation(db, device.id, OperationType.AppPush);
    if (activePush?.status === OperationStatus.InProgress) {
      return c.json(
        {
          error: "Cannot install while push is in progress",
          operation: formatOperationResponse(activePush),
        },
        409,
      );
    }

    const { operation, isNew } = await startOperation(db, {
      deviceId: device.id,
      type: OperationType.AppInstall,
      staleThresholdMs: UPDATE_STALE_OP_MS,
    });

    if (!isNew) {
      return c.json(
        { error: "Install already in progress", operation: formatOperationResponse(operation) },
        409,
      );
    }

    // Call device tRPC to trigger install — fire and forget
    try {
      await fetchDeviceProxy(device, "/api/trpc/admin.appUpdate.install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });
    } catch {
      // Device may be slow to respond — operation is tracked, client will poll status
    }

    return c.json({ ok: true, operation: formatOperationResponse(operation) });
  });

  // POST /api/devices/:id/app/cancel
  app.post("/:id/app/cancel", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Tell device to cancel upload
    try {
      await fetchDeviceProxy(device, "/api/trpc/admin.appUpdate.cancelUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });
    } catch {
      // Device unreachable — still mark the operation as failed
    }

    // Fail any active app_push operation
    const activePush = await getLatestOperation(db, device.id, OperationType.AppPush);
    if (activePush?.status === OperationStatus.InProgress) {
      await failOperation(db, activePush.id, "Cancelled by user");
    }

    return c.json({ ok: true });
  });

  // POST /api/devices/:id/app/rollback
  app.post("/:id/app/rollback", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const { operation, isNew } = await startOperation(db, {
      deviceId: device.id,
      type: OperationType.AppRollback,
      staleThresholdMs: UPDATE_STALE_OP_MS,
    });

    if (!isNew) {
      return c.json(
        { error: "Rollback already in progress", operation: formatOperationResponse(operation) },
        409,
      );
    }

    try {
      const res = await fetchDeviceProxy(device, "/api/trpc/admin.appUpdate.rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Rollback failed" }))) as {
          error?: string;
        };
        await failOperation(db, operation.id, err.error ?? "Rollback failed");
        return c.json(
          { error: err.error ?? "Rollback failed" },
          res.status as ContentfulStatusCode,
        );
      }

      await completeOperation(db, operation.id);
      return c.json({
        ok: true,
        operation: formatOperationResponse({ ...operation, status: "completed" }),
      });
    } catch {
      await failOperation(db, operation.id, "Device unreachable");
      return c.json({ error: "Device unreachable" }, 502);
    }
  });

  // GET /api/devices/:id/app/status
  app.get("/:id/app/status", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Try to get status from device
    try {
      const res = await fetchDeviceProxy(device, "/api/trpc/admin.appUpdate.status", {
        method: "GET",
        signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      });

      if (res.ok) {
        const data = await res.json();
        return c.json({ source: "device", ...(data as object) });
      }
    } catch {
      // Device unreachable — fall through to server-side lookup
    }

    // Fallback: latest app operation from DB
    const latestPush = await getLatestOperation(db, device.id, OperationType.AppPush);
    const latestInstall = await getLatestOperation(db, device.id, OperationType.AppInstall);

    // Return the most recent operation
    const latest =
      latestPush && latestInstall
        ? latestPush.startedAt > latestInstall.startedAt
          ? latestPush
          : latestInstall
        : (latestPush ?? latestInstall);

    if (!latest) {
      return c.json({ source: "server", status: "none" });
    }

    return c.json({ source: "server", operation: formatOperationResponse(latest) });
  });

  // PATCH /api/devices/:id/app/complete
  app.patch("/:id/app/complete", async (c) => {
    const user = c.get("user");
    const deviceId = c.req.param("id");

    const body = (await c.req.json()) as { result?: string; error?: string };
    if (!body.result || !["completed", "failed"].includes(body.result)) {
      return c.json({ error: "result must be 'completed' or 'failed'" }, 400);
    }

    const device = await getAccessibleDevice(db, deviceId, user.id, user.role);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const latest = await getLatestOperation(db, device.id, OperationType.AppInstall);
    if (!latest || latest.status !== OperationStatus.InProgress) {
      return c.json({ error: "No in-progress install operation found" }, 404);
    }

    if (body.result === "completed") {
      await completeOperation(db, latest.id);
    } else {
      await failOperation(db, latest.id, body.error ?? "Installation failed");
    }

    return c.json({ ok: true });
  });

  return app;
}
