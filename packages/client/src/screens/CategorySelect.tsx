import type { CatalogCategory } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface CategorySelectProps {
  buyerLabel: string;
  catalog: CatalogCategory[];
  onSelect: (category: CatalogCategory) => void;
  onOverview: () => void;
  onPastry: () => void;
  onMainMenu: () => void;
}

export default function CategorySelect({ buyerLabel, catalog, onSelect, onOverview, onPastry, onMainMenu }: CategorySelectProps) {
  const mainCategories = catalog.filter((cat) => !cat.pastry);

  return (
    <div className="screen">
      <ScreenHeader
        title="📋 Vyberte kategorii"
        onBack={onMainMenu}
        backLabel="Změnit kupujícího"
        crumbs={[{ label: 'Kupující', value: buyerLabel }]}
      />
      <div className="screen-body">
        <div className="tile-grid tile-grid--categories">
          {mainCategories.map((cat) => (
            <Tile
              key={cat.id}
              label={cat.name}
              variant="category"
              onClick={() => onSelect(cat)}
            />
          ))}
        </div>
        <div className="category-footer">
          <Tile label="Objednat pečivo" icon="🥐" variant="overview" onClick={onPastry} />
          <Tile label="Přehled konzumace" icon="📊" variant="overview" onClick={onOverview} />
        </div>
      </div>
    </div>
  );
}
