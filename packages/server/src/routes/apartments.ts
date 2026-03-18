import { Hono } from 'hono';
import type { ApartmentsResponse } from '@zahumny/shared';
import type { CacheStore } from '../cache/store.js';
import { readApartments, ApartmentValidationError } from '../sheets/apartments.js';
import { env } from '../env.js';

export function apartmentsRoute(cache: CacheStore) {
  const app = new Hono();

  app.get('/', async (c) => {
    if (env.sheetsConfigured) {
      try {
        const apartments = await readApartments();
        if (apartments.length > 0) {
          cache.setApartments(apartments);
          const response: ApartmentsResponse = { apartments };
          return c.json(response);
        }
      } catch (err) {
        if (err instanceof ApartmentValidationError) {
          console.error(`[api] APARTMENT CONFIG BROKEN — refusing to serve until fixed:\n${err.message}`);
          return c.json({
            error: 'apartments_invalid',
            message: 'Apartment config obsahuje chyby — aplikace je pozastavena, dokud nebudou opraveny.',
            details: err.errors,
          }, 503);
        }
        console.error('[api] Apartments read from Sheets failed:', (err as Error).message);
      }
    }

    const cached = cache.getApartments();
    const response: ApartmentsResponse = { apartments: cached ?? [] };
    return c.json(response);
  });

  return app;
}
