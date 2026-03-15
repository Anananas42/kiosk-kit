/**
 * Build a column name → index map from a header row.
 * Keys are trimmed, case-preserved.
 */
export function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const name = (headerRow[i] ?? '').trim();
    if (name) map[name] = i;
  }
  return map;
}

/** Get a cell value by column name, returning '' if the column or cell is missing. */
export function getCol(row: unknown[], map: Record<string, number>, name: string): string {
  const idx = map[name];
  if (idx === undefined) return '';
  const val = row[idx];
  return val == null ? '' : String(val);
}
