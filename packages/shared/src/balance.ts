/**
 * Sum the `count` field for all records matching buyer + item.
 * Count is a signed integer (positive = add, negative = remove).
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
