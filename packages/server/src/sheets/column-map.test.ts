import { describe, it, expect } from 'vitest';
import { buildColumnMap, getCol } from './column-map.js';

describe('buildColumnMap', () => {
  it('maps header names to indices', () => {
    const map = buildColumnMap(['Kategorie', 'ID', 'Název', 'množství', 'cena']);
    expect(map).toEqual({ Kategorie: 0, ID: 1, Název: 2, množství: 3, cena: 4 });
  });

  it('trims whitespace', () => {
    const map = buildColumnMap([' Foo ', 'Bar']);
    expect(map).toEqual({ Foo: 0, Bar: 1 });
  });

  it('skips empty headers', () => {
    const map = buildColumnMap(['A', '', 'C']);
    expect(map).toEqual({ A: 0, C: 2 });
  });

  it('returns empty map for empty input', () => {
    expect(buildColumnMap([])).toEqual({});
  });
});

describe('getCol', () => {
  const map = buildColumnMap(['Kategorie', 'ID', 'Název']);

  it('returns cell value by column name', () => {
    expect(getCol(['Alko', '1', 'Beer'], map, 'Název')).toBe('Beer');
  });

  it('returns empty string for missing column name', () => {
    expect(getCol(['Alko', '1', 'Beer'], map, 'nonexistent')).toBe('');
  });

  it('returns empty string when row is shorter than column index', () => {
    expect(getCol(['Alko'], map, 'Název')).toBe('');
  });

  it('handles null/undefined cell values as empty', () => {
    expect(getCol([null, undefined, 'Beer'], map, 'Kategorie')).toBe('');
    expect(getCol([null, undefined, 'Beer'], map, 'ID')).toBe('');
  });
});
