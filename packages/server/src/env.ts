import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 3001,
  spreadsheetId: process.env.SPREADSHEET_ID ?? '',
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './credentials/service-account.json',

  get sheetsConfigured(): boolean {
    return Boolean(this.spreadsheetId);
  },
};
