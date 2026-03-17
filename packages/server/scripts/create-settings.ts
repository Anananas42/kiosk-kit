/**
 * Create the [⚙️ Nastavení] sheet with default settings.
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
const SHEET_NAME = '[⚙️ Nastavení]';

const rawCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './credentials/service-account.json';
const credPath = resolve(ROOT, rawCredPath);
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

const auth = new google.auth.GoogleAuth({
  keyFile: credPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Formatting colors (same palette as other app-managed sheets)
const HEADER_BG = { red: 0.267, green: 0.447, blue: 0.769 };  // #4472C4
const HEADER_FG = { red: 1, green: 1, blue: 1 };               // white
const KEY_BG = { red: 0.851, green: 0.886, blue: 0.953 };      // #D9E2F3

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);

  if (exists) {
    console.log(`Sheet "${SHEET_NAME}" already exists. Skipping creation.`);
    return;
  }

  // Create the sheet
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
    },
  });
  const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

  // Write data
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

  // Format
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Freeze header row
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Column widths
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 200 },
            fields: 'pixelSize',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 200 },
            fields: 'pixelSize',
          },
        },
        // Header: blue bg, white bold, centered
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                backgroundColor: HEADER_BG,
                textFormat: { foregroundColor: HEADER_FG, bold: true },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        // Key column: light blue bg, bold
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: values.length, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: KEY_BG,
                textFormat: { bold: true },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });

  console.log(`Created sheet "${SHEET_NAME}" with default settings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
