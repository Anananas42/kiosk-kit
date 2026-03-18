import type { CatalogCategory } from '@kioskkit/shared';
import { useT } from '../i18n/index.js';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface CategorySelectProps {
  buyerLabel: string;
  catalog: CatalogCategory[];
  onSelect: (category: CatalogCategory) => void;
  onOverview: () => void;
  onPreorder: () => void;
  onMainMenu: () => void;
}

export default function CategorySelect({ buyerLabel, catalog, onSelect, onOverview, onPreorder, onMainMenu }: CategorySelectProps) {
  const t = useT();
  const mainCategories = catalog.filter((cat) => !cat.preorder);

  return (
    <div className="screen">
      <ScreenHeader
        title={t('category.title')}
        onBack={onMainMenu}
        backLabel={t('category.changeBuyer')}
        crumbs={[{ label: t('category.buyer'), value: buyerLabel }]}
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
          <Tile label={t('category.preorder')} icon="🥐" variant="overview" onClick={onPreorder} />
          <Tile label={t('category.overview')} icon="📊" variant="overview" onClick={onOverview} />
        </div>
      </div>
    </div>
  );
}
