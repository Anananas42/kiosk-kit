import { trpcServer } from "@hono/trpc-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Google } from "arctic";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db/index.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { deviceProxyRoutes } from "./routes/device-proxy.js";
import { healthRoute } from "./routes/health.js";
import { createContextFactory } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

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

  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: createContextFactory(db),
    }),
  );

  // Auth middleware for protected API routes (exclude health + auth + trpc)
  app.use("/api/*", authMiddleware(db));

  app.route("/api/devices", deviceProxyRoutes(db));

  // Serve web-client static assets
  app.use("/assets/*", serveStatic({ root: "../web-client/dist" }));

  // SPA fallback: serve index.html for all non-API routes
  app.get("*", serveStatic({ root: "../web-client/dist", path: "index.html" }));

  return app;
}
