import { TZ } from './constants.js';

/**
 * Calculate pastry delivery date from an order timestamp.
 * Orders before 11:00 Prague time → next day.
 * Orders at or after 11:00 → day after next.
 * Then skips any days in noDeliveryDays (weekday indices, 0=Sunday).
 * Returns ISO date string "YYYY-MM-DD".
 */
export function getDeliveryDate(timestamp: string, noDeliveryDays?: Set<number>): string | null {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return null;

  const hour = parseInt(
    new Intl.DateTimeFormat('en', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d),
    10,
  );
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

  const [y, m, day] = localDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, day + (hour < 11 ? 1 : 2)));

  // Skip non-delivery days (guard against infinite loop: max 7 skips)
  if (noDeliveryDays && noDeliveryDays.size > 0) {
    for (let i = 0; i < 7 && noDeliveryDays.has(base.getUTCDay()); i++) {
      base.setUTCDate(base.getUTCDate() + 1);
    }
  }

  const by = base.getUTCFullYear();
  const bm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const bd = String(base.getUTCDate()).padStart(2, '0');
  return `${by}-${bm}-${bd}`;
}

/**
 * Get a human-readable delivery date for display.
 * Uses Europe/Prague timezone for "now".
 * Returns e.g. "pondělí 15. 3."
 */
export function getDeliveryDateLabel(noDeliveryDays?: Set<number>): string {
  const now = new Date();
  const deliveryDate = getDeliveryDate(now.toISOString(), noDeliveryDays);
  if (!deliveryDate) return '';

  const [y, m, d] = deliveryDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  const DAYS_CS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const day = DAYS_CS[date.getUTCDay()];
  return `${day} ${d}. ${m}.`;
}

/**
 * Get the current weekday index (0=Sunday) in Prague timezone.
 */
export function getCurrentWeekday(): number {
  const now = new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Check whether pastry ordering is currently allowed.
 * Returns true if today (Prague time) is a valid ordering day.
 */
export function isOrderingAllowed(orderingDays: boolean[]): boolean {
  return orderingDays[getCurrentWeekday()] !== false;
}

/**
 * Format an ISO date string to Czech long format.
 * e.g. "2026-03-14" → "pátek 14. března 2026"
 */
export function formatDateCs(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Build a Set of weekday indices (0=Sunday) where delivery is disabled.
 */
export function noDeliveryDaysSet(deliveryDays: boolean[]): Set<number> {
  const set = new Set<number>();
  for (let i = 0; i < 7; i++) {
    if (deliveryDays[i] === false) set.add(i);
  }
  return set;
}
