import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { AppUpdateResult, AppUpdateStep } from "@kioskkit/shared";
import { Hono } from "hono";

const PENDING_DIR = "/data/app-update/pending";
const STATE_FILE = "/data/app-update/state.json";
const BUNDLE_FILE = "/data/app-update/pending/app-bundle.tar.gz";
const PROGRESS_FILE = "/data/app-update/pending/progress.json";
const VERSION_FILE = "/data/app-update/pending/version";

interface UploadStateJson {
  status?: string;
  lastUpdate?: string;
  lastResult?: string;
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
    const version = c.req.header("X-App-Version");
    const sha256 = c.req.header("X-SHA256");
    const contentLength = c.req.header("Content-Length");

    if (!version || !sha256 || !contentLength) {
      return c.json(
        { error: "Missing required headers: X-App-Version, X-SHA256, Content-Length" },
        400,
      );
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,127}$/.test(version)) {
      return c.json(
        { error: "Invalid X-App-Version: alphanumeric, dots, hyphens only, max 128 chars" },
        400,
      );
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return c.json({ error: "Invalid X-SHA256: must be 64 hex characters" }, 400);
    }

    const bytesTotal = Number(contentLength);
    if (!Number.isFinite(bytesTotal) || bytesTotal <= 0) {
      return c.json({ error: "Invalid Content-Length" }, 400);
    }

    const body = c.req.raw.body;
    if (!body) {
      return c.json({ error: "Empty request body" }, 400);
    }

    // Check for concurrent upload
    let currentState: UploadStateJson | null = null;
    try {
      const raw = await readFile(STATE_FILE, "utf-8");
      currentState = JSON.parse(raw) as UploadStateJson;
    } catch {
      // No state file — fresh device
    }

    if (
      currentState?.status === AppUpdateStep.Uploading ||
      currentState?.status === AppUpdateStep.Installing ||
      currentState?.status === AppUpdateStep.RollingBack
    ) {
      return c.json({ error: "An operation is already in progress" }, 409);
    }

    await mkdir(PENDING_DIR, { recursive: true });

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
      const fileStream = createWriteStream(BUNDLE_FILE);
      const writer = Writable.toWeb(fileStream);

      const progressInterval = setInterval(async () => {
        try {
          await writeFile(
            PROGRESS_FILE,
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
        PROGRESS_FILE,
        JSON.stringify({
          version,
          progress: 100,
          bytesReceived,
          bytesTotal,
        }),
      );

      // Write version file for the install script
      await writeFile(VERSION_FILE, version);

      // Verify checksum
      const actualSha256 = hash.digest("hex");
      if (actualSha256 !== sha256) {
        await rm(PENDING_DIR, { recursive: true, force: true });
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
      await rm(PENDING_DIR, { recursive: true, force: true }).catch(() => {});
      // Re-read state before writing — cancelUpload may have already reset it to idle.
      // If so, don't overwrite with a stale FailedUpload result.
      let latestState: UploadStateJson | null = null;
      try {
        const raw = await readFile(STATE_FILE, "utf-8");
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

async function writeState(state: Record<string, unknown>): Promise<void> {
  await mkdir("/data/app-update", { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}
