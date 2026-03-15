import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import { ensureKc, formatPrice, getDeliveryDateLabel, parsePrice } from '@zahumny/shared';
import { useState, useEffect } from 'react';
import { fetchItemCount } from '../api.js';
import ScreenHeader from '../components/ScreenHeader.js';
import Tile from '../components/Tile.js';

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

interface ConfirmProps {
  buyer: number;
  category: CatalogCategory;
  item: CatalogItem;
  isPastry: boolean;
  noDeliveryDays?: Set<number>;
  onConfirm: (operation: '+' | '-', quantity: number) => void;
  onBack: () => void;
  isSending: boolean;
  error: string | null;
  onErrorDismiss: () => void;
}

export default function Confirm({ buyer, category, item, isPastry, noDeliveryDays, onConfirm, onBack, isSending, error, onErrorDismiss }: ConfirmProps) {
  const [qty, setQty] = useState(1);
  const [confirmingStorno, setConfirmingStorno] = useState(false);
  const [existingQty, setExistingQty] = useState<number | null>(null);

  useEffect(() => {
    if (error) setConfirmingStorno(false);
  }, [error]);

  useEffect(() => {
    if (!isPastry) return;
    fetchItemCount(buyer, item.name, item.id)
      .then((data) => setExistingQty(data.count))
      .catch(() => {});
  }, [isPastry, buyer, item.name, item.id]);

  const unitPrice = parsePrice(item.price);
  const totalPrice = isPastry ? unitPrice * qty : unitPrice;
  const priceLabel = totalPrice ? ensureKc(formatPrice(totalPrice)) : '';
  const qtyLabel = isPastry ? `${qty}\u00d7 ` : '';
  const deliveryDate = isPastry ? getDeliveryDateLabel(noDeliveryDays) : null;

  const addLabel = priceLabel
    ? `Přidat`
    : `✅ Přidat ${qtyLabel}${item.name}`;

  const stornoQty = isPastry && existingQty !== null ? Math.min(qty, existingQty) : qty;
  const canStorno = !isPastry || (existingQty !== null && existingQty > 0);
  const stornoLabel = isPastry
    ? `Odebrat ${stornoQty}\u00d7 ${item.name}`
    : `Odebrat ${item.name}`;

  if (isPastry) {
    return (
      <div className="screen">
        <ScreenHeader
          title="🥐 Objednávka pečiva"
          onBack={onBack}
          backLabel="Zpět na položky"
        />
        <div className="screen-body screen-body--pastry-confirm">
          {/* Compact summary: apartment + item + unit price on one line */}
          <div className="pastry-confirm-summary">
            <span>#{buyer}</span>
            <span className="pastry-confirm-summary__sep">&middot;</span>
            <span>{item.name}</span>
            {unitPrice > 0 && (
              <>
                <span className="pastry-confirm-summary__sep">&middot;</span>
                <span>{ensureKc(item.price)}/ks</span>
              </>
            )}
          </div>

          {/* Quantity picker */}
          <div className="pastry-confirm-qty">
            <div className="tile-grid tile-grid--quantity">
              {QUANTITIES.map((q) => (
                <Tile
                  key={q}
                  label={String(q)}
                  variant={q === qty ? 'add' : 'neutral'}
                  onClick={() => { setQty(q); setConfirmingStorno(false); }}
                />
              ))}
            </div>
          </div>

          {/* Delivery + total */}
          {deliveryDate && (
            <div className="delivery-notice">
              Dodání: <strong>{deliveryDate}</strong>
              {totalPrice > 0 && <> &middot; Celkem: <strong>{priceLabel}</strong></>}
              {existingQty !== null && existingQty > 0 && <> &middot; Již objednáno: <strong>{existingQty} ks</strong></>}
            </div>
          )}

          {error && (
            <div className="confirm-error">
              <span>{error}</span>
              <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">&#x2715;</button>
            </div>
          )}

          {isSending ? (
            <div className="sending-overlay">Odesílám&hellip;</div>
          ) : (
            <div className="confirm-actions confirm-actions--pastry">
              <button className="btn-confirm btn-confirm--add" onClick={() => onConfirm('+', qty)} type="button">
                Přidat {qty}&times; za {priceLabel}
              </button>
              {canStorno && (
                confirmingStorno ? (
                  <div className="confirm-storno-gate">
                    <span className="confirm-storno-gate__label">Opravdu odebrat {stornoQty} ks?</span>
                    <button className="btn-confirm btn-confirm--remove-yes" onClick={() => onConfirm('-', stornoQty)} type="button">
                      Ano
                    </button>
                    <button className="btn-confirm btn-confirm--remove-no" onClick={() => setConfirmingStorno(false)} type="button">
                      Ne
                    </button>
                  </div>
                ) : (
                  <button className="btn-confirm btn-confirm--remove" onClick={() => setConfirmingStorno(true)} type="button">
                    {stornoLabel}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-pastry: spacious layout
  return (
    <div className="screen">
      <ScreenHeader
        title="✅ Potvrďte záznam"
        onBack={onBack}
        backLabel="Zpět na položky"
      />
      <div className="screen-body">
        <div className="confirm-card">
          <div className="confirm-info-row">#{buyer}</div>
          <div className="confirm-info-row">{item.name}</div>
          <div className="confirm-info-row confirm-info-row--muted">
            {item.quantity ? `${item.quantity} · ` : ''}
            {priceLabel || ''}
          </div>
        </div>

        {error && (
          <div className="confirm-error">
            <span>{error}</span>
            <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">&#x2715;</button>
          </div>
        )}

        {isSending ? (
          <div className="sending-overlay">Odesílám&hellip;</div>
        ) : (
          <div className="confirm-actions">
            <button className="btn-confirm btn-confirm--add" onClick={() => onConfirm('+', qty)} type="button">
              {addLabel}
            </button>
            {confirmingStorno ? (
              <div className="confirm-storno-gate">
                <span className="confirm-storno-gate__label">Opravdu stornovat?</span>
                <button className="btn-confirm btn-confirm--remove-yes" onClick={() => onConfirm('-', 1)} type="button">
                  Ano, odebrat
                </button>
                <button className="btn-confirm btn-confirm--remove-no" onClick={() => setConfirmingStorno(false)} type="button">
                  Ne
                </button>
              </div>
            ) : (
              <button className="btn-confirm btn-confirm--remove" onClick={() => setConfirmingStorno(true)} type="button">
                {stornoLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
