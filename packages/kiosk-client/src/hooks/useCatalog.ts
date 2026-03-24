import {
  type Buyer,
  CATALOG_RELOAD_INTERVAL_MS,
  type CatalogCategory,
  DEFAULT_KIOSK_SETTINGS,
  DEFAULT_PREORDER_CONFIG,
  type KioskSettings,
  type PreorderConfig,
} from "@kioskkit/shared";
import { useCallback, useEffect, useState } from "react";
import { trpc } from "../trpc.js";

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(() => []);
  const [buyers, setBuyers] = useState<Buyer[]>(() => []);
  const [preorderConfig, setPreorderConfig] = useState<PreorderConfig>(
    () => DEFAULT_PREORDER_CONFIG,
  );
  const [settings, setSettings] = useState<KioskSettings>(() => DEFAULT_KIOSK_SETTINGS);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [buyerError, setBuyerError] = useState<string | null>(null);

  const load = useCallback(() => {
    trpc["catalog.list"]
      .query()
      .then((data) => {
        setCatalog(data);
        setCatalogError(null);
      })
      .catch((err) => {
        console.error("Catalog load error:", err);
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog.");
      });
    trpc["buyers.list"]
      .query()
      .then((data) => {
        setBuyers(data.buyers);
        setBuyerError(null);
      })
      .catch((err) => {
        console.error("Buyers load error:", err);
        setBuyerError(err instanceof Error ? err.message : "Failed to load buyers.");
      });
    trpc["preorderConfig.get"]
      .query()
      .then((data) => {
        setPreorderConfig(data);
      })
      .catch((err) => {
        console.error("Preorder config load error:", err);
      });
    trpc["settings.get"]
      .query()
      .then((data) => {
        setSettings(data);
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
