import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import type { Google } from "arctic";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db/index.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { deviceProxyRoutes } from "./routes/device-proxy.js";
import { healthRoute } from "./routes/health.js";
import { otaProxyRoutes } from "./routes/ota-proxy.js";
import { createContextFactory } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

export function createApp(db: Db, google?: Google, cookieDomain?: string) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error("[web-server] Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("/api/*", cors());

  app.route("/api/health", healthRoute());

  if (google) {
    app.route("/api/auth", authRoutes(db, google, cookieDomain));
  }

  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: createContextFactory(db),
    }),
  );

  // OTA image proxy uses Tailscale IP auth — mount before session auth middleware
  app.route("/api/ota/image", otaProxyRoutes(db));

  // Auth middleware for protected API routes (exclude health + auth + trpc)
  app.use("/api/*", authMiddleware(db));

  app.route("/api/devices", deviceProxyRoutes(db));

  // Host-based static serving: admin.* → web-admin, everything else → web-client
  const adminAssets = serveStatic({ root: "../web-admin/dist" });
  const webAssets = serveStatic({ root: "../web-client/dist" });
  const adminFallback = serveStatic({ root: "../web-admin/dist", path: "index.html" });
  const webFallback = serveStatic({ root: "../web-client/dist", path: "index.html" });

  app.use("/assets/*", (c, next) => {
    const host = c.req.header("host") ?? "";
    return host.startsWith("admin.") ? adminAssets(c, next) : webAssets(c, next);
  });

  app.get("*", (c, next) => {
    const host = c.req.header("host") ?? "";
    return host.startsWith("admin.") ? adminFallback(c, next) : webFallback(c, next);
  });

  return app;
}
