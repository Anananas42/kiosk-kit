import { useEffect, useState } from 'react';
import { parsePrice, type EvidenceRow } from '@zahumny/shared';
import { fetchOverview } from '../api.js';

interface AggregatedItem {
  added: number;
  removed: number;
  addedKc: number;
  removedKc: number;
  unitPrice: number;
}

function aggregateItems(records: EvidenceRow[], buyer: number): Record<string, AggregatedItem> {
  const map: Record<string, AggregatedItem> = {};

  for (const r of records) {
    if (Number(r.buyer) !== buyer) continue;
    const ksMatch = String(r.quantity).match(/^(\d+) ks$/);
    const key = ksMatch ? r.item : (r.quantity ? `${r.item} ${r.quantity}` : r.item);

    if (!map[key]) map[key] = { added: 0, removed: 0, addedKc: 0, removedKc: 0, unitPrice: 0 };
    const kc = parsePrice(r.price);

    if (ksMatch) {
      const ks = Number(ksMatch[1]);
      if (r.delta > 0) { map[key].added += ks; map[key].addedKc += kc; }
      else { map[key].removed += ks; map[key].removedKc += kc; }
    } else {
      if (!map[key].unitPrice) map[key].unitPrice = kc;
      if (r.delta > 0) map[key].added += 1;
      else map[key].removed += 1;
    }
  }

  for (const v of Object.values(map)) {
    v.removed = Math.min(v.removed, v.added);
    if (v.unitPrice) {
      v.addedKc = v.added * v.unitPrice;
      v.removedKc = v.removed * v.unitPrice;
    } else {
      v.removedKc = Math.min(v.removedKc, v.addedKc);
    }
  }

  return map;
}

interface ConsumptionOverviewProps {
  buyer: number;
  onBack: () => void;
}

export default function ConsumptionOverview({ buyer, onBack }: ConsumptionOverviewProps) {
  const [records, setRecords] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then((data) => setRecords(data.records))
      .catch(() => setError('Nepodařilo se načíst data.'));
  }, []);

  const byItem = records ? aggregateItems(records, buyer) : {};
  const items = Object.entries(byItem).filter(([, v]) => v.added > 0);
  const total = items.reduce((sum, [, v]) => sum + v.addedKc - v.removedKc, 0);
  const totalStorno = items.reduce((sum, [, v]) => sum + v.removedKc, 0);

  return (
    <div className="screen">
      <div className="overview-header">
        <button className="btn-back" onClick={onBack} type="button">← Zpět</button>
        <span className="screen-title">Konzumace kupující #{buyer}</span>
      </div>
      <div className="screen-body">
        {error && <div className="overview-error">{error}</div>}

        {records === null && !error && (
          <div className="sending-overlay">Načítám…</div>
        )}

        {records !== null && (
          items.length === 0 ? (
            <div className="overview-empty">Žádná konzumace.</div>
          ) : (
            <div className="overview-grid">
              <div className="overview-row overview-row--header">
                <span>Položka</span>
                <span>Ks</span>
                <span>Přidáno</span>
                <span>Storno</span>
                <span>Celkem</span>
              </div>
              {items.map(([name, v]) => {
                const net = v.added - v.removed;
                const lineTotal = v.addedKc - v.removedKc;
                return (
                  <div key={name} className="overview-row overview-row--item">
                    <span className="overview-item-name">{name}</span>
                    <span className="overview-net overview-net--pos">{net}</span>
                    <span className="overview-net overview-net--pos">
                      {v.addedKc > 0 ? `${v.addedKc.toFixed(0)} Kč` : '—'}
                    </span>
                    <span className="overview-net overview-net--neg">
                      {v.removedKc > 0 ? `−${v.removedKc.toFixed(0)} Kč` : '—'}
                    </span>
                    <span className="overview-net overview-net--pos">
                      {`${lineTotal.toFixed(0)} Kč`}
                    </span>
                  </div>
                );
              })}
              <div className="overview-row overview-row--total">
                <span>Celkem</span>
                <span></span>
                <span>{total > 0 || totalStorno > 0 ? `${(total + totalStorno).toFixed(0)} Kč` : '—'}</span>
                <span>{totalStorno > 0 ? `−${totalStorno.toFixed(0)} Kč` : '—'}</span>
                <span className="overview-net">{total.toFixed(0)} Kč</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
