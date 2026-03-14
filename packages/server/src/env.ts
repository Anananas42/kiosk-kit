import { config } from 'dotenv';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

config({ path: resolve(root, '.env') });

export const env = {
  port: Number(process.env.PORT) || 3001,
  spreadsheetId: process.env.SPREADSHEET_ID ?? '',
  credentialsPath: resolve(root, process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './credentials/service-account.json'),

  get sheetsConfigured(): boolean {
    return Boolean(this.spreadsheetId);
  },
};
