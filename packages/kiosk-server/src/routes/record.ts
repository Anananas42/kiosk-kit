import { randomUUID } from "node:crypto";
import { type RecordEntry, validateRecordRequest } from "@kioskkit/shared";
import { Hono } from "hono";
import type { Store } from "../db/store.js";
import { withLock } from "../lock.js";

export function recordRoute(store: Store) {
  const app = new Hono();

  app.post("/", async (c) => {
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
  });

  return app;
}
