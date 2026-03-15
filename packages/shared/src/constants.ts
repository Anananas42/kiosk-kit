export const TZ = 'Europe/Prague';

export const PASTRY_CATEGORIES = new Set(['Pečivo slané', 'Pečivo sladké']);

export const EVIDENCE_SHEET = 'Evidence';
export const CATALOG_SHEET = 'Katalog';
export const CONFIG_SHEET = 'Config';
export const PASTRY_SHEET = 'Přehled pečiva';

export const HEADER_ROW = ['Čas', 'Kupující', 'Operace', 'Kategorie', 'Položka', 'Množství', 'Cena'];

export const CATALOG_COLUMNS = {
  category: 'Kategorie',
  name: 'Název',
  quantity: 'množství',
  price: 'cena',
} as const;

export const CONFIG_COLUMNS = {
  id: 'ID',
  label: 'Label',
} as const;
