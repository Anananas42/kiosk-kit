import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import type { Google } from "arctic";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db/index.js";
import { authMiddleware } from "./middleware/auth.js";
import { appPushRoutes } from "./routes/app-push.js";
import { appUpdateRoutes } from "./routes/app-update.js";
import { authRoutes } from "./routes/auth.js";
import { deviceProxyRoutes } from "./routes/device-proxy.js";
import { githubWebhookRoute } from "./routes/github-webhook.js";
import { healthRoute } from "./routes/health.js";
import { otaProxyRoutes } from "./routes/ota-proxy.js";
import { otaPushRoutes } from "./routes/ota-push.js";
import { otaUpdateRoutes } from "./routes/ota-update.js";
import { tailscaleWebhookRoute } from "./routes/tailscale-webhook.js";
import { createContextFactory } from "./trpc/context.js";
import { adminRouter, appRouter } from "./trpc/router.js";

export function createApp(db: Db, google?: Google, cookieDomain?: string) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error("[web-server] Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("/api/*", cors());

  app.route("/api/health", healthRoute());
  app.route("/api/webhooks/tailscale", tailscaleWebhookRoute(db));

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

  app.use(
    "/api/admin/trpc/*",
    trpcServer({
      router: adminRouter,
      endpoint: "/api/admin/trpc",
      createContext: createContextFactory(db),
    }),
  );

  // OTA image proxy uses Tailscale IP auth — mount before session auth middleware
  app.route("/api/ota/image", otaProxyRoutes(db));

  // GitHub webhook — release asset registration, HMAC auth
  app.route("/api/webhooks/github", githubWebhookRoute(db));

  // Auth middleware for protected API routes (exclude health + auth + trpc)
  app.use("/api/*", authMiddleware(db));

  app.route("/api/devices", otaPushRoutes(db));
  app.route("/api/devices", otaUpdateRoutes(db));
  app.route("/api/devices", appPushRoutes(db));
  app.route("/api/devices", appUpdateRoutes(db));
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
