import type { RecordRequest, CatalogCategory, Apartment } from './types.js';

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

export function validateCatalog(rows: string[][], pastryType: string): { ok: true; data: CatalogCategory[] } | { ok: false; errors: string[] } {
  const order: string[] = [];
  const map: Record<string, CatalogCategory> = {};
  const errors: string[] = [];
  const seenIds = new Map<string, string>(); // id → "category / item name" for duplicate reporting

  for (const [cat, type = '', itemId = '', itemName, quantity = '', price = '', dphRate = ''] of rows) {
    if (!cat || !itemName) continue;
    if (!map[cat]) {
      const id = cat.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      map[cat] = { id, name: cat, pastry: type.trim().toLowerCase() === pastryType, items: [] };
      order.push(cat);
    }

    const trimmedId = itemId.trim();
    const trimmedName = itemName.trim();
    const location = `${cat} / ${trimmedName}`;

    if (!trimmedId) {
      errors.push(`Missing ID for item "${location}" — every item in [Katalog] must have a unique value in the ID column`);
    } else if (seenIds.has(trimmedId)) {
      errors.push(`Duplicate ID "${trimmedId}" — used by both "${seenIds.get(trimmedId)}" and "${location}"`);
    } else {
      seenIds.set(trimmedId, location);
    }

    map[cat].items.push({ id: trimmedId, name: trimmedName, quantity: quantity.trim(), price: price.trim(), dphRate: dphRate.trim() });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: order.map((name) => map[name]) };
}

export function validateApartments(
  rows: { id: string; label: string }[],
): { ok: true; data: Apartment[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seenIds = new Map<number, string>(); // id → label for duplicate reporting
  const apartments: Apartment[] = [];

  for (const { id: rawId, label: rawLabel } of rows) {
    const trimmedId = rawId.trim();
    const trimmedLabel = rawLabel?.trim();

    // Skip completely blank rows
    if (!trimmedId && !trimmedLabel) continue;

    const displayName = trimmedLabel || '(bez názvu)';

    if (!trimmedId) {
      errors.push(`Chybí ID u apartmánu „${displayName}" — každý apartmán v [Apartment config] musí mít unikátní číselné ID`);
      continue;
    }

    const id = Number(trimmedId);
    if (!Number.isInteger(id) || id < 1) {
      errors.push(`Neplatné ID „${trimmedId}" u apartmánu „${displayName}" — ID musí být celé kladné číslo`);
      continue;
    }

    if (seenIds.has(id)) {
      errors.push(`Duplicitní ID ${id} — použito u „${seenIds.get(id)}" i „${displayName}"`);
      continue;
    }

    const label = trimmedLabel || trimmedId;
    seenIds.set(id, label);
    apartments.push({ id, label });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: apartments };
}
