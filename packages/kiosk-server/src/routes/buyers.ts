import type { BuyersResponse } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

const BuyersResponseSchema = z.object({
  buyers: z.array(
    z.object({
      id: z.number().int(),
      label: z.string(),
    }),
  ),
});

export function buyersRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "List buyers",
      description: "Returns all registered buyers.",
      responses: {
        200: {
          description: "List of buyers",
          content: {
            "application/json": {
              schema: resolver(BuyersResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      const buyers = store.getBuyers();
      const response: BuyersResponse = { buyers };
      return c.json(response);
    },
  );

  return app;
}
