import { useState } from 'react';
import { ensureKc, parsePrice, formatPrice, getDeliveryDateLabel } from '@zahumny/shared';
import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import ScreenHeader from '../components/ScreenHeader.js';
import Tile from '../components/Tile.js';

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

interface ConfirmProps {
  buyer: number;
  category: CatalogCategory;
  item: CatalogItem;
  isPastry: boolean;
  onConfirm: (operation: '+' | '-', quantity: number) => void;
  onBack: () => void;
  isSending: boolean;
  error: string | null;
  onErrorDismiss: () => void;
}

export default function Confirm({ buyer, category, item, isPastry, onConfirm, onBack, isSending, error, onErrorDismiss }: ConfirmProps) {
  const [qty, setQty] = useState(1);
  const [confirmingStorno, setConfirmingStorno] = useState(false);

  const unitPrice = parsePrice(item.price);
  const totalPrice = isPastry ? unitPrice * qty : unitPrice;
  const priceLabel = totalPrice ? ensureKc(formatPrice(totalPrice)) : '';
  const qtyLabel = isPastry ? `${qty}\u00d7 ` : '';
  const deliveryDate = isPastry ? getDeliveryDateLabel() : null;

  const addLabel = priceLabel
    ? `Přidat ${qtyLabel}za ${priceLabel}`
    : `Přidat ${qtyLabel}${item.name}`;

  const stornoLabel = isPastry
    ? `Odebrat 1\u00d7 ${item.name}`
    : `Odebrat ${item.name}`;

  return (
    <div className="screen">
      <ScreenHeader
        title="✅ Potvrďte záznam"
        onBack={onBack}
        backLabel="Zpět na položky"
        crumbs={[
          { label: 'Kupující', value: `#${buyer}` },
          { label: 'Kategorie', value: category.name },
        ]}
      />
      <div className="screen-body">
        {/* Item identity — big and prominent */}
        <div className={`confirm-hero${isPastry ? ' confirm-hero--pastry' : ''}`}>
          <div className="confirm-hero__name">{item.name}</div>
          <div className="confirm-hero__meta">
            {item.quantity && !isPastry && <span>{item.quantity}</span>}
            {unitPrice > 0 && <span>{ensureKc(item.price)}{isPastry ? '/ks' : ''}</span>}
          </div>
        </div>

        {/* Pastry: inline quantity picker */}
        {isPastry && (
          <div className="confirm-qty">
            <div className="confirm-qty__label">Počet kusů</div>
            <div className="tile-grid tile-grid--quantity">
              {QUANTITIES.map((q) => (
                <Tile
                  key={q}
                  label={String(q)}
                  variant={q === qty ? 'add' : 'neutral'}
                  onClick={() => setQty(q)}
                />
              ))}
            </div>
          </div>
        )}

        {deliveryDate && (
          <div className="delivery-notice">
            Dodání: <strong>{deliveryDate}</strong>
            {totalPrice > 0 && <> &middot; Celkem: <strong>{priceLabel}</strong></>}
          </div>
        )}

        {error && (
          <div className="confirm-error">
            <span>{error}</span>
            <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">&#x2715;</button>
          </div>
        )}

        {/* Actions pinned to bottom */}
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
