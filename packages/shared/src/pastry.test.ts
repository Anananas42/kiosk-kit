import { describe, it, expect } from 'vitest';
import { getDeliveryDate } from './pastry.js';

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
});
