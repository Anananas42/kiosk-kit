import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { AppUpdateResult, AppUpdateStep } from "@kioskkit/shared";
import { Hono } from "hono";
import {
  APP_UPDATE_BUNDLE_FILE,
  APP_UPDATE_PENDING_DIR,
  APP_UPDATE_PROGRESS_FILE,
  APP_UPDATE_STATE_DIR,
  APP_UPDATE_STATE_FILE,
  APP_UPDATE_VERSION_FILE,
  MAX_BUNDLE_SIZE,
} from "./lib/app-update-constants.js";
import { isActiveOperation, writeStateFile } from "./lib/app-update-helpers.js";

interface UploadStateJson {
  status?: string;
  lastUpdate?: string;
  lastResult?: string;
}

function validateUploadHeaders(
  version: string | undefined,
  sha256: string | undefined,
  contentLength: string | undefined,
): { error: string; status: 400 | 413 } | { version: string; sha256: string; bytesTotal: number } {
  if (!version || !sha256 || !contentLength) {
    return {
      error: "Missing required headers: X-App-Version, X-SHA256, Content-Length",
      status: 400,
    };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,127}$/.test(version)) {
    return {
      error: "Invalid X-App-Version: alphanumeric, dots, hyphens only, max 128 chars",
      status: 400,
    };
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    return { error: "Invalid X-SHA256: must be 64 hex characters", status: 400 };
  }
  const bytesTotal = Number(contentLength);
  if (!Number.isFinite(bytesTotal) || bytesTotal <= 0) {
    return { error: "Invalid Content-Length", status: 400 };
  }
  if (bytesTotal > MAX_BUNDLE_SIZE) {
    return {
      error: `Bundle too large: ${bytesTotal} bytes exceeds ${MAX_BUNDLE_SIZE} byte limit`,
      status: 413,
    };
  }
  return { version, sha256, bytesTotal };
}

/**
 * POST /api/app/upload — accepts a pushed app bundle from the web-server.
 *
 * The web-server (master) streams the binary bundle to the device over Tailscale.
 * The device never initiates outbound connections.
 *
 * Required headers:
 *   X-App-Version  — version string
 *   X-SHA256       — expected sha256 hex digest (64 chars)
 *   Content-Length  — total size in bytes
 */
export function appUploadRoute() {
  const app = new Hono();

  app.post("/", async (c) => {
    const validation = validateUploadHeaders(
      c.req.header("X-App-Version"),
      c.req.header("X-SHA256"),
      c.req.header("Content-Length"),
    );
    if ("error" in validation) {
      return c.json({ error: validation.error }, validation.status);
    }
    const { version, sha256, bytesTotal } = validation;

    const body = c.req.raw.body;
    if (!body) {
      return c.json({ error: "Empty request body" }, 400);
    }

    // Check for concurrent upload or active operation
    let currentState: UploadStateJson | null = null;
    try {
      const raw = await readFile(APP_UPDATE_STATE_FILE, "utf-8");
      currentState = JSON.parse(raw) as UploadStateJson;
    } catch {
      // No state file — fresh device
    }

    if (isActiveOperation(currentState?.status)) {
      return c.json({ error: "An operation is already in progress" }, 409);
    }

    await mkdir(APP_UPDATE_PENDING_DIR, { recursive: true });

    // Write initial uploading state
    const stateBase = {
      lastUpdate: currentState?.lastUpdate ?? null,
      lastResult: currentState?.lastResult ?? null,
    };
    await writeState({ status: AppUpdateStep.Uploading, version, ...stateBase });

    // Stream body to disk while computing SHA256
    const hash = createHash("sha256");
    let bytesReceived = 0;

    try {
      const fileStream = createWriteStream(APP_UPDATE_BUNDLE_FILE);
      const writer = Writable.toWeb(fileStream);

      const progressInterval = setInterval(async () => {
        try {
          await writeFile(
            APP_UPDATE_PROGRESS_FILE,
            JSON.stringify({
              version,
              progress: bytesTotal > 0 ? Math.round((bytesReceived / bytesTotal) * 100) : 0,
              bytesReceived,
              bytesTotal,
            }),
          );
        } catch {
          // Progress tracking is best-effort
        }
      }, 1000);

      // Pipe through hash and to file
      const reader = body.getReader();
      const writable = writer.getWriter();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          hash.update(value);
          bytesReceived += value.byteLength;
          await writable.write(value);
        }
        await writable.close();
      } finally {
        clearInterval(progressInterval);
      }

      // Write final progress
      await writeFile(
        APP_UPDATE_PROGRESS_FILE,
        JSON.stringify({
          version,
          progress: 100,
          bytesReceived,
          bytesTotal,
        }),
      );

      // Write version file for the install script
      await writeFile(APP_UPDATE_VERSION_FILE, version);

      // Verify checksum
      const actualSha256 = hash.digest("hex");
      if (actualSha256 !== sha256) {
        await rm(APP_UPDATE_PENDING_DIR, { recursive: true, force: true });
        await writeState({
          status: AppUpdateStep.Idle,
          ...stateBase,
          lastUpdate: new Date().toISOString(),
          lastResult: AppUpdateResult.FailedUpload,
        });
        return c.json({ error: `Checksum mismatch: expected ${sha256}, got ${actualSha256}` }, 422);
      }

      // Success — mark as downloaded (ready for install)
      await writeState({
        status: AppUpdateStep.Downloaded,
        version,
        ...stateBase,
        lastUpdate: new Date().toISOString(),
      });

      return c.json({ ok: true, bytesReceived });
    } catch (err) {
      await rm(APP_UPDATE_PENDING_DIR, { recursive: true, force: true }).catch(() => {});
      // Re-read state before writing — cancelUpload may have already reset it to idle.
      // If so, don't overwrite with a stale FailedUpload result.
      let latestState: UploadStateJson | null = null;
      try {
        const raw = await readFile(APP_UPDATE_STATE_FILE, "utf-8");
        latestState = JSON.parse(raw) as UploadStateJson;
      } catch {
        // State file missing or corrupt — safe to write
      }
      if (latestState?.status === AppUpdateStep.Uploading) {
        await writeState({
          status: AppUpdateStep.Idle,
          ...stateBase,
          lastUpdate: new Date().toISOString(),
          lastResult: AppUpdateResult.FailedUpload,
        });
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      return c.json({ error: message }, 500);
    }
  });

  return app;
}

async function writeState(state: object): Promise<void> {
  await writeStateFile(APP_UPDATE_STATE_DIR, APP_UPDATE_STATE_FILE, state);
}
