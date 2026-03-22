import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

export function healthRoute() {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Health check",
      description: "Returns 204 when the server is healthy.",
      responses: {
        204: { description: "Server is healthy" },
      },
    }),
    (c) => c.body(null, 204),
  );

  return app;
}
