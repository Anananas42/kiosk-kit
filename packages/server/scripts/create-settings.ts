/**
 * Create the [Nastavení] sheet with default settings.
 * Usage: pnpm --filter @zahumny/server create-settings
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
const SHEET_NAME = '[Nastavení]';

const rawCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './credentials/service-account.json';
const credPath = resolve(ROOT, rawCredPath);
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

const auth = new google.auth.GoogleAuth({
  keyFile: credPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);

  if (exists) {
    console.log(`Sheet "${SHEET_NAME}" already exists. Skipping creation.`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
    },
  });

  const values = [
    ['Klíč', 'Hodnota'],
    ['idleDimMs', '15000'],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  console.log(`Created sheet "${SHEET_NAME}" with default settings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
