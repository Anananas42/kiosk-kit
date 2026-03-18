import { Hono } from 'hono';
import type { ItemCountResponse } from '@kioskkit/shared';
import type { Store } from '../db/store.js';

export function itemCountRoute(store: Store) {
  const app = new Hono();

  app.get('/', (c) => {
    const buyer = Number(c.req.query('buyer'));
    const item = c.req.query('item') ?? '';
    const itemId = c.req.query('itemId') ?? '';

    if (!buyer || !item) {
      return c.json({ count: 0 } satisfies ItemCountResponse);
    }

    const total = store.getItemBalance(buyer, item, itemId || undefined);
    return c.json({ count: Math.max(0, total) } satisfies ItemCountResponse);
  });

  return app;
}
