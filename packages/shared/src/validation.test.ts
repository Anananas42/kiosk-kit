import { describe, it, expect } from 'vitest';
import { validateRecordRequest } from './validation.js';

describe('validateRecordRequest', () => {
  const valid = { buyer: 1, count: 1, category: 'Alko', item: 'Beer', quantity: '0,5 l', price: '46 Kč' };

  it('accepts a valid add request', () => {
    const result = validateRecordRequest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.buyer).toBe(1);
      expect(result.data.count).toBe(1);
    }
  });

  it('accepts a valid remove request', () => {
    const result = validateRecordRequest({ ...valid, count: -3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(-3);
  });

  it('accepts large counts', () => {
    const result = validateRecordRequest({ ...valid, count: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(10);
  });

  it('rejects null body', () => {
    expect(validateRecordRequest(null)).toEqual({ ok: false, error: 'Invalid request body' });
  });

  it('rejects non-integer buyer', () => {
    expect(validateRecordRequest({ ...valid, buyer: 1.5 }).ok).toBe(false);
  });

  it('rejects buyer < 1', () => {
    expect(validateRecordRequest({ ...valid, buyer: 0 }).ok).toBe(false);
  });

  it('rejects count of 0', () => {
    expect(validateRecordRequest({ ...valid, count: 0 })).toEqual({ ok: false, error: 'Invalid count (must be a nonzero integer)' });
  });

  it('rejects non-integer count', () => {
    expect(validateRecordRequest({ ...valid, count: 1.5 }).ok).toBe(false);
  });

  it('rejects missing category', () => {
    expect(validateRecordRequest({ ...valid, category: '' }).ok).toBe(false);
  });

  it('rejects missing item', () => {
    expect(validateRecordRequest({ ...valid, item: '' }).ok).toBe(false);
  });

  it('defaults quantity and price to empty string', () => {
    const result = validateRecordRequest({ buyer: 1, count: -1, category: 'Alko', item: 'Beer' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.quantity).toBe('');
      expect(result.data.price).toBe('');
    }
  });
});

describe('validateRecordRequest with itemId', () => {
  it('passes through itemId when provided', () => {
    const result = validateRecordRequest({
      buyer: 1, count: 1, category: 'Alko', item: 'Beer', itemId: 'beer-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.itemId).toBe('beer-1');
  });

  it('leaves itemId undefined when not provided', () => {
    const result = validateRecordRequest({
      buyer: 1, count: 1, category: 'Alko', item: 'Beer',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.itemId).toBeUndefined();
  });
});
