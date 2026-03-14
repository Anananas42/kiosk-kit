import { useState, useEffect, useCallback } from 'react';
import type { CatalogCategory, Apartment } from '@zahumny/shared';
import { fetchCatalog, fetchApartments } from '../api.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(() => cacheGet<CatalogCategory[]>('catalog') ?? []);
  const [apartments, setApartments] = useState<Apartment[]>(() => cacheGet<Apartment[]>('apartments') ?? []);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetchCatalog()
      .then((data) => {
        setCatalog(data);
        cacheSet('catalog', data);
        setError(false);
      })
      .catch((err) => {
        console.error('Catalog load error:', err);
        if (!cacheGet<CatalogCategory[]>('catalog')) setError(true);
      });
    fetchApartments()
      .then((data) => {
        setApartments(data.apartments);
        cacheSet('apartments', data.apartments);
        setError(false);
      })
      .catch((err) => {
        console.error('Apartments load error:', err);
        if (!cacheGet<Apartment[]>('apartments')) setError(true);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  return { catalog, apartments, reload: load, error };
}
