import { PASTRY_SHEET, sheetRange, getDeliveryDate, noDeliveryDaysSet } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { readRecords } from './evidence.js';
import { getPastryCategories } from './catalog.js';
import { readPastryConfig } from './pastry-config.js';
import { env } from '../env.js';

function pastryWindowLabel(deliveryDateStr: string): string {
  const [y, m, d] = deliveryDateStr.split('-').map(Number);
  const delivery = new Date(Date.UTC(y, m - 1, d));
  const d1 = new Date(delivery);
  d1.setUTCDate(d1.getUTCDate() - 1);
  const d2 = new Date(delivery);
  d2.setUTCDate(d2.getUTCDate() - 2);
  const fmt = (date: Date) => `${date.getUTCDate()}.${date.getUTCMonth() + 1}.`;
  return `${fmt(d2)} 11:01 – ${fmt(d1)} 11:00`;
}

export async function updatePastrySheet(): Promise<void> {
  const sheets = await getSheetsClient();
  const pastryNames = await getPastryCategories();
  const records = await readRecords();
  const pastryConfig = await readPastryConfig();
  const noDeliveryDays = noDeliveryDaysSet(pastryConfig.deliveryDays);

  const pivot: Record<string, Record<string, number>> = {};
  const dateSet = new Set<string>();
  const itemSet = new Set<string>();

  for (const r of records) {
    if (!pastryNames.has(r.category)) continue;
    const dd = getDeliveryDate(r.timestamp, noDeliveryDays);
    if (!dd) continue;
    itemSet.add(r.item);
    dateSet.add(dd);
    if (!pivot[r.item]) pivot[r.item] = {};
    pivot[r.item][dd] = (pivot[r.item][dd] || 0) + r.count;
  }

  if (dateSet.size === 0) return;

  const sortedDates = [...dateSet].sort().reverse();
  const sortedItems = [...itemSet].sort();

  const headerRow = ['Položka', ...sortedDates.map((d) => {
    const [y, mo, dy] = d.split('-').map(Number);
    return `${dy}. ${mo}. ${y}`;
  })];
  const windowRow = ['Okno objednávek', ...sortedDates.map(pastryWindowLabel)];
  const dataRows = sortedItems.map((item) =>
    [item, ...sortedDates.map((d) => {
      const qty = pivot[item]?.[d] ?? 0;
      return qty > 0 ? qty : 0;
    })],
  );

  const values = [headerRow, windowRow, ...dataRows];

  // Ensure sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === PASTRY_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: PASTRY_SHEET } } }] },
    });
  } else {
    // Compare with current content — skip if unchanged
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: env.spreadsheetId,
        range: sheetRange(PASTRY_SHEET, 'A1:ZZ'),
      });
      const existingValues = existing.data.values ?? [];
      const same =
        existingValues.length === values.length &&
        values.every((row, i) =>
          row.length === (existingValues[i]?.length ?? 0) &&
          row.every((cell, j) => String(cell) === String(existingValues[i][j] ?? '')),
        );
      if (same) return;
    } catch {
      // On read error, proceed with overwrite
    }
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(PASTRY_SHEET, 'A:ZZ'),
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(PASTRY_SHEET, 'A1'),
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  console.log(`[sheets] Pastry overview updated: ${sortedItems.length} items × ${sortedDates.length} dates`);
}
