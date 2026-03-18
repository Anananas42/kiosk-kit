import { describe, it, expect } from 'vitest';
import { getDeliveryDate, noDeliveryDaysSet, isOrderingAllowed, getCurrentWeekday } from './preorder.js';

describe('getDeliveryDate', () => {
  it('before 11:00 Prague → next day', () => {
    // 2026-03-15T08:00:00Z is 09:00 CET (winter) = before 11:00
    expect(getDeliveryDate('2026-03-15T08:00:00Z')).toBe('2026-03-16');
  });

  it('at/after 11:00 Prague → day after next', () => {
    // 2026-03-15T10:00:00Z is 11:00 CET = at 11:00
    expect(getDeliveryDate('2026-03-15T10:00:00Z')).toBe('2026-03-17');
  });

  it('afternoon → day after next', () => {
    // 2026-03-15T14:00:00Z is 15:00 CET
    expect(getDeliveryDate('2026-03-15T14:00:00Z')).toBe('2026-03-17');
  });

  it('invalid timestamp → null', () => {
    expect(getDeliveryDate('not-a-date')).toBeNull();
  });

  it('empty string → null', () => {
    expect(getDeliveryDate('')).toBeNull();
  });

  it('skips no-delivery days (Saturday/Sunday)', () => {
    const noDelivery = new Set([0, 6]); // Sunday=0, Saturday=6
    // 2026-03-13 is Friday, 14:00 CET → base delivery = 2026-03-15 (Sunday)
    // Sunday is skipped → Monday 2026-03-16
    expect(getDeliveryDate('2026-03-13T13:00:00Z', noDelivery)).toBe('2026-03-16');
  });

  it('skips consecutive no-delivery days', () => {
    const noDelivery = new Set([0, 6]); // Sunday=0, Saturday=6
    // 2026-03-12 is Thursday, 14:00 CET → base delivery = 2026-03-14 (Saturday)
    // Saturday skipped → Sunday skipped → Monday 2026-03-16
    expect(getDeliveryDate('2026-03-12T13:00:00Z', noDelivery)).toBe('2026-03-16');
  });

  it('no skip when delivery day is allowed', () => {
    const noDelivery = new Set([0, 6]); // Sunday=0, Saturday=6
    // 2026-03-11 is Wednesday, 14:00 CET → base delivery = 2026-03-13 (Friday)
    // Friday is allowed
    expect(getDeliveryDate('2026-03-11T13:00:00Z', noDelivery)).toBe('2026-03-13');
  });
});

describe('noDeliveryDaysSet', () => {
  it('builds set from delivery days array', () => {
    // All true except Sunday (0) and Saturday (6)
    const days = [false, true, true, true, true, true, false];
    const set = noDeliveryDaysSet(days);
    expect(set).toEqual(new Set([0, 6]));
  });

  it('empty when all days are delivery days', () => {
    const days = Array(7).fill(true);
    expect(noDeliveryDaysSet(days)).toEqual(new Set());
  });
});

describe('isOrderingAllowed', () => {
  it('returns true when current day is allowed', () => {
    const days = Array(7).fill(true);
    expect(isOrderingAllowed(days)).toBe(true);
  });

  it('returns false when all days disabled', () => {
    const days = Array(7).fill(false);
    expect(isOrderingAllowed(days)).toBe(false);
  });
});

describe('getCurrentWeekday', () => {
  it('returns a number 0-6', () => {
    const day = getCurrentWeekday();
    expect(day).toBeGreaterThanOrEqual(0);
    expect(day).toBeLessThanOrEqual(6);
  });
});
