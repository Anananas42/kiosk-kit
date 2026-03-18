import { useEffect, useState } from 'react';
import { getDeliveryDate, formatDateCs, type EvidenceRow } from '@kioskkit/shared';
import { fetchOverview } from '../api.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface PastryItem { label: string; count: number }

function aggregatePastryOrders(records: EvidenceRow[], buyer: number, pastryNames: Set<string>, noDeliveryDays?: Set<number>): Record<string, Record<string, PastryItem>> {
  const dayMap: Record<string, Record<string, PastryItem>> = {};

  for (const r of records) {
    if (!pastryNames.has(r.category)) continue;
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

interface PastryOrdersOverviewProps {
  buyer: number;
  pastryNames: Set<string>;
  noDeliveryDays?: Set<number>;
  onBack: () => void;
}

export default function PastryOrdersOverview({ buyer, pastryNames, noDeliveryDays, onBack }: PastryOrdersOverviewProps) {
  const [records, setRecords] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then((data) => setRecords(data.records))
      .catch(() => setError('Nepodařilo se načíst data.'));
  }, []);

  const dayMap = records ? aggregatePastryOrders(records, buyer, pastryNames, noDeliveryDays) : {};
  const days = Object.keys(dayMap).sort().reverse();
  const hasAny = days.some((day) => Object.values(dayMap[day]).some((v) => v.count > 0));

  return (
    <div className="screen">
      <ScreenHeader
        title={`🥐 Objednávky pečiva #${buyer}`}
        onBack={onBack}
        backLabel="Zpět"
      />
      <div className="screen-body screen-body--scroll">
        {error && <div className="overview-error">{error}</div>}

        {records === null && !error && (
          <div className="sending-overlay">Načítám…</div>
        )}

        {records !== null && !hasAny && (
          <div className="overview-empty">Žádné objednávky pečiva.</div>
        )}

        {days.map((day) => {
          const items = Object.entries(dayMap[day]).filter(([, v]) => v.count > 0);
          if (items.length === 0) return null;
          return (
            <div key={day} className="pastry-buyer-section">
              <div className="pastry-buyer-header">{formatDateCs(day)}</div>
              <div className="pastry-items">
                {items.map(([key, v]) => (
                  <div key={key} className="pastry-item-row">
                    <span className="pastry-item-name">{v.label}</span>
                    <span className="pastry-item-qty">{v.count} ks</span>
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
