import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { CacheStore } from './cache/store.js';
import type { QueueStore } from './queue/store.js';
import { healthRoute } from './routes/health.js';
import { catalogRoute } from './routes/catalog.js';
import { apartmentsRoute } from './routes/apartments.js';
import { recordRoute } from './routes/record.js';
import { overviewRoute } from './routes/overview.js';
import { itemCountRoute } from './routes/item-count.js';
import { pastryConfigRoute } from './routes/pastry-config.js';

export function createApp(
  cache: CacheStore,
  queue: QueueStore,
  getOnline: () => boolean,
  setOnline: (online: boolean) => void,
) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.use('/api/*', cors());

  app.route('/api/health', healthRoute(queue, getOnline));
  app.route('/api/catalog', catalogRoute(cache));
  app.route('/api/apartments', apartmentsRoute(cache));
  app.route('/api/record', recordRoute(queue, setOnline));
  app.route('/api/overview', overviewRoute(queue));
  app.route('/api/item-count', itemCountRoute(queue));
  app.route('/api/pastry-config', pastryConfigRoute(cache));

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
  app.use('/*', serveStatic({ root: './packages/client/dist' }));
  // SPA fallback
  app.use('/*', serveStatic({ root: './packages/client/dist', path: 'index.html' }));

  return app;
}
