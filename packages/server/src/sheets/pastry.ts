import { PASTRY_SHEET, TZ, sheetRange, getDeliveryDate, noDeliveryDaysSet } from '@zahumny/shared';
import type { sheets_v4 } from 'googleapis';
import { getSheetsClient } from './client.js';
import { readRecords } from './evidence.js';
import { readApartments } from './apartments.js';
import { getPastryCategories, readCatalog } from './catalog.js';
import { readPastryConfig } from './pastry-config.js';
import { env } from '../env.js';

// Color constants (Google Sheets API uses 0–1 floats)
const HEADER_BG = { red: 0.267, green: 0.447, blue: 0.769 };  // #4472C4
const HEADER_FG = { red: 1, green: 1, blue: 1 };               // white
const WINDOW_BG = { red: 0.851, green: 0.886, blue: 0.953 };   // #D9E2F3
const TOTALS_BG = { red: 0.886, green: 0.937, blue: 0.855 };   // #E2EFDA

export interface FormatSpec {
  sheetId: number;
  frozenRows: number;
  columnWidths: { startIndex: number; endIndex: number; width: number }[];
  totalRows: number;
  totalCols: number;
  highlightLastCol?: boolean;
  windowRow?: boolean;
}

export function buildFormatRequests(spec: FormatSpec): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];

  // Frozen rows
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: spec.sheetId, gridProperties: { frozenRowCount: spec.frozenRows } },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // Column widths
  for (const cw of spec.columnWidths) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: spec.sheetId, dimension: 'COLUMNS', startIndex: cw.startIndex, endIndex: cw.endIndex },
        properties: { pixelSize: cw.width },
        fields: 'pixelSize',
      },
    });
  }

  // Header row: blue bg, white bold, centered
  requests.push({
    repeatCell: {
      range: { sheetId: spec.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: spec.totalCols },
      cell: {
        userEnteredFormat: {
          backgroundColor: HEADER_BG,
          textFormat: { foregroundColor: HEADER_FG, bold: true },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
    },
  });

  // Window row (overview sheet)
  if (spec.windowRow) {
    requests.push({
      repeatCell: {
        range: { sheetId: spec.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: spec.totalCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: WINDOW_BG,
            textFormat: { italic: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  }

  // Last column highlight (day sheets: green "Celkem" column)
  if (spec.highlightLastCol && spec.totalRows > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: spec.sheetId,
          startRowIndex: 1,
          endRowIndex: spec.totalRows,
          startColumnIndex: spec.totalCols - 1,
          endColumnIndex: spec.totalCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: TOTALS_BG,
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  }

  // Medium border below frozen rows
  requests.push({
    updateBorders: {
      range: { sheetId: spec.sheetId, startRowIndex: 0, endRowIndex: spec.frozenRows, startColumnIndex: 0, endColumnIndex: spec.totalCols },
      bottom: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
    },
  });

  // Thin gray grid on all cells
  const gray = { red: 0.8, green: 0.8, blue: 0.8 };
  requests.push({
    updateBorders: {
      range: { sheetId: spec.sheetId, startRowIndex: 0, endRowIndex: spec.totalRows, startColumnIndex: 0, endColumnIndex: spec.totalCols },
      top: { style: 'SOLID', color: gray },
      bottom: { style: 'SOLID', color: gray },
      left: { style: 'SOLID', color: gray },
      right: { style: 'SOLID', color: gray },
      innerHorizontal: { style: 'SOLID', color: gray },
      innerVertical: { style: 'SOLID', color: gray },
    },
  });

  return requests;
}

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
  const catalog = await readCatalog();
  const catalogItemIds = new Map<string, string>();
  for (const cat of catalog) {
    for (const item of cat.items) {
      if (item.id) catalogItemIds.set(item.name, item.id);
    }
  }
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

  const headerRow = ['Položka', 'ID', ...sortedDates.map((d) => {
    const [y, mo, dy] = d.split('-').map(Number);
    return `${dy}. ${mo}. ${y}`;
  })];
  const windowRow = ['Okno objednávek', '', ...sortedDates.map(pastryWindowLabel)];
  const dataRows = sortedItems.map((item) =>
    [item, catalogItemIds.get(item) ?? '', ...sortedDates.map((d) => {
      const qty = pivot[item]?.[d] ?? 0;
      return qty > 0 ? qty : 0;
    })],
  );

  const values = [headerRow, windowRow, ...dataRows];

  // Ensure sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
  const existingSheet = meta.data.sheets?.find((s) => s.properties?.title === PASTRY_SHEET);
  let sheetId: number;
  if (!existingSheet) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: PASTRY_SHEET } } }] },
    });
    sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  } else {
    sheetId = existingSheet.properties?.sheetId ?? 0;
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

  const totalCols = headerRow.length;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.spreadsheetId,
    requestBody: {
      requests: buildFormatRequests({
        sheetId,
        frozenRows: 2,
        columnWidths: [
          { startIndex: 0, endIndex: 1, width: 200 },
          { startIndex: 1, endIndex: 2, width: 80 },
          { startIndex: 2, endIndex: totalCols, width: 120 },
        ],
        totalRows: values.length,
        totalCols,
        windowRow: true,
      }),
    },
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
  itemIds?: Map<string, string>,
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
    'ID',
    ...buyers.map((b) => apartmentLabel.get(b) ?? String(b)),
    'Celkem',
  ];
  const dataRows = items.map((item) => {
    const counts = buyers.map((b) => itemMap[item][b] ?? 0);
    const total = counts.reduce((s, n) => s + n, 0);
    return total > 0 ? [item, itemIds?.get(item) ?? '', ...counts.map((c) => c > 0 ? c : ''), total] as (string | number)[] : null;
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
  const catalog = await readCatalog();
  const catalogItemIds = new Map<string, string>();
  for (const cat of catalog) {
    for (const item of cat.items) {
      if (item.id) catalogItemIds.set(item.name, item.id);
    }
  }
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
  if (dates.length === 0) return;

  // Fetch existing sheet metadata once
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
  const existingTitles = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);
  const sheetIdMap = new Map(
    meta.data.sheets?.map((s) => [s.properties?.title ?? '', s.properties?.sheetId ?? 0]) ?? [],
  );

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
      'ID',
      ...buyers.map((b) => apartmentLabel.get(b) ?? String(b)),
      'Celkem',
    ];
    const dataRows = items.map((item) => {
      const counts = buyers.map((b) => itemMap[item][b] ?? 0);
      const total = counts.reduce((s, n) => s + n, 0);
      // Only include items with positive total
      return total > 0 ? [item, catalogItemIds.get(item) ?? '', ...counts.map((c) => c > 0 ? c : ''), total] : null;
    }).filter(Boolean) as (string | number)[][];

    if (dataRows.length === 0) continue;

    const values = [headerRow, ...dataRows];

    let sheetId: number;
    if (!existingTitles.has(sheetTitle)) {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
      });
      sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
      existingTitles.add(sheetTitle);
      sheetIdMap.set(sheetTitle, sheetId);
    } else {
      sheetId = sheetIdMap.get(sheetTitle) ?? 0;
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

    const totalCols = headerRow.length;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.spreadsheetId,
      requestBody: {
        requests: buildFormatRequests({
          sheetId,
          frozenRows: 1,
          columnWidths: [
            { startIndex: 0, endIndex: 1, width: 200 },
            { startIndex: 1, endIndex: 2, width: 80 },
            { startIndex: 2, endIndex: totalCols - 1, width: 60 },
            { startIndex: totalCols - 1, endIndex: totalCols, width: 70 },
          ],
          totalRows: values.length,
          totalCols,
          highlightLastCol: true,
        }),
      },
    });

    console.log(`[sheets] Day sheet "${sheetTitle}" updated: ${dataRows.length} items × ${buyers.length} apartments`);
  }
}
