import { EVIDENCE_SHEET, sheetRange, HEADER_ROW, parsePrice, computeBalance, type RecordEntry, type EvidenceRow } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { getCachedRecords, setCachedRecords, invalidateRecordsCache } from './records-cache.js';
import { buildColumnMap, getCol } from './column-map.js';

let headerChecked = false;

async function ensureHeader(): Promise<void> {
  if (headerChecked) return;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(EVIDENCE_SHEET, 'A1:H1'),
  });
  const existing = res.data.values?.[0] ?? [];
  const matches = HEADER_ROW.every((h, i) => existing[i] === h);
  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.spreadsheetId,
      range: sheetRange(EVIDENCE_SHEET, 'A1'),
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
  headerChecked = true;
}

export async function appendRow(entry: RecordEntry): Promise<void> {
  const sheets = await getSheetsClient();
  await ensureHeader();

  const unitPrice = parsePrice(entry.price);
  const signedPrice = unitPrice ? unitPrice * entry.count : '';

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(EVIDENCE_SHEET, 'A:H'),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        entry.timestamp,
        entry.buyer,
        entry.count,
        entry.category,
        entry.item,
        entry.quantity,
        signedPrice,
        entry.itemId,
      ]],
    },
  });

  invalidateRecordsCache();
}

export async function readRecords(): Promise<EvidenceRow[]> {
  const hit = getCachedRecords();
  if (hit) return hit;

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: sheetRange(EVIDENCE_SHEET, 'A1:ZZ'),
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) {
    setCachedRecords([]);
    return [];
  }

  const colMap = buildColumnMap(rows[0].map(String));
  const records: EvidenceRow[] = rows.slice(1).map((row) => ({
    timestamp: getCol(row, colMap, 'Čas'),
    buyer: Number(getCol(row, colMap, 'Kupující')) || 0,
    count: Number(getCol(row, colMap, 'Operace')) || 0,
    category: getCol(row, colMap, 'Kategorie'),
    item: getCol(row, colMap, 'Položka'),
    itemId: getCol(row, colMap, 'ID'),
    quantity: getCol(row, colMap, 'Množství'),
    price: getCol(row, colMap, 'Cena'),
  }));

  const missingId = records.filter((r) => !r.itemId);
  if (missingId.length > 0) {
    console.warn(`[sheets] ${missingId.length} evidence record(s) missing itemId — balance checks will fall back to name matching`);
  }

  setCachedRecords(records);
  return records;
}

export async function getItemBalance(
  buyer: number,
  item: string,
  queueEntries: RecordEntry[],
  itemId?: string,
): Promise<number> {
  const records = await readRecords();
  const counted = [
    ...records.map((r) => ({ buyer: r.buyer, item: r.item, itemId: r.itemId, count: r.count })),
    ...queueEntries.map((e) => ({ buyer: e.buyer, item: e.item, itemId: e.itemId, count: e.count })),
  ];
  return computeBalance(counted, buyer, item, itemId);
}
