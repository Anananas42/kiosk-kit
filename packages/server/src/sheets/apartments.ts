import { CONFIG_SHEET, CONFIG_COLUMNS, type Apartment } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

export async function readApartments(): Promise<Apartment[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: `${CONFIG_SHEET}!A1:ZZ`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const colMap = buildColumnMap(rows[0].map(String));

  return rows.slice(1)
    .map((row) => ({
      id: getCol(row, colMap, CONFIG_COLUMNS.id),
      label: getCol(row, colMap, CONFIG_COLUMNS.label),
    }))
    .filter(({ id }) => id)
    .map(({ id, label }) => ({
      id: Number(id),
      label: label?.trim() || id,
    }));
}
