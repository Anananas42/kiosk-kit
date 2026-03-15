import {
  PASTRY_CONFIG_SHEET,
  PASTRY_CONFIG_COLUMNS,
  WEEKDAY_NAMES_CS,
  CONFIG_YES,
  sheetRange,
  type PastryConfig,
} from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { buildColumnMap, getCol } from './column-map.js';

/** Default config: ordering and delivery allowed every day. */
const DEFAULT_CONFIG: PastryConfig = {
  orderingDays: Array(7).fill(true),
  deliveryDays: Array(7).fill(true),
};

/**
 * Map Czech day name to JS weekday index (0=Sunday).
 * Case-insensitive comparison.
 */
function dayNameToIndex(name: string): number | null {
  const normalized = name.trim().toLowerCase();
  const idx = WEEKDAY_NAMES_CS.findIndex((n) => n.toLowerCase() === normalized);
  return idx >= 0 ? idx : null;
}

export async function readPastryConfig(): Promise<PastryConfig> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(PASTRY_CONFIG_SHEET, 'A1:ZZ'),
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return DEFAULT_CONFIG;

  const colMap = buildColumnMap(rows[0].map(String));

  const ordering = Array(7).fill(true) as boolean[];
  const delivery = Array(7).fill(true) as boolean[];

  for (const row of rows.slice(1)) {
    const dayName = getCol(row, colMap, PASTRY_CONFIG_COLUMNS.day);
    const idx = dayNameToIndex(dayName);
    if (idx === null) continue;

    const orderVal = getCol(row, colMap, PASTRY_CONFIG_COLUMNS.ordering).trim().toLowerCase();
    const deliverVal = getCol(row, colMap, PASTRY_CONFIG_COLUMNS.delivery).trim().toLowerCase();

    ordering[idx] = orderVal === CONFIG_YES;
    delivery[idx] = deliverVal === CONFIG_YES;
  }

  return { orderingDays: ordering, deliveryDays: delivery };
}
