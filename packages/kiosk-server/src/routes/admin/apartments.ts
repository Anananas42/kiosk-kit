import { Hono } from 'hono';
import type { Store } from '../../db/store.js';

export function adminApartmentsRoute(store: Store) {
  const app = new Hono();

  app.post('/', async (c) => {
    const { id, label } = await c.req.json();
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    if (typeof label !== 'string' || !label.trim()) {
      return c.json({ error: 'Invalid label' }, 400);
    }
    try {
      store.createApartment(id, label.trim());
    } catch {
      return c.json({ error: 'Apartment already exists' }, 409);
    }
    return c.json({ ok: true }, 201);
  });

  app.put('/', async (c) => {
    const { id, label } = await c.req.json();
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    if (typeof label !== 'string' || !label.trim()) {
      return c.json({ error: 'Invalid label' }, 400);
    }
    store.updateApartment(id, label.trim());
    return c.json({ ok: true });
  });

  app.delete('/', async (c) => {
    const { id } = await c.req.json();
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    store.deleteApartment(id);
    return c.json({ ok: true });
  });

  return app;
}
