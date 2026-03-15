import { Hono } from 'hono';
import type { CacheStore } from '../cache/store.js';
import { readPastryConfig } from '../sheets/pastry-config.js';
import { env } from '../env.js';

export function pastryConfigRoute(cache: CacheStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    if (env.sheetsConfigured) {
      try {
        const config = await readPastryConfig();
        cache.setPastryConfig(config);
        return c.json(config);
      } catch (err) {
        console.error('[api] Pastry config read from Sheets failed:', (err as Error).message);
      }
    }

    const cached = cache.getPastryConfig();
    if (cached) return c.json(cached);

    // Default: all days enabled
    return c.json({ orderingDays: Array(7).fill(true), deliveryDays: Array(7).fill(true) });
  });

  return app;
}
