import { Hono } from 'hono';
import type { Store } from '../../db/store.js';

export function adminPastryConfigRoute(store: Store) {
  const app = new Hono();

  app.put('/', async (c) => {
    const { weekday, ordering, delivery } = await c.req.json();
    if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) {
      return c.json({ error: 'Invalid weekday (0-6)' }, 400);
    }
    store.putPastryConfig(weekday, !!ordering, !!delivery);
    return c.json({ ok: true });
  });

  return app;
}
