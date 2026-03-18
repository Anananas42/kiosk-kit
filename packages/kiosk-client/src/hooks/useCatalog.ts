import {
  type Buyer,
  CATALOG_RELOAD_INTERVAL_MS,
  type CatalogCategory,
  DEFAULT_KIOSK_SETTINGS,
  type KioskSettings,
  type PreorderConfig,
} from "@kioskkit/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchBuyers, fetchCatalog, fetchPreorderConfig, fetchSettings } from "../api.js";
import { cacheGet, cacheSet } from "../utils/cache.js";

const DEFAULT_PREORDER_CONFIG: PreorderConfig = {
  orderingDays: Array(7).fill(true),
  deliveryDays: Array(7).fill(true),
};

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(
    () => cacheGet<CatalogCategory[]>("catalog") ?? [],
  );
  const [buyers, setBuyers] = useState<Buyer[]>(() => cacheGet<Buyer[]>("buyers") ?? []);
  const [preorderConfig, setPreorderConfig] = useState<PreorderConfig>(
    () => cacheGet<PreorderConfig>("preorderConfig") ?? DEFAULT_PREORDER_CONFIG,
  );
  const [settings, setSettings] = useState<KioskSettings>(
    () => cacheGet<KioskSettings>("settings") ?? DEFAULT_KIOSK_SETTINGS,
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [buyerError, setBuyerError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchCatalog()
      .then((data) => {
        setCatalog(data);
        cacheSet("catalog", data);
        setCatalogError(null);
      })
      .catch((err) => {
        console.error("Catalog load error:", err);
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog.");
      });
    fetchBuyers()
      .then((data) => {
        setBuyers(data.buyers);
        cacheSet("buyers", data.buyers);
        setBuyerError(null);
      })
      .catch((err) => {
        console.error("Buyers load error:", err);
        setBuyerError(err instanceof Error ? err.message : "Failed to load buyers.");
      });
    fetchPreorderConfig()
      .then((data) => {
        setPreorderConfig(data);
        cacheSet("preorderConfig", data);
      })
      .catch((err) => {
        console.error("Preorder config load error:", err);
      });
    fetchSettings()
      .then((data) => {
        setSettings(data);
        cacheSet("settings", data);
      })
      .catch((err) => {
        console.error("Settings load error:", err);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const error = catalogError ?? buyerError;

  useEffect(() => {
    // Poll every 10s while in error state, normal interval otherwise
    const interval = error ? 10_000 : CATALOG_RELOAD_INTERVAL_MS;
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [load, error]);

  return { catalog, buyers, preorderConfig, settings, reload: load, error };
}
