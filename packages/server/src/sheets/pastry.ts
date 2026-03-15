import { PASTRY_SHEET, TZ, sheetRange, getDeliveryDate, noDeliveryDaysSet } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { readRecords } from './evidence.js';
import { readApartments } from './apartments.js';
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

export const DAY_SHEET_PREFIX = 'Výdej pečiva ';

export function daySheetName(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${DAY_SHEET_PREFIX}${d}.${m}.`;
}

/**
 * Build the grid values for a single delivery-date sheet.
 * Returns null if no positive orders exist for the date.
 */
export function buildDaySheetValues(
  records: Array<{ category: string; item: string; buyer: number; timestamp: string }>,
  pastryNames: Set<string>,
  noDeliveryDays: Set<number>,
  targetDate: string,
  apartmentLabel: Map<number, string>,
): (string | number)[][] | null {
  const itemMap: Record<string, Record<number, number>> = {};

  for (const r of records) {
    if (!pastryNames.has(r.category)) continue;
    const dd = getDeliveryDate(r.timestamp, noDeliveryDays);
    if (dd !== targetDate) continue;
    if (!itemMap[r.item]) itemMap[r.item] = {};
    itemMap[r.item][r.buyer] = (itemMap[r.item][r.buyer] || 0) + 1;
  }

  const items = Object.keys(itemMap).sort();
  const buyerSet = new Set<number>();
  for (const item of items) {
    for (const [buyer, qty] of Object.entries(itemMap[item])) {
      if (qty > 0) buyerSet.add(Number(buyer));
    }
  }
  const buyers = [...buyerSet].sort((a, b) => a - b);
  if (buyers.length === 0) return null;

  const headerRow: (string | number)[] = [
    'Položka',
    ...buyers.map((b) => apartmentLabel.get(b) ?? String(b)),
    'Celkem',
  ];
  const dataRows = items.map((item) => {
    const counts = buyers.map((b) => itemMap[item][b] ?? 0);
    const total = counts.reduce((s, n) => s + n, 0);
    return total > 0 ? [item, ...counts.map((c) => c > 0 ? c : ''), total] as (string | number)[] : null;
  }).filter(Boolean) as (string | number)[][];

  if (dataRows.length === 0) return null;
  return [headerRow, ...dataRows];
}

/** Get today's date in Prague timezone as "YYYY-MM-DD". */
function todayPrague(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Create/update per-delivery-date sheets ("Výdej pečiva 15.3.") for printing.
 * Rows = pastry items, columns = apartments, last column = total.
 * Only creates sheets for today and future delivery dates.
 */
export async function updatePastryDaySheets(): Promise<void> {
  const sheets = await getSheetsClient();
  const pastryNames = await getPastryCategories();
  const records = await readRecords();
  const pastryConfig = await readPastryConfig();
  const noDeliveryDays = noDeliveryDaysSet(pastryConfig.deliveryDays);
  const apartments = await readApartments();
  const apartmentLabel = new Map(apartments.map((a) => [a.id, a.label]));

  // Pivot: deliveryDate → item → buyer → quantity
  const pivot: Record<string, Record<string, Record<number, number>>> = {};
  const today = todayPrague();

  for (const r of records) {
    if (!pastryNames.has(r.category)) continue;
    const dd = getDeliveryDate(r.timestamp, noDeliveryDays);
    if (!dd || dd < today) continue;

    if (!pivot[dd]) pivot[dd] = {};
    if (!pivot[dd][r.item]) pivot[dd][r.item] = {};
    pivot[dd][r.item][r.buyer] = (pivot[dd][r.item][r.buyer] || 0) + r.count;
  }

  const dates = Object.keys(pivot).sort();
  console.log(`[sheets] Day sheets: today=${today}, dates with orders: [${dates.join(', ')}], pastry records: ${records.filter(r => pastryNames.has(r.category)).length}`);
  if (dates.length === 0) return;

  // Fetch existing sheet titles once
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
  const existingTitles = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);

  for (const date of dates) {
    const itemMap = pivot[date];
    const items = Object.keys(itemMap).sort();

    // Collect all buyers that have a positive balance for this date
    const buyerSet = new Set<number>();
    for (const item of items) {
      for (const [buyer, qty] of Object.entries(itemMap[item])) {
        if (qty > 0) buyerSet.add(Number(buyer));
      }
    }
    const buyers = [...buyerSet].sort((a, b) => a - b);
    if (buyers.length === 0) continue;

    const sheetTitle = daySheetName(date);
    const headerRow = [
      'Položka',
      ...buyers.map((b) => apartmentLabel.get(b) ?? String(b)),
      'Celkem',
    ];
    const dataRows = items.map((item) => {
      const counts = buyers.map((b) => itemMap[item][b] ?? 0);
      const total = counts.reduce((s, n) => s + n, 0);
      // Only include items with positive total
      return total > 0 ? [item, ...counts.map((c) => c > 0 ? c : ''), total] : null;
    }).filter(Boolean) as (string | number)[][];

    if (dataRows.length === 0) continue;

    const values = [headerRow, ...dataRows];

    if (!existingTitles.has(sheetTitle)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
      });
      existingTitles.add(sheetTitle);
    } else {
      // Skip if content unchanged
      try {
        const existing = await sheets.spreadsheets.values.get({
          spreadsheetId: env.spreadsheetId,
          range: sheetRange(sheetTitle, 'A1:ZZ'),
        });
        const existingValues = existing.data.values ?? [];
        const same =
          existingValues.length === values.length &&
          values.every((row, i) =>
            row.length === (existingValues[i]?.length ?? 0) &&
            row.every((cell, j) => String(cell) === String(existingValues[i][j] ?? '')),
          );
        if (same) continue;
      } catch {
        // proceed with overwrite
      }

      await sheets.spreadsheets.values.clear({
        spreadsheetId: env.spreadsheetId,
        range: sheetRange(sheetTitle, 'A:ZZ'),
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.spreadsheetId,
      range: sheetRange(sheetTitle, 'A1'),
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    console.log(`[sheets] Day sheet "${sheetTitle}" updated: ${dataRows.length} items × ${buyers.length} apartments`);
  }
}
