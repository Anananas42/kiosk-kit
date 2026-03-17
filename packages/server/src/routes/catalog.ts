import { Hono } from 'hono';
import type { CacheStore } from '../cache/store.js';
import { readCatalog, CatalogValidationError } from '../sheets/catalog.js';
import { env } from '../env.js';

export function catalogRoute(cache: CacheStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    if (env.sheetsConfigured) {
      try {
        const catalog = await readCatalog();
        if (catalog.length > 0) {
          cache.setCatalog(catalog);
          return c.json(catalog);
        }
      } catch (err) {
        if (err instanceof CatalogValidationError) {
          console.error(`[api] CATALOG BROKEN — refusing to serve until fixed:\n${err.message}`);
          return c.json({
            error: 'catalog_invalid',
            message: 'Katalog obsahuje chyby — aplikace je pozastavena, dokud nebudou opraveny.',
            details: err.errors,
          }, 503);
        }
        console.error('[api] Catalog read from Sheets failed:', (err as Error).message);
      }
    }

    // Fallback to cache
    const cached = cache.getCatalog();
    if (cached) return c.json(cached);

    return c.json([], 200);
  });

  return app;
}
