import type { RecordRequest, CatalogCategory } from './types.js';

export function validateRecordRequest(body: unknown): { ok: true; data: RecordRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const { buyer, count, category, item, itemId, quantity, price } = body as Record<string, unknown>;

  if (typeof buyer !== 'number' || !Number.isInteger(buyer) || buyer < 1) {
    return { ok: false, error: 'Invalid buyer' };
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count === 0) {
    return { ok: false, error: 'Invalid count (must be a nonzero integer)' };
  }
  if (typeof category !== 'string' || !category) {
    return { ok: false, error: 'Missing category' };
  }
  if (typeof item !== 'string' || !item) {
    return { ok: false, error: 'Missing item' };
  }

  return {
    ok: true,
    data: {
      buyer,
      count,
      category,
      item,
      itemId: typeof itemId === 'string' ? itemId : undefined,
      quantity: typeof quantity === 'string' ? quantity : '',
      price: typeof price === 'string' ? price : '',
    },
  };
}

export function validateCatalog(rows: string[][], pastryType: string): CatalogCategory[] {
  const order: string[] = [];
  const map: Record<string, CatalogCategory> = {};

  for (const [cat, type = '', itemId = '', itemName, quantity = '', price = '', dphRate = ''] of rows) {
    if (!cat || !itemName) continue;
    if (!map[cat]) {
      const id = cat.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      map[cat] = { id, name: cat, pastry: type.trim().toLowerCase() === pastryType, items: [] };
      order.push(cat);
    }
    map[cat].items.push({ id: itemId.trim(), name: itemName.trim(), quantity: quantity.trim(), price: price.trim(), dphRate: dphRate.trim() });
  }

  return order.map((name) => map[name]);
}
