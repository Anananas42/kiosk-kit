import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { validateRecordRequest, type RecordEntry } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';
import { appendRow, getItemBalance } from '../sheets/evidence.js';
import { env } from '../env.js';
import { withLock } from '../lock.js';
import { markReportsDirty } from '../reports.js';

export function recordRoute(queue: QueueStore, setOnline: (online: boolean) => void) {
  const app = new Hono();

  app.post('/', async (c) => {
    const body = await c.req.json();
    const validation = validateRecordRequest(body);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }

    return withLock(async () => {
      const { data } = validation;

      // Balance check for removals
      if (data.count < 0) {
        const queueEntries = queue.getAll();
        const balance = await getItemBalance(data.buyer, data.item, queueEntries, data.itemId);
        if (balance + data.count < 0) {
          return c.json({ error: 'insufficient_balance' }, 400);
        }
      }

      const entry: RecordEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        buyer: data.buyer,
        count: data.count,
        category: data.category,
        item: data.item,
        itemId: data.itemId ?? '',
        quantity: data.quantity ?? '',
        price: data.price ?? '',
      };

      if (env.sheetsConfigured) {
        try {
          await appendRow(entry);
          setOnline(true);
          markReportsDirty();

          return c.json({ ok: true, queued: false });
        } catch (err) {
          console.error('[api] Sheets write failed, queuing:', (err as Error).message);
          setOnline(false);
          queue.add(entry);
          return c.json({ ok: true, queued: true });
        }
      }

      queue.add(entry);
      return c.json({ ok: true, queued: true });
    });
  });

  return app;
}
