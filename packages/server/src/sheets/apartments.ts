import { CONFIG_SHEET, sheetRange, CONFIG_COLUMNS, validateApartments, type Apartment } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

export class ApartmentValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Apartment config validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}`);
    this.name = 'ApartmentValidationError';
  }
}

export async function readApartments(): Promise<Apartment[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(CONFIG_SHEET, 'A1:ZZ'),
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const colMap = buildColumnMap(rows[0].map(String));

  const rawRows = rows.slice(1).map((row) => ({
    id: getCol(row, colMap, CONFIG_COLUMNS.id),
    label: getCol(row, colMap, CONFIG_COLUMNS.label),
  }));

  const result = validateApartments(rawRows);
  if (!result.ok) {
    throw new ApartmentValidationError(result.errors);
  }
  return result.data;
}
