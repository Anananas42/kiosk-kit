import { describe, it, expect } from 'vitest';
import { computeBalance, deriveCount } from './balance.js';

describe('deriveCount', () => {
  it('parses "N ks" quantity for additions', () => {
    expect(deriveCount(1, '3 ks')).toBe(3);
  });

  it('parses "N ks" quantity for removals', () => {
    expect(deriveCount(-1, '3 ks')).toBe(-3);
  });

  it('defaults to 1 for non-ks quantities', () => {
    expect(deriveCount(1, '0,5 l')).toBe(1);
    expect(deriveCount(-1, '0,5 l')).toBe(-1);
  });

  it('defaults to 1 for empty quantity', () => {
    expect(deriveCount(1, '')).toBe(1);
  });
});

describe('computeBalance', () => {
  it('sums counts for matching buyer + item', () => {
    const records = [
      { buyer: 1, item: 'Beer', count: 1 },
      { buyer: 1, item: 'Beer', count: 1 },
      { buyer: 1, item: 'Beer', count: 1 },
    ];
    expect(computeBalance(records, 1, 'Beer')).toBe(3);
  });

  it('handles mixed adds and removes', () => {
    const records = [
      { buyer: 1, item: 'Beer', count: 3 },
      { buyer: 1, item: 'Beer', count: -1 },
    ];
    expect(computeBalance(records, 1, 'Beer')).toBe(2);
  });

  it('returns 0 for empty records', () => {
    expect(computeBalance([], 1, 'Beer')).toBe(0);
  });

  it('returns negative when more removes than adds', () => {
    const records = [
      { buyer: 1, item: 'Beer', count: 1 },
      { buyer: 1, item: 'Beer', count: -3 },
    ];
    expect(computeBalance(records, 1, 'Beer')).toBe(-2);
  });

  it('only counts matching item for the buyer', () => {
    const records = [
      { buyer: 1, item: 'Beer', count: 5 },
      { buyer: 1, item: 'Wine', count: 2 },
      { buyer: 2, item: 'Beer', count: 10 },
    ];
    expect(computeBalance(records, 1, 'Beer')).toBe(5);
    expect(computeBalance(records, 1, 'Wine')).toBe(2);
    expect(computeBalance(records, 2, 'Beer')).toBe(10);
  });
});
