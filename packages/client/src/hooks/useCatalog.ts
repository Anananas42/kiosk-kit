import { useState, useEffect, useCallback } from 'react';
import { CATALOG_RELOAD_INTERVAL_MS, DEFAULT_KIOSK_SETTINGS, type CatalogCategory, type Apartment, type PastryConfig, type KioskSettings } from '@zahumny/shared';
import { fetchCatalog, fetchApartments, fetchPastryConfig, fetchSettings } from '../api.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

const DEFAULT_PASTRY_CONFIG: PastryConfig = {
  orderingDays: Array(7).fill(true),
  deliveryDays: Array(7).fill(true),
};

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(() => cacheGet<CatalogCategory[]>('catalog') ?? []);
  const [apartments, setApartments] = useState<Apartment[]>(() => cacheGet<Apartment[]>('apartments') ?? []);
  const [pastryConfig, setPastryConfig] = useState<PastryConfig>(() => cacheGet<PastryConfig>('pastryConfig') ?? DEFAULT_PASTRY_CONFIG);
  const [settings, setSettings] = useState<KioskSettings>(() => cacheGet<KioskSettings>('settings') ?? DEFAULT_KIOSK_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchCatalog()
      .then((data) => {
        setCatalog(data);
        cacheSet('catalog', data);
        setError(null);
      })
      .catch((err) => {
        console.error('Catalog load error:', err);
        setError(err instanceof Error ? err.message : 'Nelze načíst katalog.');
      });
    fetchApartments()
      .then((data) => {
        setApartments(data.apartments);
        cacheSet('apartments', data.apartments);
      })
      .catch((err) => {
        console.error('Apartments load error:', err);
        if (!cacheGet<Apartment[]>('apartments')) {
          setError((prev) => prev ?? 'Nelze načíst data.');
        }
      });
    fetchPastryConfig()
      .then((data) => {
        setPastryConfig(data);
        cacheSet('pastryConfig', data);
      })
      .catch((err) => {
        console.error('Pastry config load error:', err);
      });
    fetchSettings()
      .then((data) => {
        setSettings(data);
        cacheSet('settings', data);
      })
      .catch((err) => {
        console.error('Settings load error:', err);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Poll every 10s while in error state, normal interval otherwise
    const interval = error ? 10_000 : CATALOG_RELOAD_INTERVAL_MS;
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [load, error]);

  return { catalog, apartments, pastryConfig, settings, reload: load, error };
}
