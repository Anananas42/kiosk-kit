import { formatCurrency, parsePrice, type RecordRow } from "@kioskkit/shared";
import { useEffect, useState } from "react";
import LoadingDots from "../components/LoadingDots.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { useT } from "../i18n/useT.js";
import { trpc } from "../trpc.js";

interface AggregatedItem {
  label: string;
  added: number;
  removed: number;
  addedKc: number;
  removedKc: number;
  unitPrice: number;
}

function aggregateItems(records: RecordRow[], buyer: number): Record<string, AggregatedItem> {
  const map: Record<string, AggregatedItem> = {};

  for (const r of records) {
    if (Number(r.buyer) !== buyer) continue;
    const key = r.itemId || (r.quantity ? `${r.item} ${r.quantity}` : r.item);
    const label = r.quantity ? `${r.item} ${r.quantity}` : r.item;

    if (!map[key])
      map[key] = { label, added: 0, removed: 0, addedKc: 0, removedKc: 0, unitPrice: 0 };

    const absCount = Math.abs(r.count);
    const signedTotal = parsePrice(r.price);
    const unitPrice = absCount > 0 ? signedTotal / absCount : 0;
    if (!map[key].unitPrice && unitPrice) map[key].unitPrice = unitPrice;

    if (r.count > 0) {
      map[key].added += r.count;
    } else {
      map[key].removed += Math.abs(r.count);
    }
  }

  for (const v of Object.values(map)) {
    v.removed = Math.min(v.removed, v.added);
    v.addedKc = v.added * v.unitPrice;
    v.removedKc = v.removed * v.unitPrice;
  }

  return map;
}

interface ConsumptionOverviewProps {
  buyer: number;
  onBack: () => void;
  locale: string;
  currency: string;
}

export default function ConsumptionOverview({
  buyer,
  onBack,
  locale,
  currency,
}: ConsumptionOverviewProps) {
  const t = useT();
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = (amount: number) => formatCurrency(amount, locale, currency);

  useEffect(() => {
    trpc["records.list"]
      .query({ buyer })
      .then((data) => setRecords(data.records))
      .catch(() => setError(t("overview.loadError")));
  }, [t, buyer]);

  const byItem = records ? aggregateItems(records, buyer) : {};
  const items = Object.entries(byItem).filter(([, v]) => v.added > 0);
  const total = items.reduce((sum, [, v]) => sum + v.addedKc - v.removedKc, 0);
  const totalStorno = items.reduce((sum, [, v]) => sum + v.removedKc, 0);

  return (
    <div className="screen">
      <ScreenHeader
        title={t("overview.title", { buyer })}
        onBack={onBack}
        backLabel={t("overview.back")}
      />
      <div className="screen-body screen-body--scroll">
        {error && <div className="overview-error">{error}</div>}

        {records === null && !error && (
          <div className="sending-overlay">
            {t("overview.loading")}
            <LoadingDots />
          </div>
        )}

        {records !== null &&
          (items.length === 0 ? (
            <div className="overview-empty">{t("overview.empty")}</div>
          ) : (
            <div className="overview-grid">
              <div className="overview-row overview-row--header">
                <span>{t("overview.headerItem")}</span>
                <span>{t("overview.headerQty")}</span>
                <span>{t("overview.headerAdded")}</span>
                <span>{t("overview.headerStorno")}</span>
                <span>{t("overview.headerTotal")}</span>
              </div>
              {items.map(([key, v]) => {
                const net = v.added - v.removed;
                const lineTotal = v.addedKc - v.removedKc;
                return (
                  <div key={key} className="overview-row overview-row--item">
                    <span className="overview-item-name">{v.label}</span>
                    <span className="overview-net overview-net--pos">{net}</span>
                    <span className="overview-net overview-net--pos">
                      {v.addedKc > 0 ? fmt(v.addedKc) : t("overview.dash")}
                    </span>
                    <span className="overview-net overview-net--neg">
                      {v.removedKc > 0 ? `−${fmt(v.removedKc)}` : t("overview.dash")}
                    </span>
                    <span className="overview-net overview-net--pos">{fmt(lineTotal)}</span>
                  </div>
                );
              })}
              <div className="overview-row overview-row--total">
                <span>{t("overview.total")}</span>
                <span></span>
                <span>
                  {total > 0 || totalStorno > 0 ? fmt(total + totalStorno) : t("overview.dash")}
                </span>
                <span>{totalStorno > 0 ? `−${fmt(totalStorno)}` : t("overview.dash")}</span>
                <span className="overview-net">{fmt(total)}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
