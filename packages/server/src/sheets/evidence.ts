import { EVIDENCE_SHEET, HEADER_ROW, parsePrice, type RecordEntry, type EvidenceRow } from '@zahumny/shared';
import { getSheetsClient } from './client.js';
import { env } from '../env.js';
import { getCachedRecords, setCachedRecords, invalidateRecordsCache } from './records-cache.js';

let headerChecked = false;

async function ensureHeader(): Promise<void> {
  if (headerChecked) return;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.spreadsheetId,
    range: `${EVIDENCE_SHEET}!A1:G1`,
  });
  if (!res.data.values?.length) {
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
    range: `${EVIDENCE_SHEET}!A2:G`,
  });

  const records: EvidenceRow[] = (res.data.values ?? []).map((row) => ({
    timestamp: row[0] ?? '',
    buyer: Number(row[1]),
    delta: Number(row[2]) > 0 ? 1 : -1,
    category: row[3] ?? '',
    item: row[4] ?? '',
    quantity: row[5] ?? '',
    price: row[6] ?? '',
  }));

  setCachedRecords(records);
  return records;
}

export async function getItemBalance(
  buyer: number,
  item: string,
  quantity: string,
  queueEntries: RecordEntry[],
): Promise<number> {
  const records = await readRecords();
  const all = [...records, ...queueEntries].filter(
    (r) => Number(r.buyer) === buyer && r.item === item,
  );

  // For ks-based items: sum actual pieces regardless of quantity format
  if (/^\d+ ks$/.test(quantity)) {
    return all.reduce((sum, r) => {
      const m = String(r.quantity).match(/^(\d+) ks$/);
      const pieces = m ? Number(m[1]) : 1;
      return sum + (r.delta > 0 ? pieces : -pieces);
    }, 0);
  }

  // For fixed-unit items: exact quantity match
  return all
    .filter((r) => r.quantity === quantity)
    .reduce((sum, r) => sum + r.delta, 0);
}
