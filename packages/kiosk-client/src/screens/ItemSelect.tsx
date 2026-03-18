import type { CatalogCategory, CatalogItem } from '@kioskkit/shared';
import { formatCurrency, parsePrice } from '@kioskkit/shared';
import { useT } from '../i18n/index.js';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface ItemSelectProps {
  buyerLabel: string;
  category: CatalogCategory;
  onSelect: (item: CatalogItem) => void;
  onBack: () => void;
  locale: string;
  currency: string;
}

export default function ItemSelect({ buyerLabel, category, onSelect, onBack, locale, currency }: ItemSelectProps) {
  const t = useT();

  function itemSubtitle(item: CatalogItem): string {
    const parts: string[] = [];
    if (item.quantity) parts.push(item.quantity);
    if (item.price) parts.push(formatCurrency(parsePrice(item.price), locale, currency));
    return parts.join(' \u00b7 ');
  }

  const backLabel = category.preorder ? t('item.backToPreorder') : t('item.backToCategories');

  return (
    <div className="screen">
      <ScreenHeader
        title={t('item.title')}
        onBack={onBack}
        backLabel={backLabel}
        crumbs={[
          { label: t('item.buyer'), value: buyerLabel },
          { label: t('item.category'), value: category.name },
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
