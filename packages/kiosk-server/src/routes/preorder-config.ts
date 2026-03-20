import { DEFAULT_PREORDER_CONFIG } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

const PreorderConfigSchema = z.object({
  orderingDays: z.array(z.boolean()).length(7),
  deliveryDays: z.array(z.boolean()).length(7),
});

export function preorderConfigRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Get preorder config",
      description: "Returns ordering/delivery day configuration. Index 0 = Sunday, 6 = Saturday.",
      responses: {
        200: {
          description: "Preorder configuration",
          content: {
            "application/json": { schema: resolver(PreorderConfigSchema) },
          },
        },
      },
    }),
    (c) => {
      const config = store.getPreorderConfig();
      return c.json(config ?? DEFAULT_PREORDER_CONFIG);
    },
  );

  return app;
}
