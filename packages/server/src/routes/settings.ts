import { Hono } from 'hono';
import { DEFAULT_KIOSK_SETTINGS } from '@zahumny/shared';
import type { CacheStore } from '../cache/store.js';
import { readSettings } from '../sheets/settings.js';
import { env } from '../env.js';

export function settingsRoute(cache: CacheStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    if (env.sheetsConfigured) {
      try {
        const settings = await readSettings();
        cache.setSettings(settings);
        return c.json(settings);
      } catch (err) {
        console.error('[api] Settings read from Sheets failed:', (err as Error).message);
      }
    }

    const cached = cache.getSettings();
    if (cached) return c.json(cached);

    return c.json(DEFAULT_KIOSK_SETTINGS);
  });

  return app;
}
