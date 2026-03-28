import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { OtaResult, OtaStep } from "@kioskkit/shared";
import { Hono } from "hono";
import { writeStateFile } from "./lib/update-helpers.js";

const STATE_DIR = "/data/ota";
const PENDING_DIR = "/data/ota/pending";
const STATE_FILE = "/data/ota/state.json";
const ROOTFS_IMAGE = "/data/ota/pending/rootfs.img.zst";
const PROGRESS_FILE = "/data/ota/pending/progress.json";

interface OtaStateJson {
  status?: string;
  lastUpdate?: string;
  lastResult?: string;
}

/**
 * POST /api/ota/upload — accepts a pushed OTA image from the web-server.
 *
 * The web-server (master) streams the binary image to the device over Tailscale.
 * The device never initiates outbound connections.
 *
 * Required headers:
 *   X-OTA-Version  — semantic version string
 *   X-OTA-SHA256   — expected sha256 hex digest (64 chars)
 *   Content-Length  — total size in bytes
 */
export function otaUploadRoute() {
  const app = new Hono();

  app.post("/", async (c) => {
    const version = c.req.header("X-OTA-Version");
    const sha256 = c.req.header("X-OTA-SHA256");
    const contentLength = c.req.header("Content-Length");

    if (!version || !sha256 || !contentLength) {
      return c.json(
        { error: "Missing required headers: X-OTA-Version, X-OTA-SHA256, Content-Length" },
        400,
      );
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return c.json({ error: "Invalid X-OTA-SHA256: must be 64 hex characters" }, 400);
    }

    const bytesTotal = Number(contentLength);
    if (!Number.isFinite(bytesTotal) || bytesTotal <= 0) {
      return c.json({ error: "Invalid Content-Length" }, 400);
    }

    const body = c.req.raw.body;
    if (!body) {
      return c.json({ error: "Empty request body" }, 400);
    }

    // Check for concurrent upload or active operation
    let currentState: OtaStateJson | null = null;
    try {
      const raw = await readFile(STATE_FILE, "utf-8");
      currentState = JSON.parse(raw) as OtaStateJson;
    } catch {
      // No state file — fresh device
    }

    if (
      currentState?.status === OtaStep.Uploading ||
      currentState?.status === OtaStep.Installing ||
      currentState?.status === OtaStep.Rollback
    ) {
      return c.json({ error: "An operation is already in progress" }, 409);
    }

    await mkdir(PENDING_DIR, { recursive: true });

    // Write initial uploading state
    const stateBase = {
      lastUpdate: currentState?.lastUpdate ?? null,
      lastResult: currentState?.lastResult ?? null,
    };
    await writeState({ status: OtaStep.Uploading, version, ...stateBase });

    // Stream body to disk while computing SHA256
    const hash = createHash("sha256");
    let bytesReceived = 0;

    try {
      const fileStream = createWriteStream(ROOTFS_IMAGE);
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

      // Verify checksum
      const actualSha256 = hash.digest("hex");
      if (actualSha256 !== sha256) {
        await rm(PENDING_DIR, { recursive: true, force: true });
        await writeState({
          status: OtaStep.Idle,
          ...stateBase,
          lastUpdate: new Date().toISOString(),
          lastResult: OtaResult.FailedUpload,
        });
        return c.json({ error: `Checksum mismatch: expected ${sha256}, got ${actualSha256}` }, 422);
      }

      // Success — mark as downloaded (ready for install)
      await writeState({
        status: OtaStep.Downloaded,
        version,
        ...stateBase,
        lastUpdate: new Date().toISOString(),
      });

      return c.json({ ok: true, bytesReceived });
    } catch (err) {
      await rm(PENDING_DIR, { recursive: true, force: true }).catch(() => {});
      // Re-read state before writing — cancelUpload may have already reset it to idle.
      let latestState: OtaStateJson | null = null;
      try {
        const raw = await readFile(STATE_FILE, "utf-8");
        latestState = JSON.parse(raw) as OtaStateJson;
      } catch {
        // State file missing or corrupt — safe to write
      }
      if (latestState?.status === OtaStep.Uploading) {
        await writeState({
          status: OtaStep.Idle,
          ...stateBase,
          lastUpdate: new Date().toISOString(),
          lastResult: OtaResult.FailedUpload,
        });
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      return c.json({ error: message }, 500);
    }
  });

  return app;
}

async function writeState(state: object): Promise<void> {
  await writeStateFile(STATE_DIR, STATE_FILE, state);
}
