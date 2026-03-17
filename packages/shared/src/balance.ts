/**
 * Sum the `count` field for all records matching buyer + item.
 * Count is a signed integer (positive = add, negative = remove).
 *
 * When `itemId` is provided, matches records by ID (or by name for legacy
 * records that have no ID). When `itemId` is absent, matches by name only.
 */
export function computeBalance(
  records: Array<{ buyer: number; item: string; itemId?: string; count: number }>,
  buyer: number,
  item: string,
  itemId?: string,
): number {
  let total = 0;
  let nameFallbackCount = 0;
  for (const r of records) {
    if (r.buyer !== buyer) continue;
    if (itemId) {
      if (r.itemId === itemId) {
        total += r.count;
      } else if (!r.itemId && r.item === item) {
        // Legacy record without ID — matched by name only
        nameFallbackCount++;
        total += r.count;
      }
    } else {
      if (r.item === item) {
        total += r.count;
      }
    }
  }
  if (nameFallbackCount > 0) {
    console.warn(
      `[balance] ${nameFallbackCount} record(s) for buyer=${buyer} item="${item}" matched by name fallback (missing itemId) — balance may be inaccurate`,
    );
  }
  return total;
}
