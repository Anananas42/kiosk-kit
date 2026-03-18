import { Hono } from 'hono';
import type { HealthResponse } from '@kioskkit/shared';

export function healthRoute() {
  const app = new Hono();

  app.get('/', (c) => {
    const response: HealthResponse = { online: true, queued: 0 };
    return c.json(response);
  });

  return app;
}
