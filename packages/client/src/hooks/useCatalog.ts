import { useState, useEffect, useCallback } from 'react';
import { CATALOG_RELOAD_INTERVAL_MS, type CatalogCategory, type Apartment } from '@zahumny/shared';
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
    const id = setInterval(load, CATALOG_RELOAD_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { catalog, apartments, reload: load, error };
}
