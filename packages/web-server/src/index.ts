import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createGoogleOAuth } from "./auth/google.js";
import { createDb } from "./db/index.js";
import { startBackupScheduler } from "./services/backup-scheduler.js";

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

// Start daily backup scheduler when S3 and Tailscale are both configured
if (
  process.env.S3_ENDPOINT &&
  process.env.S3_BUCKET &&
  process.env.TAILSCALE_OAUTH_CLIENT_ID &&
  process.env.TAILSCALE_TAILNET
) {
  startBackupScheduler(db);
}
