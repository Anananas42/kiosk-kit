import type { CatalogCategory } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ContextBar from '../components/ContextBar.js';
import { tileScaleStyle } from '../utils/tileScale.js';

interface CategorySelectProps {
  buyer: number;
  catalog: CatalogCategory[];
  onSelect: (category: CatalogCategory) => void;
  onOverview: () => void;
  onPastryOrders: () => void;
  onMainMenu: () => void;
}

const FOOTER_LABELS = ['Objednávky pečiva', 'Přehled konzumace'];

export default function CategorySelect({ buyer, catalog, onSelect, onOverview, onPastryOrders, onMainMenu }: CategorySelectProps) {
  const catLabels = catalog.map((cat) => cat.name);

  return (
    <div className="screen">
      <ContextBar buyer={buyer} />
      <div className="screen-body">
        <button className="btn-back" onClick={onMainMenu} type="button">
          &larr; Změnit kupujícího
        </button>
        <div className="screen-title">2. Vyberte kategorii</div>
        <div className="tile-grid tile-grid--categories" style={tileScaleStyle(catLabels)}>
          {catalog.map((cat) => (
            <Tile
              key={cat.id}
              label={cat.name}
              variant="category"
              onClick={() => onSelect(cat)}
            />
          ))}
        </div>
        <div className="category-footer" style={tileScaleStyle(FOOTER_LABELS)}>
          <Tile label="Objednávky pečiva" icon="🥐" variant="overview" onClick={onPastryOrders} />
          <Tile label="Přehled konzumace" icon="📊" variant="overview" onClick={onOverview} />
        </div>
      </div>
    </div>
  );
}
