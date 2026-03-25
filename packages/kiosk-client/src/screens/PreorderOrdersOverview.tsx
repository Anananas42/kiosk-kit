import { formatDate, getDeliveryDate, type RecordRow } from "@kioskkit/shared";
import { useEffect, useState } from "react";
import LoadingDots from "../components/LoadingDots.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { useT } from "../i18n/useT.js";
import { trpc } from "../trpc.js";

interface PreorderItem {
  label: string;
  count: number;
}

function aggregatePreorderOrders(
  records: RecordRow[],
  buyer: number,
  preorderNames: Set<string>,
  noDeliveryDays?: Set<number>,
): Record<string, Record<string, PreorderItem>> {
  const dayMap: Record<string, Record<string, PreorderItem>> = {};

  for (const r of records) {
    if (!preorderNames.has(r.category)) continue;
    if (Number(r.buyer) !== buyer) continue;
    const deliveryDate = getDeliveryDate(r.timestamp, noDeliveryDays);
    if (!deliveryDate) continue;
    const itemKey = r.itemId || r.item;
    if (!dayMap[deliveryDate]) dayMap[deliveryDate] = {};
    if (!dayMap[deliveryDate][itemKey]) dayMap[deliveryDate][itemKey] = { label: r.item, count: 0 };
    dayMap[deliveryDate][itemKey].count += r.count;
  }

  return dayMap;
}

interface PreorderOrdersOverviewProps {
  buyer: number;
  preorderNames: Set<string>;
  noDeliveryDays?: Set<number>;
  onBack: () => void;
  locale: string;
}

export default function PreorderOrdersOverview({
  buyer,
  preorderNames,
  noDeliveryDays,
  onBack,
  locale,
}: PreorderOrdersOverviewProps) {
  const t = useT();
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc["records.list"]
      .query({ buyer })
      .then((data) => setRecords(data.records))
      .catch(() => setError(t("preorder.loadError")));
  }, [t, buyer]);

  const dayMap = records
    ? aggregatePreorderOrders(records, buyer, preorderNames, noDeliveryDays)
    : {};
  const days = Object.keys(dayMap).sort().reverse();
  const hasAny = days.some((day) => Object.values(dayMap[day]).some((v) => v.count > 0));

  return (
    <div className="screen">
      <ScreenHeader
        title={t("preorder.ordersTitle", { buyer })}
        onBack={onBack}
        backLabel={t("preorder.back")}
      />
      <div className="screen-body screen-body--scroll">
        {error && <div className="overview-error">{error}</div>}

        {records === null && !error && (
          <div className="sending-overlay">
            {t("common.loading")}
            <LoadingDots />
          </div>
        )}

        {records !== null && !hasAny && (
          <div className="overview-empty">{t("preorder.noOrders")}</div>
        )}

        {days.map((day) => {
          const items = Object.entries(dayMap[day]).filter(([, v]) => v.count > 0);
          if (items.length === 0) return null;
          return (
            <div key={day} className="preorder-buyer-section">
              <div className="preorder-buyer-header">{formatDate(day, locale)}</div>
              <div className="preorder-items">
                {items.map(([key, v]) => (
                  <div key={key} className="preorder-item-row">
                    <span className="preorder-item-name">{v.label}</span>
                    <span className="preorder-item-qty">
                      {t("preorder.unitCount", { count: v.count })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
