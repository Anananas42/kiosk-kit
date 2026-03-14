/** Parse a Czech price string like "12,50 Kč" or "12.5" into a number. Returns 0 for invalid. */
export function parsePrice(str: string): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^\d,.]/g, '').replace(',', '.'));
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
