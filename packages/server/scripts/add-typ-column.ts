/**
 * One-time migration: add a "Typ" column to the Katalog sheet
 * and set it to "pečivo" for pastry categories.
 *
 * Usage: pnpm --filter @zahumny/server tsx scripts/add-typ-column.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

for (const line of readFileSync(resolve(ROOT, '.env'), 'utf-8').split('\n')) {
  const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const CREDENTIALS_PATH = resolve(
  ROOT,
  process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials/service-account.json',
);

const PASTRY_CATEGORIES = ['Pečivo slané', 'Pečivo sladké'];

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Read current Katalog
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Katalog!A1:ZZ',
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) {
    console.log('Katalog is empty, nothing to do.');
    return;
  }

  const header = rows[0].map(String);
  if (header.includes('Typ')) {
    console.log('Typ column already exists, nothing to do.');
    return;
  }

  // Insert "Typ" as column B (index 1), shifting everything else right
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const katalogSheet = meta.data.sheets!.find((s) => s.properties!.title === 'Katalog')!;
  const sheetId = katalogSheet.properties!.sheetId!;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
          inheritFromBefore: false,
        },
      }],
    },
  });

  // Write "Typ" header
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Katalog!B1',
    valueInputOption: 'RAW',
    requestBody: { values: [['Typ']] },
  });

  // Read back all rows to get categories in column A
  const updated = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Katalog!A2:A',
  });
  const categories = (updated.data.values ?? []).map((r) => r[0] ?? '');

  // Build Typ column values
  const typValues = categories.map((cat) =>
    [PASTRY_CATEGORIES.includes(cat) ? 'pečivo' : ''],
  );

  if (typValues.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Katalog!B2:B${typValues.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: typValues },
    });
  }

  console.log(`Done. Added Typ column with ${typValues.filter(([v]) => v).length} pastry rows.`);
}

main();
