import { useEffect, useState } from 'react';
import { PASTRY_CATEGORIES, getDeliveryDate, formatDateCs, type EvidenceRow } from '@zahumny/shared';
import { fetchOverview } from '../api.js';
import ScreenHeader from '../components/ScreenHeader.js';

function aggregatePastryOrders(records: EvidenceRow[], buyer: number): Record<string, Record<string, number>> {
  const dayMap: Record<string, Record<string, number>> = {};

  for (const r of records) {
    if (!PASTRY_CATEGORIES.has(r.category)) continue;
    if (Number(r.buyer) !== buyer) continue;
    const deliveryDate = getDeliveryDate(r.timestamp);
    if (!deliveryDate) continue;
    if (!dayMap[deliveryDate]) dayMap[deliveryDate] = {};
    if (!dayMap[deliveryDate][r.item]) dayMap[deliveryDate][r.item] = 0;
    dayMap[deliveryDate][r.item] += r.count;
  }

  return dayMap;
}

interface PastryOrdersOverviewProps {
  buyer: number;
  onBack: () => void;
}

export default function PastryOrdersOverview({ buyer, onBack }: PastryOrdersOverviewProps) {
  const [records, setRecords] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then((data) => setRecords(data.records))
      .catch(() => setError('Nepodařilo se načíst data.'));
  }, []);

  const dayMap = records ? aggregatePastryOrders(records, buyer) : {};
  const days = Object.keys(dayMap).sort().reverse();
  const hasAny = days.some((day) => Object.values(dayMap[day]).some((qty) => qty > 0));

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
          const items = Object.entries(dayMap[day]).filter(([, qty]) => qty > 0);
          if (items.length === 0) return null;
          return (
            <div key={day} className="pastry-buyer-section">
              <div className="pastry-buyer-header">{formatDateCs(day)}</div>
              <div className="pastry-items">
                {items.map(([itemName, qty]) => (
                  <div key={itemName} className="pastry-item-row">
                    <span className="pastry-item-name">{itemName}</span>
                    <span className="pastry-item-qty">{qty} ks</span>
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
