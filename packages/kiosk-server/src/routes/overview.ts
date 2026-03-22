import type { OverviewResponse } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

const RecordRowSchema = z.object({
  timestamp: z.string(),
  buyer: z.number().int(),
  count: z.number().int(),
  category: z.string(),
  item: z.string(),
  itemId: z.string(),
  quantity: z.string(),
  price: z.string(),
});

export function overviewRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Get overview",
      description: "Returns all transaction records.",
      responses: {
        200: {
          description: "List of records",
          content: {
            "application/json": {
              schema: resolver(z.object({ records: z.array(RecordRowSchema) })),
            },
          },
        },
      },
    }),
    (c) => {
      const records = store.getRecords();
      const response: OverviewResponse = { records };
      return c.json(response);
    },
  );

  return app;
}
