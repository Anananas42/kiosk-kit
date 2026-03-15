/**
 * Dump the full Google Sheets schema: sheet names, headers, sample rows.
 *
 * Usage (from repo root):
 *   pnpm --filter @zahumny/server inspect-sheets
 *
 * Pass a number to control how many sample data rows to show (default 3):
 *   pnpm --filter @zahumny/server inspect-sheets -- 10
 *
 * Requires .env (SPREADSHEET_ID) and credentials/service-account.json in the repo root.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

// Load .env without depending on dotenv
const envPath = resolve(ROOT, '.env');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
if (!SPREADSHEET_ID) {
  console.error('Missing SPREADSHEET_ID in .env');
  process.exit(1);
}

const CREDENTIALS_PATH = resolve(
  ROOT,
  process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials/service-account.json',
);

const SAMPLE_ROWS = Number(process.argv[2]) || 3;

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets!.map((s) => s.properties!.title!);

  console.log(`Spreadsheet: ${meta.data.properties!.title}`);
  console.log(`Sheets: ${sheetNames.join(', ')}\n`);

  for (const name of sheetNames) {
    const grid = meta.data.sheets!.find((s) => s.properties!.title === name)!.properties!.gridProperties!;

    console.log(`=== ${name} (${grid.rowCount} rows × ${grid.columnCount} cols) ===`);

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${name}'!A1:ZZ${SAMPLE_ROWS + 1}`,
      });

      const rows = res.data.values ?? [];
      if (rows.length === 0) {
        console.log('(empty)\n');
        continue;
      }

      const header = rows[0];
      console.log(`Headers: ${JSON.stringify(header)}`);

      const dataRows = rows.slice(1);
      if (dataRows.length === 0) {
        console.log('(no data rows)\n');
        continue;
      }

      console.log(`Sample data (${dataRows.length} rows):`);
      for (const row of dataRows) {
        const obj: Record<string, string> = {};
        for (let i = 0; i < header.length; i++) {
          const val = row[i] ?? '';
          if (val !== '') obj[header[i]] = val;
        }
        console.log(`  ${JSON.stringify(obj)}`);
      }
    } catch (e: unknown) {
      console.log(`ERROR: ${(e as Error).message}`);
    }

    console.log();
  }
}

main();
