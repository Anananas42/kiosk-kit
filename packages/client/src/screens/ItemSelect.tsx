import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import { ensureKc } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ContextBar from '../components/ContextBar.js';

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
  return (
    <div className="screen">
      <ContextBar buyer={buyer} category={category.name} />
      <div className="screen-body">
        <div className="screen-title">Vyberte položku</div>
        <div className="tile-grid tile-grid--items">
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
          ← Zpět na kategorie
        </button>
      </div>
    </div>
  );
}
