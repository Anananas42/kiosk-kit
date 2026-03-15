/**
 * Rename a Google Sheets tab.
 * Usage: pnpm exec tsx scripts/rename-sheet.ts "Old Name" "New Name"
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf-8').split('\n')) {
  const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const [oldName, newName] = process.argv.slice(2);
if (!oldName || !newName) {
  console.error('Usage: tsx scripts/rename-sheet.ts "Old Name" "New Name"');
  process.exit(1);
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const auth = new google.auth.GoogleAuth({
  keyFile: resolve(ROOT, process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials/service-account.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const sheet = meta.data.sheets!.find((s) => s.properties!.title === oldName);
if (!sheet) {
  console.error(`Sheet "${oldName}" not found. Available: ${meta.data.sheets!.map((s) => s.properties!.title).join(', ')}`);
  process.exit(1);
}

await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    requests: [{
      updateSheetProperties: {
        properties: { sheetId: sheet.properties!.sheetId!, title: newName },
        fields: 'title',
      },
    }],
  },
});

console.log(`Renamed "${oldName}" → "${newName}"`);
