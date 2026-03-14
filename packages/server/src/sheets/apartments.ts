import { CONFIG_SHEET, type Apartment } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';

export async function readApartments(): Promise<Apartment[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: `${CONFIG_SHEET}!A2:B`,
  });

  return (res.data.values ?? [])
    .filter(([id]) => id)
    .map(([id, label]) => ({
      id: Number(id),
      label: label?.trim() || String(id),
    }));
}
