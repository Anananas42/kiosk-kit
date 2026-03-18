import { Hono } from 'hono';
import type { Store } from '../db/store.js';

export function catalogRoute(store: Store) {
  const app = new Hono();

  app.get('/', (c) => {
    const catalog = store.getCatalog();
    return c.json(catalog);
  });

  return app;
}
