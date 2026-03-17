import { SETTINGS_SHEET, SETTINGS_COLUMNS, sheetRange, DEFAULT_KIOSK_SETTINGS, type KioskSettings } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

export async function readSettings(): Promise<KioskSettings> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(SETTINGS_SHEET, 'A1:ZZ'),
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return DEFAULT_KIOSK_SETTINGS;

  const colMap = buildColumnMap(rows[0].map(String));
  const kvMap = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const key = getCol(row, colMap, SETTINGS_COLUMNS.key).trim();
    const value = getCol(row, colMap, SETTINGS_COLUMNS.value).trim();
    if (key) kvMap.set(key, value);
  }

  function parsePositiveInt(key: string, fallback: number): number {
    const raw = kvMap.get(key);
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return isNaN(n) || n <= 0 ? fallback : n;
  }

  return {
    idleDimMs: parsePositiveInt('idleDimMs', DEFAULT_KIOSK_SETTINGS.idleDimMs),
    inactivityTimeoutMs: parsePositiveInt('inactivityTimeoutMs', DEFAULT_KIOSK_SETTINGS.inactivityTimeoutMs),
    maintenance: kvMap.get('maintenance')?.toLowerCase() === 'ano',
  };
}
