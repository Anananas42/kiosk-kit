import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createGoogleOAuth } from "./auth/google.js";
import {
  BACKUP_STALE_OP_MS,
  RESTORE_STALE_OP_MS,
  STALE_CLEANUP_INTERVAL_MS,
  UPDATE_STALE_OP_MS,
} from "./config.js";
import { createDb } from "./db/index.js";
import { startBackupScheduler } from "./services/backup-scheduler.js";
import {
  cleanupStale,
  OP_TYPE_APP_INSTALL,
  OP_TYPE_APP_PUSH,
  OP_TYPE_BACKUP,
  OP_TYPE_OTA_INSTALL,
  OP_TYPE_OTA_PUSH,
  OP_TYPE_RESTORE,
} from "./services/device-operations.js";

const db = createDb(process.env.DATABASE_URL!);

const google =
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_REDIRECT_URI
    ? createGoogleOAuth(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      )
    : undefined;

const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const app = createApp(db, google, cookieDomain);
const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[web-server] Listening on http://localhost:${info.port}`);
});

// Per-type stale thresholds for cleanup
const staleThresholds: Record<string, number> = {
  [OP_TYPE_BACKUP]: BACKUP_STALE_OP_MS,
  [OP_TYPE_RESTORE]: RESTORE_STALE_OP_MS,
  [OP_TYPE_OTA_PUSH]: UPDATE_STALE_OP_MS,
  [OP_TYPE_OTA_INSTALL]: UPDATE_STALE_OP_MS,
  [OP_TYPE_APP_PUSH]: UPDATE_STALE_OP_MS,
  [OP_TYPE_APP_INSTALL]: UPDATE_STALE_OP_MS,
};

// Clean up stale device operations on startup, then periodically
cleanupStale(db, staleThresholds).then((count) => {
  if (count > 0) console.log(`[device-ops] Cleaned up ${count} stale operations on startup`);
});
setInterval(() => {
  cleanupStale(db, staleThresholds).catch((err) => {
    console.error("[device-ops] Stale cleanup error:", err instanceof Error ? err.message : err);
  });
}, STALE_CLEANUP_INTERVAL_MS);

// Start daily backup scheduler when S3 and Tailscale are both configured
if (
  process.env.S3_ENDPOINT &&
  process.env.S3_BUCKET &&
  process.env.TAILSCALE_OAUTH_CLIENT_ID &&
  process.env.TAILSCALE_TAILNET
) {
  startBackupScheduler(db);
}
