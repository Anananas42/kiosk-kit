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
          title: "KioskKit Web Server API",
          version: "1.0.0",
          description: "API for authentication, user management, and device proxying.",
        },
        tags: [
          { name: "Auth", description: "Authentication endpoints (Google OAuth)" },
          { name: "User", description: "Current user endpoints" },
          { name: "Health", description: "Health check" },
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
