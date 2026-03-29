import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { APP_PKG_VERSION_FILE, APP_VERSION_FILE } from "../lib/app-update-constants.js";
import { readJsonFile, readTextFile } from "../lib/app-update-helpers.js";

async function readAppVersion(): Promise<string | null> {
  const version = await readTextFile(APP_VERSION_FILE);
  if (version) return version;

  const pkg = await readJsonFile<{ version?: string }>(APP_PKG_VERSION_FILE);
  return pkg?.version ?? null;
}

export function healthRoute() {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Health check",
      description:
        "Returns 200 with app version when healthy. The appVersion field reports " +
        "the currently running kiosk software version so the web-server can look " +
        "up the correct release manifest for asset hash verification.",
      responses: {
        200: { description: "Server is healthy" },
      },
    }),
    async (c) => {
      const appVersion = await readAppVersion();
      return c.json({ status: "ok", appVersion });
    },
  );

  return app;
}
