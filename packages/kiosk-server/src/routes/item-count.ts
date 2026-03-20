import type { ItemCountResponse } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

export function itemCountRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Get item count",
      description: "Returns the balance (total count) of a specific item for a buyer.",
      parameters: [
        { name: "buyer", in: "query", required: true, schema: { type: "integer" } },
        { name: "item", in: "query", required: true, schema: { type: "string" } },
        { name: "itemId", in: "query", required: false, schema: { type: "string" } },
      ],
      responses: {
        200: {
          description: "Item count",
          content: {
            "application/json": { schema: resolver(z.object({ count: z.number().int() })) },
          },
        },
        400: {
          description: "Missing required params",
          content: {
            "application/json": { schema: resolver(z.object({ error: z.string() })) },
          },
        },
      },
    }),
    (c) => {
      const buyer = Number(c.req.query("buyer"));
      const item = c.req.query("item") ?? "";
      const itemId = c.req.query("itemId") ?? "";

      if (!buyer || !item) {
        return c.json({ error: "Missing required query params: buyer, item" }, 400);
      }

      const total = store.getItemBalance(buyer, item, itemId || undefined);
      return c.json({ count: total } satisfies ItemCountResponse);
    },
  );

  return app;
}
