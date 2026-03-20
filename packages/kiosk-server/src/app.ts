import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Store } from "./db/store.js";
import { mountDocs } from "./docs.js";
import { adminBuyersRoute } from "./routes/admin/buyers.js";
import { adminCatalogRoute } from "./routes/admin/catalog.js";
import { adminPreorderConfigRoute } from "./routes/admin/preorder-config.js";
import { adminSettingsRoute } from "./routes/admin/settings.js";
import { buyersRoute } from "./routes/buyers.js";
import { catalogRoute } from "./routes/catalog.js";
import { healthRoute } from "./routes/health.js";
import { itemCountRoute } from "./routes/item-count.js";
import { overviewRoute } from "./routes/overview.js";
import { preorderConfigRoute } from "./routes/preorder-config.js";
import { recordRoute } from "./routes/record.js";
import { reportsRoute } from "./routes/reports.js";
import { settingsRoute } from "./routes/settings.js";

export function createApp(store: Store) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error("[server] Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("/api/*", cors());

  app.route("/api/health", healthRoute());
  app.route("/api/catalog", catalogRoute(store));
  app.route("/api/buyers", buyersRoute(store));
  app.route("/api/record", recordRoute(store));
  app.route("/api/overview", overviewRoute(store));
  app.route("/api/item-count", itemCountRoute(store));
  app.route("/api/preorder-config", preorderConfigRoute(store));
  app.route("/api/settings", settingsRoute(store));

  app.route("/api/admin/buyers", adminBuyersRoute(store));
  app.route("/api/admin/catalog", adminCatalogRoute(store));
  app.route("/api/admin/settings", adminSettingsRoute(store));
  app.route("/api/admin/preorder-config", adminPreorderConfigRoute(store));

  app.route("/api/reports", reportsRoute(store));

  mountDocs(app);

  // Prevent caching of HTML (index.html) so deploys take effect immediately.
  // Hashed JS/CSS assets are fine to cache — they have unique filenames.
  app.use("/*", async (c, next) => {
    await next();
    const ct = c.res.headers.get("Content-Type") ?? "";
    if (ct.includes("text/html")) {
      c.res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  });

  // Serve static client files in production
  app.use("/*", serveStatic({ root: "./packages/kiosk-client/dist" }));
  // SPA fallback
  app.use("/*", serveStatic({ root: "./packages/kiosk-client/dist", path: "index.html" }));

  return app;
}
