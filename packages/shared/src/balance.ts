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
  for (const r of records) {
    if (r.buyer !== buyer) continue;
    if (itemId) {
      // Match by ID, or fall back to name for legacy records without an ID
      if (r.itemId === itemId || (!r.itemId && r.item === item)) {
        total += r.count;
      }
    } else {
      if (r.item === item) {
        total += r.count;
      }
    }
  }
  return total;
}
