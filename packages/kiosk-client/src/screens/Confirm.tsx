import type { CatalogItem } from "@kioskkit/shared";
import { formatCurrency, getDeliveryDateLabel, parsePrice } from "@kioskkit/shared";
import { useEffect, useState } from "react";
import LoadingDots from "../components/LoadingDots.js";
import ScreenHeader from "../components/ScreenHeader.js";
import Tile from "../components/Tile.js";
import { useT } from "../i18n/useT.js";
import { trpc } from "../trpc.js";

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

interface ConfirmProps {
  buyer: number;
  buyerLabel: string;
  item: CatalogItem;
  isPreorder: boolean;
  noDeliveryDays?: Set<number>;
  onConfirm: (operation: "+" | "-", quantity: number) => void;
  onBack: () => void;
  isSending: boolean;
  error: string | null;
  onErrorDismiss: () => void;
  locale: string;
  currency: string;
}

export default function Confirm({
  buyer,
  buyerLabel,
  item,
  isPreorder,
  noDeliveryDays,
  onConfirm,
  onBack,
  isSending,
  error,
  onErrorDismiss,
  locale,
  currency,
}: ConfirmProps) {
  const t = useT();
  const [qty, setQty] = useState(1);
  const [confirmingStorno, setConfirmingStorno] = useState(false);
  const [existingQty, setExistingQty] = useState<number | null>(null);
  const [cancellable, setCancellable] = useState<number | null>(null);

  useEffect(() => {
    if (error) setConfirmingStorno(false);
  }, [error]);

  useEffect(() => {
    if (!isPreorder) return;
    trpc["records.itemCount"]
      .query({ buyer, item: item.name, itemId: item.id, preorder: true })
      .then((data) => {
        setExistingQty(data.count);
        setCancellable(data.cancellable ?? 0);
      })
      .catch(() => {});
  }, [isPreorder, buyer, item.name, item.id]);

  const unitPrice = parsePrice(item.price);
  const totalPrice = isPreorder ? unitPrice * qty : unitPrice;
  const priceLabel = totalPrice ? formatCurrency(totalPrice, locale, currency) : "";
  const qtyLabel = isPreorder ? `${qty}\u00d7 ` : "";
  const deliveryDate = isPreorder ? getDeliveryDateLabel(noDeliveryDays, locale) : null;

  const addLabel = priceLabel
    ? t("confirm.add")
    : t("confirm.addItem", { label: `${qtyLabel}${item.name}` });

  const stornoQty =
    isPreorder && cancellable !== null
      ? Math.min(qty, cancellable)
      : isPreorder && existingQty !== null
        ? Math.min(qty, existingQty)
        : qty;
  const canStorno =
    !isPreorder ||
    (cancellable !== null ? cancellable > 0 : existingQty !== null && existingQty > 0);
  const stornoLabel = isPreorder
    ? t("confirm.removeItem", { qty: stornoQty, item: item.name })
    : t("confirm.removeItemSimple", { item: item.name });

  if (isPreorder) {
    return (
      <div className="screen">
        <ScreenHeader
          title={t("confirm.preorderTitle")}
          onBack={onBack}
          backLabel={t("confirm.backToItems")}
        />
        <div className="screen-body screen-body--preorder-confirm">
          <div className="preorder-confirm-summary">
            <span>{buyerLabel}</span>
            <span className="preorder-confirm-summary__sep">&middot;</span>
            <span>{item.name}</span>
            {unitPrice > 0 && (
              <>
                <span className="preorder-confirm-summary__sep">&middot;</span>
                <span>
                  {t("confirm.perUnit", { price: formatCurrency(unitPrice, locale, currency) })}
                </span>
              </>
            )}
          </div>

          <div className="preorder-confirm-qty">
            <div className="tile-grid tile-grid--quantity">
              {QUANTITIES.map((q) => (
                <Tile
                  key={q}
                  label={String(q)}
                  variant={q === qty ? "add" : "neutral"}
                  onClick={() => {
                    setQty(q);
                    setConfirmingStorno(false);
                  }}
                />
              ))}
            </div>
          </div>

          {deliveryDate && (
            <div className="delivery-notice">
              {totalPrice > 0
                ? t("confirm.deliveryTotal", { date: deliveryDate, total: priceLabel })
                : t("confirm.delivery", { date: deliveryDate })}
              {existingQty !== null && existingQty > 0 && (
                <> &middot; {t("confirm.alreadyOrdered", { count: existingQty })}</>
              )}
              {existingQty !== null && existingQty > 0 && cancellable === 0 && (
                <> &middot; {t("confirm.pastOrdersLocked")}</>
              )}
            </div>
          )}

          {error && (
            <div className="confirm-error">
              <span>{error}</span>
              <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">
                &#x2715;
              </button>
            </div>
          )}

          {isSending ? (
            <div className="sending-overlay">
              {t("confirm.sending")}
              <LoadingDots />
            </div>
          ) : (
            <div className="confirm-actions confirm-actions--preorder">
              <button
                className="btn-confirm btn-confirm--add"
                onClick={() => onConfirm("+", qty)}
                type="button"
              >
                {priceLabel
                  ? t("confirm.addQtyPrice", { qty, price: priceLabel })
                  : t("confirm.addQty", { qty })}
              </button>
              {canStorno &&
                (confirmingStorno ? (
                  <div className="confirm-storno-gate">
                    <span className="confirm-storno-gate__label">
                      {t("confirm.removeQty", { qty: stornoQty })}
                    </span>
                    <button
                      className="btn-confirm btn-confirm--remove-yes"
                      onClick={() => onConfirm("-", stornoQty)}
                      type="button"
                    >
                      {t("confirm.yes")}
                    </button>
                    <button
                      className="btn-confirm btn-confirm--remove-no"
                      onClick={() => setConfirmingStorno(false)}
                      type="button"
                    >
                      {t("confirm.no")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-confirm btn-confirm--remove"
                    onClick={() => setConfirmingStorno(true)}
                    type="button"
                  >
                    {stornoLabel}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-preorder: spacious layout
  return (
    <div className="screen">
      <ScreenHeader
        title={t("confirm.title")}
        onBack={onBack}
        backLabel={t("confirm.backToItems")}
      />
      <div className="screen-body">
        <div className="confirm-card">
          <div className="confirm-info-row">{buyerLabel}</div>
          <div className="confirm-info-row">{item.name}</div>
          <div className="confirm-info-row confirm-info-row--muted">
            {item.quantity ? `${item.quantity} · ` : ""}
            {priceLabel || ""}
          </div>
        </div>

        {error && (
          <div className="confirm-error">
            <span>{error}</span>
            <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">
              &#x2715;
            </button>
          </div>
        )}

        {isSending ? (
          <div className="sending-overlay">
            {t("confirm.sending")}
            <LoadingDots />
          </div>
        ) : (
          <div className="confirm-actions">
            <button
              className="btn-confirm btn-confirm--add"
              onClick={() => onConfirm("+", qty)}
              type="button"
            >
              {addLabel}
            </button>
            {confirmingStorno ? (
              <div className="confirm-storno-gate">
                <span className="confirm-storno-gate__label">{t("confirm.confirmStorno")}</span>
                <button
                  className="btn-confirm btn-confirm--remove-yes"
                  onClick={() => onConfirm("-", 1)}
                  type="button"
                >
                  {t("confirm.yesRemove")}
                </button>
                <button
                  className="btn-confirm btn-confirm--remove-no"
                  onClick={() => setConfirmingStorno(false)}
                  type="button"
                >
                  {t("confirm.no")}
                </button>
              </div>
            ) : (
              <button
                className="btn-confirm btn-confirm--remove"
                onClick={() => setConfirmingStorno(true)}
                type="button"
              >
                {stornoLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
