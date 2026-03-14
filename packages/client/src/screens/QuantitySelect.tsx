import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import { getDeliveryDateLabel } from '@zahumny/shared';
import ContextBar from '../components/ContextBar.js';
import Tile from '../components/Tile.js';
import { tileScaleStyle } from '../utils/tileScale.js';

interface QuantitySelectProps {
  buyer: number;
  category: CatalogCategory;
  item: CatalogItem;
  onSelect: (qty: number) => void;
  onBack: () => void;
}

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);
const QTY_LABELS = QUANTITIES.map(String);

export default function QuantitySelect({ buyer, category, item, onSelect, onBack }: QuantitySelectProps) {
  const deliveryDate = getDeliveryDateLabel();

  return (
    <div className="screen">
      <ContextBar buyer={buyer} category={category.name} />
      <div className="screen-body">
        <div className="screen-title">4. Kolik kusů — {item.name}</div>
        <div className="delivery-notice">
          Objednávky do 11:00 dodáme následující den.
          Při objednávce <strong>NYNÍ</strong> bude pečivo připraveno v <strong>{deliveryDate}</strong>.
        </div>
        <div className="tile-grid tile-grid--quantity" style={tileScaleStyle(QTY_LABELS)}>
          {QUANTITIES.map((qty) => (
            <Tile
              key={qty}
              label={String(qty)}
              subtitle="ks"
              variant="neutral"
              onClick={() => onSelect(qty)}
            />
          ))}
        </div>
        <button className="btn-back" onClick={onBack} type="button">
          &larr; Zpět na položky
        </button>
      </div>
    </div>
  );
}
