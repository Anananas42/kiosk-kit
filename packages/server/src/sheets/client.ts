import { SHEETS_API_TIMEOUT_MS } from '@zahumny/shared';
import { google, type sheets_v4 } from 'googleapis';
import { env } from '../env.js';

let client: sheets_v4.Sheets | null = null;

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (client) return client;

  const auth = new google.auth.GoogleAuth({
    keyFile: env.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  client = google.sheets({ version: 'v4', auth });
  google.options({ timeout: SHEETS_API_TIMEOUT_MS });
  return client;
}
