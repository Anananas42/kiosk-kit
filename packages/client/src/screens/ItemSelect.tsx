import type { CatalogCategory, CatalogItem } from '@zahumny/shared';
import { ensureKc } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

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
  return parts.join(' \u00b7 ');
}

export default function ItemSelect({ buyer, category, onSelect, onBack }: ItemSelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="🛒 Vyberte položku"
        onBack={onBack}
        backLabel="Zpět na kategorie"
        crumbs={[
          { label: 'Kupující', value: `#${buyer}` },
          { label: 'Kategorie', value: category.name },
        ]}
      />
      <div className="screen-body">
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
      </div>
    </div>
  );
}
