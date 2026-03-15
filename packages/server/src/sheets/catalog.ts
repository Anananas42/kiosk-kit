import { CATALOG_SHEET, CATALOG_COLUMNS, validateCatalog, type CatalogCategory } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

export async function readCatalog(): Promise<CatalogCategory[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: `${CATALOG_SHEET}!A1:ZZ`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const colMap = buildColumnMap(rows[0].map(String));
  const dataRows = rows.slice(1).map((row) => [
    getCol(row, colMap, CATALOG_COLUMNS.category),
    getCol(row, colMap, CATALOG_COLUMNS.name),
    getCol(row, colMap, CATALOG_COLUMNS.quantity),
    getCol(row, colMap, CATALOG_COLUMNS.price),
  ]);

  return validateCatalog(dataRows);
}
