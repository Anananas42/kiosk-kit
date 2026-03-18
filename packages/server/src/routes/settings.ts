import { Hono } from 'hono';
import { DEFAULT_KIOSK_SETTINGS } from '@kioskkit/shared';
import type { Store } from '../db/store.js';

export function settingsRoute(store: Store) {
  const app = new Hono();

  app.get('/', (c) => {
    const settings = store.getSettings();
    return c.json(settings ?? DEFAULT_KIOSK_SETTINGS);
  });

  return app;
}
