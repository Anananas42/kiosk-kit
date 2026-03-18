import { Hono } from 'hono';
import type { ApartmentsResponse } from '@kioskkit/shared';
import type { Store } from '../db/store.js';

export function apartmentsRoute(store: Store) {
  const app = new Hono();

  app.get('/', (c) => {
    const apartments = store.getApartments();
    const response: ApartmentsResponse = { apartments };
    return c.json(response);
  });

  return app;
}
