import { CATALOG_SHEET, validateCatalog, type CatalogCategory } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';

export async function readCatalog(): Promise<CatalogCategory[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: `${CATALOG_SHEET}!A2:D`,
  });
  return validateCatalog(res.data.values ?? []);
}
