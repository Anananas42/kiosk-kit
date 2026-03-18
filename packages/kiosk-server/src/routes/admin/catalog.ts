import { Hono } from 'hono';
import type { Store } from '../../db/store.js';

export function adminCatalogRoute(store: Store) {
  const app = new Hono();

  // ── Categories ──────────────────────────────────────────────────────────

  app.post('/categories', async (c) => {
    const { name, preorder, sortOrder } = await c.req.json();
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    const id = store.createCategory(name.trim(), !!preorder, Number(sortOrder) || 0);
    return c.json({ ok: true, id }, 201);
  });

  app.put('/categories', async (c) => {
    const { id, name, preorder, sortOrder } = await c.req.json();
    if (typeof id !== 'number') return c.json({ error: 'Invalid id' }, 400);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    store.updateCategory(id, name.trim(), !!preorder, Number(sortOrder) || 0);
    return c.json({ ok: true });
  });

  app.delete('/categories', async (c) => {
    const { id } = await c.req.json();
    if (typeof id !== 'number') return c.json({ error: 'Invalid id' }, 400);
    store.deleteCategory(id);
    return c.json({ ok: true });
  });

  // ── Items ───────────────────────────────────────────────────────────────

  app.post('/items', async (c) => {
    const { categoryId, name, quantity, price, dphRate, sortOrder } = await c.req.json();
    if (typeof categoryId !== 'number') return c.json({ error: 'Invalid categoryId' }, 400);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    const id = store.createItem(
      categoryId,
      name.trim(),
      String(quantity ?? ''),
      String(price ?? ''),
      String(dphRate ?? ''),
      Number(sortOrder) || 0,
    );
    return c.json({ ok: true, id }, 201);
  });

  app.put('/items', async (c) => {
    const { id, name, quantity, price, dphRate, sortOrder } = await c.req.json();
    if (typeof id !== 'number') return c.json({ error: 'Invalid id' }, 400);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    store.updateItem(
      id,
      name.trim(),
      String(quantity ?? ''),
      String(price ?? ''),
      String(dphRate ?? ''),
      Number(sortOrder) || 0,
    );
    return c.json({ ok: true });
  });

  app.delete('/items', async (c) => {
    const { id } = await c.req.json();
    if (typeof id !== 'number') return c.json({ error: 'Invalid id' }, 400);
    store.deleteItem(id);
    return c.json({ ok: true });
  });

  return app;
}
