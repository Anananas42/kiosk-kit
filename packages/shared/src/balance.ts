/**
 * Derive a signed count from a record's delta and quantity string.
 * "3 ks" → ±3, anything else → ±1.
 */
export function deriveCount(delta: number, quantity: string): number {
  const m = quantity.match(/^(\d+) ks$/);
  const pieces = m ? Number(m[1]) : 1;
  return delta > 0 ? pieces : -pieces;
}

/**
 * Sum the `count` field for all records matching buyer + item.
 * Count is a whole number (positive for add, negative for remove).
 */
export function computeBalance(
  records: Array<{ buyer: number; item: string; count: number }>,
  buyer: number,
  item: string,
): number {
  let total = 0;
  for (const r of records) {
    if (r.buyer === buyer && r.item === item) {
      total += r.count;
    }
  }
  return total;
}
