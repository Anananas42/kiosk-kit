import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import type { Database as SQLiteDatabase } from "better-sqlite3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { backupRoute } from "./backup.js";
import type { Store } from "./db/store.js";
import { otaUploadRoute } from "./ota-upload.js";
import { healthRoute } from "./routes/health.js";
import { appRouter } from "./trpc/router.js";

export function createApp(store: Store, sqlite: SQLiteDatabase) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error("[server] Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("/api/*", cors());

  app.route("/api/health", healthRoute());
  app.route("/api/backup", backupRoute(sqlite, store));
  app.route("/api/ota/upload", otaUploadRoute());

  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: () => ({ store }),
    }),
  );

  // Prevent caching of HTML (index.html) so deploys take effect immediately.
  // Hashed JS/CSS assets are fine to cache — they have unique filenames.
  app.use("/*", async (c, next) => {
    await next();
    const ct = c.res.headers.get("Content-Type") ?? "";
    if (ct.includes("text/html")) {
      c.res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  });

  // Serve kiosk-admin SPA at /admin — must be before kiosk-client catch-all
  app.use(
    "/admin/*",
    serveStatic({
      root: "./packages/kiosk-admin/dist",
      rewriteRequestPath: (path) => path.replace(/^\/admin/, ""),
    }),
  );
  app.get("/admin", (c) => c.redirect("/admin/"));
  app.use(
    "/admin/*",
    serveStatic({
      root: "./packages/kiosk-admin/dist",
      rewriteRequestPath: () => "/index.html",
    }),
  );

  // Serve static client files in production
  app.use("/*", serveStatic({ root: "./packages/kiosk-client/dist" }));
  // SPA fallback
  app.use("/*", serveStatic({ root: "./packages/kiosk-client/dist", path: "index.html" }));

  return app;
}
