import { describe, it, expect } from 'vitest';
import { parsePrice, formatPrice, ensureKc } from './price.js';

describe('parsePrice', () => {
  it('parses Czech format "12,50 Kč"', () => {
    expect(parsePrice('12,50 Kč')).toBe(12.5);
  });

  it('parses integer string', () => {
    expect(parsePrice('100')).toBe(100);
  });

  it('parses "46 Kč"', () => {
    expect(parsePrice('46 Kč')).toBe(46);
  });

  it('returns 0 for empty string', () => {
    expect(parsePrice('')).toBe(0);
  });

  it('returns 0 for garbage', () => {
    expect(parsePrice('abc')).toBe(0);
  });
});

describe('formatPrice', () => {
  it('formats whole number without decimals', () => {
    expect(formatPrice(100)).toBe('100 Kč');
  });

  it('formats decimal with comma', () => {
    expect(formatPrice(12.5)).toBe('12,50 Kč');
  });

  it('round-trips with parsePrice', () => {
    expect(parsePrice(formatPrice(46))).toBe(46);
    expect(parsePrice(formatPrice(12.5))).toBe(12.5);
  });
});

describe('ensureKc', () => {
  it('appends " Kč" when missing', () => {
    expect(ensureKc('100')).toBe('100 Kč');
  });

  it('does not double-append', () => {
    expect(ensureKc('100 Kč')).toBe('100 Kč');
  });

  it('handles case-insensitive "kč"', () => {
    expect(ensureKc('50 kč')).toBe('50 kč');
  });
});
