import type { CatalogCategory } from '@kioskkit/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface PastryCategorySelectProps {
  buyerLabel: string;
  categories: CatalogCategory[];
  orderingAllowed: boolean;
  onSelect: (category: CatalogCategory) => void;
  onViewOrders: () => void;
  onBack: () => void;
}

export default function PastryCategorySelect({ buyerLabel, categories, orderingAllowed, onSelect, onViewOrders, onBack }: PastryCategorySelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="🥐 Objednat pečivo"
        onBack={onBack}
        backLabel="Zpět na kategorie"
        crumbs={[{ label: 'Kupující', value: buyerLabel }]}
      />
      <div className="screen-body">
        {!orderingAllowed && (
          <div className="pastry-ordering-disabled">
            Objednávky pečiva dnes nejsou k dispozici.
          </div>
        )}
        {orderingAllowed && (
          <div className="tile-grid tile-grid--categories">
            {categories.map((cat) => (
              <Tile
                key={cat.id}
                label={cat.name}
                variant="category"
                onClick={() => onSelect(cat)}
              />
            ))}
          </div>
        )}
        <div className="category-footer">
          <Tile label="Přehled objednávek" icon="📋" variant="overview" onClick={onViewOrders} />
        </div>
      </div>
    </div>
  );
}
