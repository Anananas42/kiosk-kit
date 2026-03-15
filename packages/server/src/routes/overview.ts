import { Hono } from 'hono';
import type { OverviewResponse } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';
import { readRecords } from '../sheets/evidence.js';
import { env } from '../env.js';

export function overviewRoute(queue: QueueStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    let records: OverviewResponse['records'] = [];

    if (env.sheetsConfigured) {
      try {
        records = await readRecords();
      } catch (err) {
        console.error('[api] Overview read error:', (err as Error).message);
      }
    }

    // Merge pending queue entries
    const queued = queue.getAll();
    const queuedAsRecords = queued.map((e) => ({
      timestamp: e.timestamp,
      buyer: e.buyer,
      count: e.count,
      category: e.category,
      item: e.item,
      itemId: e.itemId,
      quantity: e.quantity,
      price: e.price,
    }));

    const response: OverviewResponse = { records: [...records, ...queuedAsRecords] };
    return c.json(response);
  });

  return app;
}
