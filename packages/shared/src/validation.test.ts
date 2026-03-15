import { describe, it, expect } from 'vitest';
import { validateRecordRequest, validateCatalog } from './validation.js';

describe('validateRecordRequest', () => {
  const valid = { buyer: 1, delta: 1, category: 'Alko', item: 'Beer', quantity: '0,5 l', price: '46 Kč' };

  it('accepts a valid request', () => {
    const result = validateRecordRequest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.buyer).toBe(1);
      expect(result.data.delta).toBe(1);
    }
  });

  it('rejects null body', () => {
    expect(validateRecordRequest(null)).toEqual({ ok: false, error: 'Invalid request body' });
  });

  it('rejects non-integer buyer', () => {
    expect(validateRecordRequest({ ...valid, buyer: 1.5 })).toEqual({ ok: false, error: 'Invalid buyer' });
  });

  it('rejects buyer < 1', () => {
    expect(validateRecordRequest({ ...valid, buyer: 0 })).toEqual({ ok: false, error: 'Invalid buyer' });
  });

  it('rejects invalid delta', () => {
    expect(validateRecordRequest({ ...valid, delta: 2 })).toEqual({ ok: false, error: 'Invalid delta (must be 1 or -1)' });
  });

  it('rejects missing category', () => {
    expect(validateRecordRequest({ ...valid, category: '' })).toEqual({ ok: false, error: 'Missing category' });
  });

  it('rejects missing item', () => {
    expect(validateRecordRequest({ ...valid, item: '' })).toEqual({ ok: false, error: 'Missing item' });
  });

  it('defaults quantity and price to empty string', () => {
    const result = validateRecordRequest({ buyer: 1, delta: -1, category: 'Alko', item: 'Beer' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.quantity).toBe('');
      expect(result.data.price).toBe('');
    }
  });
});

describe('validateCatalog', () => {
  it('groups items by category', () => {
    const rows = [
      ['Alko', 'Beer', '0,5 l', '46 Kč'],
      ['Alko', 'Wine', '0,2 l', '60 Kč'],
      ['Nealko', 'Juice', '0,3 l', '30 Kč'],
    ];
    const result = validateCatalog(rows);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alko');
    expect(result[0].items).toHaveLength(2);
    expect(result[1].name).toBe('Nealko');
  });

  it('skips rows with missing category or item name', () => {
    const rows = [
      ['Alko', 'Beer', '0,5 l', '46 Kč'],
      ['', 'Orphan', '', ''],
      ['Alko', '', '', ''],
    ];
    const result = validateCatalog(rows);
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
  });

  it('handles sparse rows (missing quantity/price)', () => {
    const rows = [['Alko', 'Beer']];
    const result = validateCatalog(rows);
    expect(result[0].items[0]).toEqual({ name: 'Beer', quantity: '', price: '' });
  });

  it('returns empty for empty input', () => {
    expect(validateCatalog([])).toEqual([]);
  });
});
