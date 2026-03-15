import { CATALOG_SHEET, sheetRange, CATALOG_COLUMNS, CATALOG_TYPE_PASTRY, validateCatalog, type CatalogCategory } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

export async function readCatalog(): Promise<CatalogCategory[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(CATALOG_SHEET, 'A1:ZZ'),
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const colMap = buildColumnMap(rows[0].map(String));
  const dataRows = rows.slice(1).map((row) => [
    getCol(row, colMap, CATALOG_COLUMNS.category),
    getCol(row, colMap, CATALOG_COLUMNS.type),
    getCol(row, colMap, CATALOG_COLUMNS.name),
    getCol(row, colMap, CATALOG_COLUMNS.quantity),
    getCol(row, colMap, CATALOG_COLUMNS.price),
  ]);

  return validateCatalog(dataRows, CATALOG_TYPE_PASTRY);
}

/** Returns the set of category names marked as pastry in the catalog. */
export async function getPastryCategories(): Promise<Set<string>> {
  const catalog = await readCatalog();
  return new Set(catalog.filter((c) => c.pastry).map((c) => c.name));
}
