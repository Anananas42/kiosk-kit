import type { CatalogCategory, CatalogItem } from '@kioskkit/shared';
import { ensureKc } from '@kioskkit/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface ItemSelectProps {
  buyerLabel: string;
  category: CatalogCategory;
  onSelect: (item: CatalogItem) => void;
  onBack: () => void;
  backLabel?: string;
}

function itemSubtitle(item: CatalogItem): string {
  const parts: string[] = [];
  if (item.quantity) parts.push(item.quantity);
  if (item.price) parts.push(ensureKc(item.price));
  return parts.join(' \u00b7 ');
}

export default function ItemSelect({ buyerLabel, category, onSelect, onBack, backLabel = 'Zpět na kategorie' }: ItemSelectProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="🛒 Vyberte položku"
        onBack={onBack}
        backLabel={backLabel}
        crumbs={[
          { label: 'Kupující', value: buyerLabel },
          { label: 'Kategorie', value: category.name },
        ]}
      />
      <div className="screen-body">
        <div className="tile-grid tile-grid--items">
          {category.items.map((item) => (
            <Tile
              key={item.id || item.name}
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
