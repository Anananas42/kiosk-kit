import { useState, useEffect, useCallback } from 'react';
import { CATALOG_RELOAD_INTERVAL_MS, type CatalogCategory, type Apartment, type PastryConfig } from '@zahumny/shared';
import { fetchCatalog, fetchApartments, fetchPastryConfig } from '../api.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

const DEFAULT_PASTRY_CONFIG: PastryConfig = {
  orderingDays: Array(7).fill(true),
  deliveryDays: Array(7).fill(true),
};

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(() => cacheGet<CatalogCategory[]>('catalog') ?? []);
  const [apartments, setApartments] = useState<Apartment[]>(() => cacheGet<Apartment[]>('apartments') ?? []);
  const [pastryConfig, setPastryConfig] = useState<PastryConfig>(() => cacheGet<PastryConfig>('pastryConfig') ?? DEFAULT_PASTRY_CONFIG);
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
    fetchPastryConfig()
      .then((data) => {
        setPastryConfig(data);
        cacheSet('pastryConfig', data);
      })
      .catch((err) => {
        console.error('Pastry config load error:', err);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, CATALOG_RELOAD_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { catalog, apartments, pastryConfig, reload: load, error };
}
