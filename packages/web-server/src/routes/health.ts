import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";

export function healthRoute() {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Health"],
      summary: "Health check",
      responses: {
        200: {
          description: "Server is healthy",
          content: {
            "application/json": { schema: resolver(z.object({ ok: z.boolean() })) },
          },
        },
      },
    }),
    (c) => c.json({ ok: true }),
  );

  return app;
}
