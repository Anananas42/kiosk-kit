import { Hono } from 'hono';
import type { HealthResponse } from '@zahumny/shared';
import type { QueueStore } from '../queue/store.js';

export function healthRoute(queue: QueueStore, getOnline: () => boolean) {
  const app = new Hono();

  app.get('/', (c) => {
    const response: HealthResponse = {
      online: getOnline(),
      queued: queue.count(),
    };
    return c.json(response);
  });

  return app;
}
