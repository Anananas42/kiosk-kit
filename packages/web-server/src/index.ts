import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[web-server] Listening on http://localhost:${info.port}`);
});
