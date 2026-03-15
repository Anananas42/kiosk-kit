export const TZ = 'Europe/Prague';

// Sheet names use brackets to distinguish app-managed tabs in the spreadsheet.
export const EVIDENCE_SHEET = '[Evidence]';
export const CATALOG_SHEET = '[Katalog]';
export const CONFIG_SHEET = '[Apartment config]';
export const PASTRY_SHEET = '[Přehled pečiva]';

/** Quote a sheet name for use in A1 notation ranges (handles brackets/spaces). */
export function sheetRange(sheet: string, range: string): string {
  return `'${sheet}'!${range}`;
}

export const HEADER_ROW = ['Čas', 'Kupující', 'Operace', 'Kategorie', 'Položka', 'Množství', 'Cena'];

export const CATALOG_COLUMNS = {
  category: 'Kategorie',
  type: 'Typ',
  name: 'Název',
  quantity: 'množství',
  price: 'cena',
} as const;

export const CATALOG_TYPE_PASTRY = 'pečivo';

export const CONFIG_COLUMNS = {
  id: 'ID',
  label: 'Label',
} as const;
