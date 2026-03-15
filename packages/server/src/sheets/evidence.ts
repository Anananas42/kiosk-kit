import { EVIDENCE_SHEET, HEADER_ROW, parsePrice, computeBalance, deriveCount, type RecordEntry, type EvidenceRow } from '@zahumny/shared';
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
    range: `${EVIDENCE_SHEET}!A1:G1`,
  });
  const existing = res.data.values?.[0] ?? [];
  const matches = HEADER_ROW.every((h, i) => existing[i] === h);
  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.spreadsheetId,
      range: `${EVIDENCE_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
  headerChecked = true;
}

export async function appendRow(entry: RecordEntry): Promise<void> {
  const sheets = await getSheetsClient();
  await ensureHeader();

  const priceNum = parsePrice(entry.price);
  const signedPrice = priceNum ? (entry.delta > 0 ? priceNum : -priceNum) : '';

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.spreadsheetId,
    range: `${EVIDENCE_SHEET}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        entry.timestamp,
        entry.buyer,
        entry.delta,
        entry.category,
        entry.item,
        entry.quantity,
        signedPrice,
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
    range: `${EVIDENCE_SHEET}!A1:ZZ`,
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
    delta: Number(getCol(row, colMap, 'Operace')) > 0 ? 1 as const : -1 as const,
    category: getCol(row, colMap, 'Kategorie'),
    item: getCol(row, colMap, 'Položka'),
    quantity: getCol(row, colMap, 'Množství'),
    price: getCol(row, colMap, 'Cena'),
  }));

  setCachedRecords(records);
  return records;
}

export async function getItemBalance(
  buyer: number,
  item: string,
  _quantity: string,
  queueEntries: RecordEntry[],
): Promise<number> {
  const records = await readRecords();
  const counted = [
    ...records.map((r) => ({
      buyer: Number(r.buyer),
      item: r.item,
      count: deriveCount(r.delta, r.quantity),
    })),
    ...queueEntries.map((e) => ({
      buyer: e.buyer,
      item: e.item,
      count: deriveCount(e.delta, e.quantity),
    })),
  ];
  return computeBalance(counted, buyer, item);
}
