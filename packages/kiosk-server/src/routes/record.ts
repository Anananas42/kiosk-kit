import { randomUUID } from "node:crypto";
import { type RecordEntry, validateRecordRequest } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";
import { withLock } from "../lock.js";

export function recordRoute(store: Store) {
  const app = new Hono();

  app.post(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Record a transaction",
      description: "Records a purchase or return entry for a buyer.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["buyer", "count", "category", "item"],
              properties: {
                buyer: { type: "integer" as const, minimum: 1 },
                count: {
                  type: "integer" as const,
                  description: "Signed count: positive = add, negative = remove",
                },
                category: { type: "string" as const },
                item: { type: "string" as const },
                itemId: { type: "string" as const },
                quantity: { type: "string" as const },
                price: { type: "string" as const },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Record created",
          content: {
            "application/json": { schema: resolver(z.object({ ok: z.boolean() })) },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": { schema: resolver(z.object({ error: z.string() })) },
          },
        },
      },
    }),
    async (c) => {
      const body = await c.req.json();
      const validation = validateRecordRequest(body);
      if (!validation.ok) {
        return c.json({ error: validation.error }, 400);
      }

      return withLock(async () => {
        const { data } = validation;

        if (data.count < 0) {
          const balance = store.getItemBalance(data.buyer, data.item, data.itemId);
          if (balance + data.count < 0) {
            return c.json({ error: "insufficient_balance" }, 400);
          }
        }

        const entry: RecordEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          buyer: data.buyer,
          count: data.count,
          category: data.category,
          item: data.item,
          itemId: data.itemId ?? "",
          quantity: data.quantity ?? "",
          price: data.price ?? "",
        };

        store.insertRecord(entry);
        return c.json({ ok: true });
      });
    },
  );

  return app;
}
