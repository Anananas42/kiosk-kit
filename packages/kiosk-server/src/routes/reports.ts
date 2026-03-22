import { getDeliveryDate, noDeliveryDaysSet } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

export function reportsRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/consumption",
    describeRoute({
      tags: ["Reports"],
      summary: "Consumption report",
      description: "Aggregated consumption data per item, broken down by buyer.",
      responses: {
        200: {
          description: "Consumption report rows",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  rows: z.array(
                    z.object({
                      item: z.string(),
                      itemId: z.string(),
                      category: z.string(),
                      quantity: z.string(),
                      price: z.string(),
                      byBuyer: z.record(z.string(), z.number()),
                    }),
                  ),
                }),
              ),
            },
          },
        },
      },
    }),
    (c) => {
      const records = store.getRecords();

      const agg = new Map<
        string,
        {
          item: string;
          itemId: string;
          category: string;
          quantity: string;
          price: string;
          byBuyer: Map<number, number>;
        }
      >();

      for (const r of records) {
        const key = r.itemId || r.item;
        let entry = agg.get(key);
        if (!entry) {
          entry = {
            item: r.item,
            itemId: r.itemId,
            category: r.category,
            quantity: r.quantity,
            price: r.price,
            byBuyer: new Map(),
          };
          agg.set(key, entry);
        }
        entry.byBuyer.set(r.buyer, (entry.byBuyer.get(r.buyer) ?? 0) + r.count);
      }

      const rows = Array.from(agg.values()).map((e) => ({
        item: e.item,
        itemId: e.itemId,
        category: e.category,
        quantity: e.quantity,
        price: e.price,
        byBuyer: Object.fromEntries(e.byBuyer),
      }));

      return c.json({ rows });
    },
  );

  app.get(
    "/preorders",
    describeRoute({
      tags: ["Reports"],
      summary: "Preorders report",
      description: "Aggregated preorder quantities per item, grouped by delivery date.",
      responses: {
        200: {
          description: "Preorder report rows",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  rows: z.array(
                    z.object({
                      date: z.string(),
                      items: z.record(z.string(), z.number()),
                    }),
                  ),
                }),
              ),
            },
          },
        },
      },
    }),
    (c) => {
      const config = store.getPreorderConfig();
      const noDelivery = config ? noDeliveryDaysSet(config.deliveryDays) : new Set<number>();

      const records = store.getRecords();
      const catalog = store.getCatalog();
      const preorderCategories = new Set(
        catalog.filter((cat) => cat.preorder).map((cat) => cat.name),
      );

      const preorderRecords = records.filter((r) => preorderCategories.has(r.category));

      const byDate = new Map<string, Map<string, number>>();
      for (const r of preorderRecords) {
        const date = getDeliveryDate(r.timestamp, noDelivery);
        if (!date) continue;
        let dateMap = byDate.get(date);
        if (!dateMap) {
          dateMap = new Map();
          byDate.set(date, dateMap);
        }
        dateMap.set(r.item, (dateMap.get(r.item) ?? 0) + r.count);
      }

      const rows = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({
          date,
          items: Object.fromEntries(items),
        }));

      return c.json({ rows });
    },
  );

  return app;
}
