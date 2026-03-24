import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createGoogleOAuth } from "./auth/google.js";
import { createDb } from "./db/index.js";

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

const app = createApp(db, google);
const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[web-server] Listening on http://localhost:${info.port}`);
});
