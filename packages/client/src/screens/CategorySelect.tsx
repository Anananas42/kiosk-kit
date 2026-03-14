import type { CatalogCategory } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface CategorySelectProps {
  buyer: number;
  catalog: CatalogCategory[];
  onSelect: (category: CatalogCategory) => void;
  onOverview: () => void;
  onPastryOrders: () => void;
  onMainMenu: () => void;
}

export default function CategorySelect({ buyer, catalog, onSelect, onOverview, onPastryOrders, onMainMenu }: CategorySelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="Vyberte kategorii"
        onBack={onMainMenu}
        backLabel="Změnit kupujícího"
        crumbs={[{ label: 'Kupující', value: `#${buyer}` }]}
      />
      <div className="screen-body">
        <div className="tile-grid tile-grid--categories">
          {catalog.map((cat) => (
            <Tile
              key={cat.id}
              label={cat.name}
              variant="category"
              onClick={() => onSelect(cat)}
            />
          ))}
        </div>
        <div className="category-footer">
          <Tile label="Objednávky pečiva" icon="🥐" variant="overview" onClick={onPastryOrders} />
          <Tile label="Přehled konzumace" icon="📊" variant="overview" onClick={onOverview} />
        </div>
      </div>
    </div>
  );
}
