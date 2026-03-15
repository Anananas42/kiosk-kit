import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { PASTRY_CATEGORIES, validateRecordRequest, deriveCount, type RecordEntry } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';
import { appendRow, getItemBalance } from '../sheets/evidence.js';
import { updatePastrySheet } from '../sheets/pastry.js';
import { env } from '../env.js';
import { withLock } from '../lock.js';

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
      if (data.delta === -1) {
        const queueEntries = queue.getAll();
        const balance = await getItemBalance(data.buyer, data.item, data.quantity ?? '', queueEntries);
        const required = Math.abs(deriveCount(-1, data.quantity ?? ''));
        if (balance < required) {
          return c.json({ error: 'insufficient_balance' }, 400);
        }
      }

      const entry: RecordEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        buyer: data.buyer,
        delta: data.delta,
        category: data.category,
        item: data.item,
        quantity: data.quantity ?? '',
        price: data.price ?? '',
      };

      if (env.sheetsConfigured) {
        try {
          await appendRow(entry);
          setOnline(true);

          if (PASTRY_CATEGORIES.has(entry.category)) {
            updatePastrySheet().catch((err) =>
              console.error('[sheets] Pastry update failed:', (err as Error).message),
            );
          }

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
