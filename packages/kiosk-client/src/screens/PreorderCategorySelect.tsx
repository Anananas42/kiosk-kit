import type { CatalogCategory } from "@kioskkit/shared";
import ScreenHeader from "../components/ScreenHeader.js";
import Tile from "../components/Tile.js";
import { useT } from "../i18n/useT.js";

interface PreorderCategorySelectProps {
  buyerLabel: string;
  categories: CatalogCategory[];
  orderingAllowed: boolean;
  onSelect: (category: CatalogCategory) => void;
  onViewOrders: () => void;
  onBack: () => void;
}

export default function PreorderCategorySelect({
  buyerLabel,
  categories,
  orderingAllowed,
  onSelect,
  onViewOrders,
  onBack,
}: PreorderCategorySelectProps) {
  const t = useT();
  return (
    <div className="screen">
      <ScreenHeader
        title={t("preorder.title")}
        onBack={onBack}
        backLabel={t("preorder.backToCategories")}
        crumbs={[{ label: t("preorder.buyer"), value: buyerLabel }]}
      />
      <div className="screen-body">
        {!orderingAllowed && (
          <div className="preorder-ordering-disabled">{t("preorder.orderingDisabled")}</div>
        )}
        {orderingAllowed && (
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
        )}
        <div className="category-footer">
          <Tile
            label={t("preorder.viewOrders")}
            icon="📋"
            variant="overview"
            onClick={onViewOrders}
          />
        </div>
      </div>
    </div>
  );
}
