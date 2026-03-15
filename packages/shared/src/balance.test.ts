import { describe, it, expect } from 'vitest';
import { computeBalance } from './balance.js';

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

  it('matches by itemId when provided', () => {
    const records = [
      { buyer: 1, item: 'Beer', itemId: 'beer-1', count: 3 },
      { buyer: 1, item: 'Beer', itemId: 'beer-2', count: 2 },
    ];
    expect(computeBalance(records, 1, 'Beer', 'beer-1')).toBe(3);
    expect(computeBalance(records, 1, 'Beer', 'beer-2')).toBe(2);
  });

  it('falls back to name for legacy records without itemId', () => {
    const records = [
      { buyer: 1, item: 'Beer', count: 3 },
      { buyer: 1, item: 'Beer', itemId: '', count: 2 },
      { buyer: 1, item: 'Beer', itemId: 'beer-1', count: 5 },
    ];
    // Legacy records (no itemId) + ID-matched records
    expect(computeBalance(records, 1, 'Beer', 'beer-1')).toBe(10);
  });

  it('matches by name only when no itemId queried', () => {
    const records = [
      { buyer: 1, item: 'Beer', itemId: 'beer-1', count: 3 },
      { buyer: 1, item: 'Beer', count: 2 },
    ];
    expect(computeBalance(records, 1, 'Beer')).toBe(5);
  });
});
