import { Hono } from 'hono';
import type { ItemCountResponse } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';
import { readRecords } from '../sheets/evidence.js';
import { env } from '../env.js';

export function itemCountRoute(queue: QueueStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    const buyer = Number(c.req.query('buyer'));
    const item = c.req.query('item') ?? '';

    if (!buyer || !item) {
      return c.json({ count: 0 } satisfies ItemCountResponse);
    }

    let total = 0;

    if (env.sheetsConfigured) {
      try {
        const records = await readRecords();
        for (const r of records) {
          if (Number(r.buyer) !== buyer || r.item !== item) continue;
          const m = String(r.quantity).match(/^(\d+) ks$/);
          const count = m ? Number(m[1]) : 1;
          total += r.delta > 0 ? count : -count;
        }
      } catch (err) {
        console.error('[api] Item count read error:', (err as Error).message);
      }
    }

    // Include pending queue entries
    for (const e of queue.getAll()) {
      if (e.buyer !== buyer || e.item !== item) continue;
      const m = String(e.quantity).match(/^(\d+) ks$/);
      const count = m ? Number(m[1]) : 1;
      total += e.delta > 0 ? count : -count;
    }

    return c.json({ count: Math.max(0, total) } satisfies ItemCountResponse);
  });

  return app;
}
