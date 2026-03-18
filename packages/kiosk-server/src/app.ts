import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Store } from './db/store.js';
import { healthRoute } from './routes/health.js';
import { catalogRoute } from './routes/catalog.js';
import { apartmentsRoute } from './routes/apartments.js';
import { recordRoute } from './routes/record.js';
import { overviewRoute } from './routes/overview.js';
import { itemCountRoute } from './routes/item-count.js';
import { pastryConfigRoute } from './routes/pastry-config.js';
import { settingsRoute } from './routes/settings.js';
import { adminApartmentsRoute } from './routes/admin/apartments.js';
import { adminCatalogRoute } from './routes/admin/catalog.js';
import { adminSettingsRoute } from './routes/admin/settings.js';
import { adminPastryConfigRoute } from './routes/admin/pastry-config.js';
import { reportsRoute } from './routes/reports.js';

export function createApp(store: Store) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.use('/api/*', cors());

  app.route('/api/health', healthRoute());
  app.route('/api/catalog', catalogRoute(store));
  app.route('/api/apartments', apartmentsRoute(store));
  app.route('/api/record', recordRoute(store));
  app.route('/api/overview', overviewRoute(store));
  app.route('/api/item-count', itemCountRoute(store));
  app.route('/api/pastry-config', pastryConfigRoute(store));
  app.route('/api/settings', settingsRoute(store));

  app.route('/api/admin/apartments', adminApartmentsRoute(store));
  app.route('/api/admin/catalog', adminCatalogRoute(store));
  app.route('/api/admin/settings', adminSettingsRoute(store));
  app.route('/api/admin/pastry-config', adminPastryConfigRoute(store));

  app.route('/api/reports', reportsRoute(store));

  // Prevent caching of HTML (index.html) so deploys take effect immediately.
  // Hashed JS/CSS assets are fine to cache — they have unique filenames.
  app.use('/*', async (c, next) => {
    await next();
    const ct = c.res.headers.get('Content-Type') ?? '';
    if (ct.includes('text/html')) {
      c.res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  });

  // Serve static client files in production
  app.use('/*', serveStatic({ root: './packages/kiosk-client/dist' }));
  // SPA fallback
  app.use('/*', serveStatic({ root: './packages/kiosk-client/dist', path: 'index.html' }));

  return app;
}
