import { apiReference } from "@scalar/hono-api-reference";
import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";

/** Mount OpenAPI spec + Scalar docs UI on an existing Hono app. */
export function mountDocs(app: Hono) {
  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "KioskKit Kiosk Server API",
          version: "1.0.0",
          description: "API for the kiosk touchscreen and admin panel.",
        },
        tags: [
          { name: "Touchscreen", description: "Endpoints used by the kiosk touchscreen UI" },
          { name: "Admin", description: "Admin panel endpoints" },
          { name: "Reports", description: "Reporting endpoints" },
        ],
      },
    }),
  );

  app.get(
    "/api/docs",
    apiReference({
      url: "/api/openapi.json",
      theme: "default",
    }),
  );
}
