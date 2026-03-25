import type { Buyer } from "@kioskkit/shared";
import LoadingDots from "../components/LoadingDots.js";
import ScreenHeader from "../components/ScreenHeader.js";
import Tile from "../components/Tile.js";
import { useT } from "../i18n/useT.js";
import type { LastOrder } from "../types.js";

interface BuyerSelectProps {
  buyers: Buyer[];
  onSelect: (buyer: Buyer) => void;
  error: string | null;
  loading: boolean;
  lastOrder: LastOrder | null;
  onRepeat: () => void;
  buyerNoun: string;
}

export default function BuyerSelect({
  buyers,
  onSelect,
  error,
  loading,
  lastOrder,
  onRepeat,
  buyerNoun,
}: BuyerSelectProps) {
  const t = useT();
  return (
    <div className="screen">
      <ScreenHeader
        title={t("buyer.title", { buyerNoun })}
        right={
          lastOrder ? (
            <button className="screen-header__action" onClick={onRepeat} type="button">
              {t("buyer.repeat", { buyer: lastOrder.buyerLabel, item: lastOrder.item.name })}
            </button>
          ) : undefined
        }
      />
      <div className="screen-body">
        {error ? (
          <div className="catalog-error">
            <div className="catalog-error__icon">⚠️</div>
            <div className="catalog-error__message">{error}</div>
          </div>
        ) : loading ? (
          <div className="empty-state">
            {t("buyer.loading")}
            <LoadingDots />
          </div>
        ) : buyers.length === 0 ? (
          <div className="empty-state">{t("buyer.empty")}</div>
        ) : (
          <div className="tile-grid tile-grid--buyers">
            {buyers.map((b) => (
              <Tile key={b.id} label={b.label} variant="neutral" onClick={() => onSelect(b)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
