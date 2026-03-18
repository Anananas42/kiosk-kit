import type { Apartment, CatalogCategory, CatalogItem } from '@kioskkit/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface LastOrder {
  buyer: number;
  buyerLabel: string;
  category: CatalogCategory;
  item: CatalogItem;
}

interface BuyerSelectProps {
  apartments: Apartment[];
  onSelect: (apt: Apartment) => void;
  error: string | null;
  lastOrder: LastOrder | null;
  onRepeat: () => void;
}

export default function BuyerSelect({ apartments, onSelect, error, lastOrder, onRepeat }: BuyerSelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="🏠 Vyberte apartmán"
        right={lastOrder ? (
          <button className="screen-header__action" onClick={onRepeat} type="button">
            🔁 Opakovat {lastOrder.buyerLabel} {lastOrder.item.name}
          </button>
        ) : undefined}
      />
      <div className="screen-body">
        {error ? (
          <div className="catalog-error">
            <div className="catalog-error__icon">⚠️</div>
            <div className="catalog-error__message">{error}</div>
          </div>
        ) : apartments.length === 0 ? (
          <div className="empty-state">
            Načítám&hellip;
          </div>
        ) : (
          <div className="tile-grid tile-grid--buyers">
            {apartments.map((apt) => (
              <Tile
                key={apt.id}
                label={apt.label}
                variant="neutral"
                onClick={() => onSelect(apt)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
