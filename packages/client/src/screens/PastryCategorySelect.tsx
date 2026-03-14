import type { CatalogCategory } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface PastryCategorySelectProps {
  buyer: number;
  categories: CatalogCategory[];
  onSelect: (category: CatalogCategory) => void;
  onViewOrders: () => void;
  onBack: () => void;
}

export default function PastryCategorySelect({ buyer, categories, onSelect, onViewOrders, onBack }: PastryCategorySelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="🥐 Objednat pečivo"
        onBack={onBack}
        backLabel="Zpět na kategorie"
        crumbs={[{ label: 'Kupující', value: `#${buyer}` }]}
      />
      <div className="screen-body">
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
        <div className="category-footer">
          <Tile label="Přehled objednávek" icon="📋" variant="overview" onClick={onViewOrders} />
        </div>
      </div>
    </div>
  );
}
