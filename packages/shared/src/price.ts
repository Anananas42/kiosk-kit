/** Parse a price string like "12,50 Kč", "12.5", or "€12.50" into a number. Returns 0 for invalid. */
export function parsePrice(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d,.]/g, "");
  // If both dots and commas present, dots are thousand separators (e.g. "1.000,50")
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
}

/** Format an amount using Intl.NumberFormat with the given locale and ISO 4217 currency code. */
export function formatCurrency(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
