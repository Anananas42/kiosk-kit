import { CONSUMPTION_SHEET, sheetRange, parsePrice, type CatalogCategory, type EvidenceRow, type Apartment } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { readRecords } from './evidence.js';
import { readApartments } from './apartments.js';
import { readCatalog } from './catalog.js';
import { buildFormatRequests } from './pastry.js';
import { env } from '../env.js';

interface CatalogInfo {
  name: string;
  quantity: string;
  price: string;
  dphRate: string;
}

/**
 * Build grid values for the consumption summary sheet.
 * Pure function — no I/O, fully testable.
 */
export function buildConsumptionValues(
  records: EvidenceRow[],
  catalog: CatalogCategory[],
  apartments: Apartment[],
): string[][] | null {
  // Build catalog lookup keyed by itemId, with name fallback
  const catalogById = new Map<string, CatalogInfo>();
  const catalogByName = new Map<string, CatalogInfo>();
  for (const cat of catalog) {
    for (const item of cat.items) {
      const info: CatalogInfo = { name: item.name, quantity: item.quantity, price: item.price, dphRate: item.dphRate };
      if (item.id) catalogById.set(item.id, info);
      catalogByName.set(item.name, info);
    }
  }

  function lookupCatalog(record: EvidenceRow): CatalogInfo | undefined {
    if (record.itemId) {
      const byId = catalogById.get(record.itemId);
      if (byId) return byId;
    }
    return catalogByName.get(record.item);
  }

  // Date range
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const r of records) {
    const t = new Date(r.timestamp).getTime();
    if (!isNaN(t)) {
      if (t < minTs) minTs = t;
      if (t > maxTs) maxTs = t;
    }
  }

  // Aggregate: key = itemId || item name, per (key, buyer) → { count, cost }
  const agg = new Map<string, Map<number, { count: number; cost: number }>>();

  for (const r of records) {
    const key = r.itemId || r.item;
    if (!agg.has(key)) agg.set(key, new Map());
    const byBuyer = agg.get(key)!;
    const prev = byBuyer.get(r.buyer) ?? { count: 0, cost: 0 };
    const catInfo = lookupCatalog(r);
    const unitPrice = catInfo ? parsePrice(catInfo.price) : 0;
    prev.count += r.count;
    prev.cost += r.count * unitPrice;
    byBuyer.set(r.buyer, prev);
  }

  // Filter: only items with net positive count for at least one apartment
  const activeKeys: string[] = [];
  for (const [key, byBuyer] of agg) {
    let hasPositive = false;
    for (const { count } of byBuyer.values()) {
      if (count > 0) { hasPositive = true; break; }
    }
    if (hasPositive) activeKeys.push(key);
  }

  if (activeKeys.length === 0) return null;

  // Resolve display info per key
  const keyInfo = new Map<string, CatalogInfo>();
  for (const key of activeKeys) {
    const info = catalogById.get(key) ?? catalogByName.get(key);
    keyInfo.set(key, info ?? { name: key, quantity: '', price: '', dphRate: '' });
  }

  // Sort items alphabetically by display name
  activeKeys.sort((a, b) => {
    const na = keyInfo.get(a)!.name;
    const nb = keyInfo.get(b)!.name;
    return na.localeCompare(nb, 'cs');
  });

  // Filter apartments: only those with at least one purchase across all active items
  const aptLabel = new Map(apartments.map((a) => [a.id, a.label]));
  const activeAptSet = new Set<number>();
  for (const key of activeKeys) {
    const byBuyer = agg.get(key)!;
    for (const [buyer, { count }] of byBuyer) {
      if (count > 0) activeAptSet.add(buyer);
    }
  }
  const activeApts = [...activeAptSet].sort((a, b) => a - b);

  if (activeApts.length === 0) return null;

  // Date range formatting
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  };
  const dateRange = isFinite(minTs) && isFinite(maxTs)
    ? `${fmtDate(minTs)}–${fmtDate(maxTs)}`
    : '';

  const aptLabels = activeApts.map((id) => aptLabel.get(id) ?? String(id));

  // Header
  const header = [`Souhrn konzumace (${dateRange})`, 'Množství', 'Cena', 'Sazba DPH', ...aptLabels, 'Celkově'];

  // Item rows
  const dphRates = new Set<string>();
  const itemRows: string[][] = [];
  const colTotals = new Array(activeApts.length + 1).fill(0); // per apt + celkově

  for (const key of activeKeys) {
    const info = keyInfo.get(key)!;
    if (info.dphRate) dphRates.add(info.dphRate);
    const byBuyer = agg.get(key)!;

    let totalCost = 0;
    let totalCount = 0;
    const aptCells: string[] = [];

    for (let i = 0; i < activeApts.length; i++) {
      const data = byBuyer.get(activeApts[i]);
      const count = data?.count ?? 0;
      const cost = data?.cost ?? 0;
      if (count > 0) {
        aptCells.push(`${cost} (${count})`);
        totalCost += cost;
        totalCount += count;
        colTotals[i] += cost;
      } else {
        aptCells.push('');
      }
    }
    colTotals[activeApts.length] += totalCost;

    itemRows.push([info.name, info.quantity, info.price ? `${parsePrice(info.price)} Kč` : '', info.dphRate, ...aptCells, `${totalCost} (${totalCount})`]);
  }

  // Celkem row
  const celkemRow = ['Celkem', '', '', '', ...colTotals.map(String)];

  // DPH breakdown rows
  const sortedRates = [...dphRates].sort((a, b) => parseFloat(a) - parseFloat(b));
  const dphRows: string[][] = [];
  for (const rate of sortedRates) {
    const rateKeys = activeKeys.filter((k) => keyInfo.get(k)!.dphRate === rate);
    const rateTotals = new Array(activeApts.length + 1).fill(0);

    for (const key of rateKeys) {
      const byBuyer = agg.get(key)!;
      for (let i = 0; i < activeApts.length; i++) {
        const data = byBuyer.get(activeApts[i]);
        if (data && data.count > 0) rateTotals[i] += data.cost;
      }
      // celkově
      for (const { count, cost } of byBuyer.values()) {
        if (count > 0) rateTotals[activeApts.length] += cost;
      }
    }

    dphRows.push([`  z toho DPH ${rate}`, '', '', '', ...rateTotals.map(String)]);
  }

  return [header, ...itemRows, celkemRow, ...dphRows];
}

