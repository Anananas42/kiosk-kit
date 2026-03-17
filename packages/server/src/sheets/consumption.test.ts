import { describe, it, expect } from 'vitest';
import { buildConsumptionValues } from './consumption.js';
import type { CatalogCategory, EvidenceRow, Apartment } from '@zahumny/shared';

function makeRecord(overrides: Partial<EvidenceRow>): EvidenceRow {
  return {
    timestamp: '2026-01-15T10:00:00Z',
    buyer: 1,
    count: 1,
    category: 'Alko',
    item: 'Pivo',
    itemId: 'P01',
    quantity: '0,5 l',
    price: '46 Kč',
    ...overrides,
  };
}

const catalog: CatalogCategory[] = [
  {
    id: 'alko',
    name: 'Alko',
    pastry: false,
    items: [
      { id: 'P01', name: 'Pivo', quantity: '0,5 l', price: '46 Kč', dphRate: '21%' },
    ],
  },
  {
    id: 'pecivo',
    name: 'Pečivo',
    pastry: true,
    items: [
      { id: 'R01', name: 'Rohlík', quantity: '1 ks', price: '5 Kč', dphRate: '15%' },
    ],
  },
];

const apartments: Apartment[] = [
  { id: 1, label: 'Apt 1' },
  { id: 5, label: 'Apt 5' },
];

describe('buildConsumptionValues', () => {
  it('aggregates 2 items across 2 apartments with correct cost/count strings', () => {
    const records = [
      makeRecord({ buyer: 1, count: 10, itemId: 'P01', item: 'Pivo' }),
      makeRecord({ buyer: 5, count: 2, itemId: 'P01', item: 'Pivo' }),
      makeRecord({ buyer: 1, count: 10, itemId: 'R01', item: 'Rohlík', category: 'Pečivo' }),
      makeRecord({ buyer: 5, count: 5, itemId: 'R01', item: 'Rohlík', category: 'Pečivo' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments)!;
    expect(result).not.toBeNull();

    // Header
    expect(result[0][0]).toMatch(/^Souhrn konzumace/);
    expect(result[0]).toContain('Množství');
    expect(result[0]).toContain('Cena');
    expect(result[0]).toContain('Sazba DPH');
    expect(result[0]).toContain('Apt 1');
    expect(result[0]).toContain('Apt 5');
    expect(result[0][result[0].length - 1]).toBe('Celkově');

    // Items sorted alphabetically: Pivo, Rohlík
    expect(result[1][0]).toBe('Pivo');
    expect(result[1][4]).toBe('460 (10)');  // Apt 1
    expect(result[1][5]).toBe('92 (2)');    // Apt 5
    expect(result[1][6]).toBe('552 (12)');  // Celkově

    expect(result[2][0]).toBe('Rohlík');
    expect(result[2][4]).toBe('50 (10)');   // Apt 1
    expect(result[2][5]).toBe('25 (5)');    // Apt 5
    expect(result[2][6]).toBe('75 (15)');   // Celkově

    // Celkem row (numbers for Kč formatting)
    expect(result[3][0]).toBe('Celkem');
    expect(result[3][4]).toBe(510);
    expect(result[3][5]).toBe(117);
    expect(result[3][6]).toBe(627);
  });

  it('produces DPH breakdown rows sorted by rate', () => {
    const records = [
      makeRecord({ buyer: 1, count: 10, itemId: 'P01', item: 'Pivo' }),
      makeRecord({ buyer: 1, count: 10, itemId: 'R01', item: 'Rohlík', category: 'Pečivo' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments)!;
    // After Celkem, DPH rows sorted: 15%, 21%
    const dph15 = result.find((r) => r[0].includes('DPH 15%'));
    const dph21 = result.find((r) => r[0].includes('DPH 21%'));
    expect(dph15).toBeDefined();
    expect(dph21).toBeDefined();

    // 15% row should be before 21% row
    const idx15 = result.indexOf(dph15!);
    const idx21 = result.indexOf(dph21!);
    expect(idx15).toBeLessThan(idx21);

    // Apt 1 DPH 15%: 50 (Rohlík: 10 × 5)
    expect(dph15![4]).toBe(50);
    // Apt 1 DPH 21%: 460 (Pivo: 10 × 46)
    expect(dph21![4]).toBe(460);
  });

  it('shows items not in catalog with empty metadata and zero cost', () => {
    const records = [
      makeRecord({ buyer: 1, count: 3, itemId: '', item: 'Mystery', category: 'Unknown' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments)!;
    expect(result).not.toBeNull();
    // Item row: name=Mystery, quantity='', price='', dphRate=''
    expect(result[1][0]).toBe('Mystery');
    expect(result[1][1]).toBe('');  // quantity
    expect(result[1][2]).toBe('');  // price
    expect(result[1][3]).toBe('');  // dphRate
    expect(result[1][4]).toBe('0 (3)');  // cost=0 since no catalog price
  });

  it('excludes net-zero items', () => {
    const records = [
      makeRecord({ buyer: 1, count: 5, itemId: 'P01', item: 'Pivo' }),
      makeRecord({ buyer: 1, count: -5, itemId: 'P01', item: 'Pivo' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments);
    expect(result).toBeNull();
  });

  it('excludes apartments with no purchases from columns', () => {
    const records = [
      makeRecord({ buyer: 1, count: 2, itemId: 'P01', item: 'Pivo' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments)!;
    expect(result[0]).toContain('Apt 1');
    expect(result[0]).not.toContain('Apt 5');
  });

  it('returns null for empty records', () => {
    expect(buildConsumptionValues([], catalog, apartments)).toBeNull();
  });

  it('formats date range in header', () => {
    const records = [
      makeRecord({ buyer: 1, count: 1, timestamp: '2026-01-01T08:00:00Z' }),
      makeRecord({ buyer: 1, count: 1, timestamp: '2026-03-15T18:00:00Z' }),
    ];

    const result = buildConsumptionValues(records, catalog, apartments)!;
    expect(result[0][0]).toBe('Souhrn konzumace (1.1.–15.3.)');
  });
});
