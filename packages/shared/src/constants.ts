export const TZ = 'Europe/Prague';

export const EVIDENCE_SHEET = 'Evidence';
export const CATALOG_SHEET = 'Katalog';
export const CONFIG_SHEET = 'Config';
export const PASTRY_SHEET = 'Přehled pečiva';

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
