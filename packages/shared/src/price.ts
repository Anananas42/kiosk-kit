/** Parse a Czech price string like "12,50 Kč" or "12.5" into a number. Returns 0 for invalid. */
export function parsePrice(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d,.]/g, '');
  // If both dots and commas present, dots are thousand separators (e.g. "1.000,50")
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

/** Format a number as a Czech price string like "12,50 Kč". Drops decimals if whole. */
export function formatPrice(amount: number): string {
  const formatted = amount % 1 === 0 ? String(amount) : amount.toFixed(2).replace('.', ',');
  return `${formatted} Kč`;
}

/** Ensure a price string ends with " Kč". */
export function ensureKc(price: string): string {
  const s = price.trim();
  return s.toLowerCase().includes('kč') ? s : `${s} Kč`;
}
