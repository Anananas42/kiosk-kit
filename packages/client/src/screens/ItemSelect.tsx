import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import { ensureKc } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ContextBar from '../components/ContextBar.js';
import { tileScaleStyle } from '../utils/tileScale.js';

interface ItemSelectProps {
  buyer: number;
  category: CatalogCategory;
  onSelect: (item: CatalogItem) => void;
  onBack: () => void;
}

function itemSubtitle(item: CatalogItem): string {
  const parts: string[] = [];
  if (item.quantity) parts.push(item.quantity);
  if (item.price) parts.push(ensureKc(item.price));
  return parts.join(' · ');
}

export default function ItemSelect({ buyer, category, onSelect, onBack }: ItemSelectProps) {
  const labels = category.items.map((item) => item.name);

  return (
    <div className="screen">
      <ContextBar buyer={buyer} category={category.name} />
      <div className="screen-body">
        <div className="screen-title">3. Vyberte položku</div>
        <div className="tile-grid tile-grid--items" style={tileScaleStyle(labels)}>
          {category.items.map((item) => (
            <Tile
              key={item.name}
              label={item.name}
              subtitle={itemSubtitle(item)}
              variant="item"
              onClick={() => onSelect(item)}
            />
          ))}
        </div>
        <button className="btn-back" onClick={onBack} type="button">
          &larr; Zpět na kategorie
        </button>
      </div>
    </div>
  );
}
