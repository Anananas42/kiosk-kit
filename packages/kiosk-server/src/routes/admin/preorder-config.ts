import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../../db/store.js";

export function adminPreorderConfigRoute(store: Store) {
  const app = new Hono();

  app.put(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "Update preorder config",
      description: "Set ordering/delivery flags for a specific weekday (0=Sunday, 6=Saturday).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["weekday", "ordering", "delivery"],
              properties: {
                weekday: { type: "integer" as const, minimum: 0, maximum: 6 },
                ordering: { type: "boolean" as const },
                delivery: { type: "boolean" as const },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Config updated",
          content: {
            "application/json": { schema: resolver(z.object({ ok: z.boolean() })) },
          },
        },
        400: {
          description: "Invalid weekday",
          content: {
            "application/json": { schema: resolver(z.object({ error: z.string() })) },
          },
        },
      },
    }),
    async (c) => {
      const { weekday, ordering, delivery } = await c.req.json();
      if (typeof weekday !== "number" || weekday < 0 || weekday > 6) {
        return c.json({ error: "Invalid weekday (0-6)" }, 400);
      }
      store.putPreorderConfig(weekday, !!ordering, !!delivery);
      return c.json({ ok: true });
    },
  );

  return app;
}
