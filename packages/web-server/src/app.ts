import type { Google } from "arctic";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db/index.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoute } from "./routes/health.js";

export function createApp(db: Db, google?: Google) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error("[web-server] Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("/api/*", cors());

  app.route("/api/health", healthRoute());

  if (google) {
    app.route("/api/auth", authRoutes(db, google));
  }

  // Auth middleware for protected API routes (exclude health + auth)
  app.use("/api/*", authMiddleware(db));

  return app;
}
