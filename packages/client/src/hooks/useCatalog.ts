import { useState, useEffect, useCallback } from 'react';
import type { CatalogCategory, Apartment } from '@zahumny/shared';
import { fetchCatalog, fetchApartments } from '../api.js';

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);

  const load = useCallback(() => {
    fetchCatalog().then(setCatalog).catch((err) => console.error('Catalog load error:', err));
    fetchApartments().then((data) => setApartments(data.apartments)).catch((err) => console.error('Apartments load error:', err));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  return { catalog, apartments, reload: load };
}