export async function updateConsumptionSheet(): Promise<void> {
  const [catalog, records, apartments] = await Promise.all([
    readCatalog(),
    readRecords(),
    readApartments(),
  ]);

  const values = buildConsumptionValues(records, catalog, apartments);
  if (!values) return;

  const sheets = await getSheetsClient();

  // Ensure sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
  const existingSheet = meta.data.sheets?.find((s) => s.properties?.title === CONSUMPTION_SHEET);
  let sheetId: number;

  if (!existingSheet) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CONSUMPTION_SHEET } } }] },
    });
    sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  } else {
    sheetId = existingSheet.properties?.sheetId ?? 0;
    // Compare with current content — skip if unchanged
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: env.spreadsheetId,
        range: sheetRange(CONSUMPTION_SHEET, 'A1:ZZ'),
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
    range: sheetRange(CONSUMPTION_SHEET, 'A:ZZ'),
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(CONSUMPTION_SHEET, 'A1'),
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  const totalCols = values[0].length;
  const totalRows = values.length;
  const itemRowCount = totalRows - 1; // minus header; celkem + dph rows are at the end
  // Summary rows start after item rows (header + items)
  const summaryStartRow = totalRows - (totalRows - 1 - (totalRows - values.findIndex((r) => r[0] === 'Celkem')));
  const summaryStartIdx = values.findIndex((r) => r[0] === 'Celkem');

  const formatRequests = buildFormatRequests({
    sheetId,
    frozenRows: 1,
    columnWidths: [
      { startIndex: 0, endIndex: 1, width: 280 },
      { startIndex: 1, endIndex: 4, width: 100 },
      { startIndex: 4, endIndex: totalCols, width: 120 },
    ],
    totalRows,
    totalCols,
    highlightLastCol: true,
  });

  // Bold + light green bg on summary rows (Celkem + DPH rows)
  if (summaryStartIdx >= 0) {
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: summaryStartIdx,
          endRowIndex: totalRows,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.886, green: 0.937, blue: 0.855 },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.spreadsheetId,
    requestBody: { requests: formatRequests },
  });

  console.log(`[sheets] Consumption summary updated: ${itemRowCount} items`);
}
