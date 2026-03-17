/**
 * Create a new Google Sheet tab with optional header row and formatting.
 *
 * Usage:
 *   pnpm --filter @zahumny/server create-sheet "Sheet Name"
 *   pnpm --filter @zahumny/server create-sheet "Sheet Name" "Col1" "Col2" "Col3"
 *
 * If column headers are provided, they are written as the first row with
 * standard app formatting (frozen blue header, auto column widths).
 * The sheet is created idempotently — skips if it already exists.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf-8').split('\n')) {
  const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const [sheetName, ...headers] = args;
if (!sheetName) {
  console.error('Usage: create-sheet "Sheet Name" ["Col1" "Col2" ...]');
  process.exit(1);
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const rawCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './credentials/service-account.json';
const credPath = resolve(ROOT, rawCredPath);
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

const auth = new google.auth.GoogleAuth({
  keyFile: credPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Same palette as other app-managed sheets
const HEADER_BG = { red: 0.267, green: 0.447, blue: 0.769 };  // #4472C4
const HEADER_FG = { red: 1, green: 1, blue: 1 };               // white

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);

  if (exists) {
    console.log(`Sheet "${sheetName}" already exists. Skipping creation.`);
    return;
  }

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });
  const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

  if (headers.length > 0) {
    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });

    // Format: frozen header, blue bg, white bold, centered, auto-width columns
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
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
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
              properties: { pixelSize: 180 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    });
  }

  console.log(`Created sheet "${sheetName}"${headers.length > 0 ? ` with headers: ${headers.join(', ')}` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
