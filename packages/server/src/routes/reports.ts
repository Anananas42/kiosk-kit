import { Hono } from 'hono';
import { getDeliveryDate, noDeliveryDaysSet } from '@kioskkit/shared';
import type { Store } from '../db/store.js';

export function reportsRoute(store: Store) {
  const app = new Hono();

  app.get('/consumption', (c) => {
    const records = store.getRecords();

    const agg = new Map<string, { item: string; itemId: string; category: string; quantity: string; price: string; byBuyer: Map<number, number> }>();

    for (const r of records) {
      const key = r.itemId || r.item;
      let entry = agg.get(key);
      if (!entry) {
        entry = { item: r.item, itemId: r.itemId, category: r.category, quantity: r.quantity, price: r.price, byBuyer: new Map() };
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
  });

  app.get('/pastry', (c) => {
    const config = store.getPastryConfig();
    const noDelivery = config ? noDeliveryDaysSet(config.deliveryDays) : new Set<number>();

    const records = store.getRecords();
    const catalog = store.getCatalog();
    const pastryCategories = new Set(catalog.filter((cat) => cat.pastry).map((cat) => cat.name));

    const pastryRecords = records.filter((r) => pastryCategories.has(r.category));

    const byDate = new Map<string, Map<string, number>>();
    for (const r of pastryRecords) {
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
  });

  return app;
}
