import { Hono } from 'hono';
import { computeBalance, type ItemCountResponse } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';
import { readRecords } from '../sheets/evidence.js';
import { env } from '../env.js';

export function itemCountRoute(queue: QueueStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    const buyer = Number(c.req.query('buyer'));
    const item = c.req.query('item') ?? '';
    const itemId = c.req.query('itemId') ?? '';

    if (!buyer || !item) {
      return c.json({ count: 0 } satisfies ItemCountResponse);
    }

    const counted: Array<{ buyer: number; item: string; itemId?: string; count: number }> = [];

    if (env.sheetsConfigured) {
      try {
        const records = await readRecords();
        for (const r of records) {
          counted.push({ buyer: r.buyer, item: r.item, itemId: r.itemId, count: r.count });
        }
      } catch (err) {
        console.error('[api] Item count read error:', (err as Error).message);
      }
    }

    for (const e of queue.getAll()) {
      counted.push({ buyer: e.buyer, item: e.item, itemId: e.itemId, count: e.count });
    }

    const total = computeBalance(counted, buyer, item, itemId || undefined);
    return c.json({ count: Math.max(0, total) } satisfies ItemCountResponse);
  });

  return app;
}
