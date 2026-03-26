import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { Hono } from "hono";

const PENDING_DIR = "/data/ota/pending";
const STATE_FILE = "/data/ota/state.json";
const ROOTFS_IMAGE = "/data/ota/pending/rootfs.img.zst";
const PROGRESS_FILE = "/data/ota/pending/progress.json";

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

    // Check for concurrent upload
    let currentState: { status?: string } | null = null;
    try {
      const raw = await readFile(STATE_FILE, "utf-8");
      currentState = JSON.parse(raw) as { status?: string };
    } catch {
      // No state file — fresh device
    }

    if (currentState?.status === "uploading") {
      return c.json({ error: "An upload is already in progress" }, 409);
    }

    await mkdir(PENDING_DIR, { recursive: true });

    // Write initial uploading state
    const stateBase = {
      lastUpdate: (currentState as Record<string, unknown>)?.lastUpdate ?? null,
      lastResult: (currentState as Record<string, unknown>)?.lastResult ?? null,
    };
    await writeState({ status: "uploading", version, ...stateBase });

    // Stream body to disk while computing SHA256
    const hash = createHash("sha256");
    let bytesReceived = 0;

    const body = c.req.raw.body;
    if (!body) {
      await writeState({ status: "idle", ...stateBase });
      return c.json({ error: "Empty request body" }, 400);
    }

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
          status: "idle",
          ...stateBase,
          lastUpdate: new Date().toISOString(),
          lastResult: "failed_upload",
        });
        return c.json({ error: `Checksum mismatch: expected ${sha256}, got ${actualSha256}` }, 422);
      }

      // Success — mark as downloaded (ready for install)
      await writeState({
        status: "downloaded",
        version,
        ...stateBase,
        lastUpdate: new Date().toISOString(),
      });

      return c.json({ ok: true, bytesReceived });
    } catch (err) {
      await rm(PENDING_DIR, { recursive: true, force: true }).catch(() => {});
      await writeState({
        status: "idle",
        ...stateBase,
        lastUpdate: new Date().toISOString(),
        lastResult: "failed_upload",
      });
      const message = err instanceof Error ? err.message : "Upload failed";
      return c.json({ error: message }, 500);
    }
  });

  return app;
}

async function writeState(state: Record<string, unknown>): Promise<void> {
  await mkdir("/data/ota", { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}
