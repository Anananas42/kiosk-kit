import {
  type Buyer,
  type CatalogCategory,
  type CatalogItem,
  isOrderingAllowed,
  noDeliveryDaysSet,
  REPEAT_ORDER_MS,
} from "@kioskkit/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { postRecord } from "./api.js";
import OfflineBanner from "./components/OfflineBanner.js";
import SuccessFlash from "./components/SuccessFlash.js";
import { useCatalog } from "./hooks/useCatalog.js";
import { useHealth } from "./hooks/useHealth.js";
import { useIdleDim } from "./hooks/useIdleDim.js";
import { useInactivityReset } from "./hooks/useInactivityReset.js";
import { I18nProvider } from "./i18n/index.js";
import { useT } from "./i18n/useT.js";
import BuyerSelect from "./screens/BuyerSelect.js";
import CategorySelect from "./screens/CategorySelect.js";
import Confirm from "./screens/Confirm.js";
import ConsumptionOverview from "./screens/ConsumptionOverview.js";
import ItemSelect from "./screens/ItemSelect.js";
import PreorderCategorySelect from "./screens/PreorderCategorySelect.js";
import PreorderOrdersOverview from "./screens/PreorderOrdersOverview.js";
import { enqueueRecord, startFlushTimer } from "./utils/submitQueue.js";

type Screen =
  | "buyer"
  | "category"
  | "preorder-category"
  | "item"
  | "confirm"
  | "overview"
  | "preorder-orders";

interface AppState {
  screen: Screen;
  buyer: number | null;
  buyerLabel: string | null;
  category: CatalogCategory | null;
  item: CatalogItem | null;
}

interface LastOrder {
  buyer: number;
  buyerLabel: string;
  category: CatalogCategory;
  item: CatalogItem;
}

function formatBuyerLabel(label: string): string {
  return /^\d+$/.test(label) ? `#${label}` : label;
}

const INITIAL_STATE: AppState = {
  screen: "buyer",
  buyer: null,
  buyerLabel: null,
  category: null,
  item: null,
};

export default function App() {
  const { catalog, buyers, preorderConfig, settings, reload, error: catalogError } = useCatalog();

  return (
    <I18nProvider locale={settings.locale}>
      <AppInner
        catalog={catalog}
        buyers={buyers}
        preorderConfig={{
          orderingDays: preorderConfig.orderingDays,
          deliveryDays: preorderConfig.deliveryDays,
        }}
        settings={settings}
        reload={reload}
        catalogError={catalogError}
      />
    </I18nProvider>
  );
}

interface AppInnerProps {
  catalog: CatalogCategory[];
  buyers: Buyer[];
  preorderConfig: { orderingDays: boolean[]; deliveryDays: boolean[] };
  settings: {
    idleDimMs: number;
    inactivityTimeoutMs: number;
    maintenance: boolean;
    locale: string;
    currency: string;
    buyerNoun: string;
  };
  reload: () => void;
  catalogError: string | null;
}

function AppInner({
  catalog,
  buyers,
  preorderConfig,
  settings,
  reload,
  catalogError,
}: AppInnerProps) {
  const t = useT();
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isSending, setIsSending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout>>();

  const isOffline = useHealth();
  const dimmed = useIdleDim(settings.idleDimMs);

  const preorderCategories = catalog.filter((cat) => cat.preorder);
  const preorderNames = new Set(preorderCategories.map((cat) => cat.name));
  const preorderOrderingAllowed = isOrderingAllowed(preorderConfig.orderingDays);
  const noDeliveryDays = noDeliveryDaysSet(preorderConfig.deliveryDays);

  useEffect(() => {
    startFlushTimer();
  }, []);

  useEffect(() => {
    if (!lastOrder) return;
    clearTimeout(repeatTimer.current);
    repeatTimer.current = setTimeout(() => setLastOrder(null), REPEAT_ORDER_MS);
    return () => clearTimeout(repeatTimer.current);
  }, [lastOrder]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setConfirmError(null);
    reload();
  }, [reload]);

  const { secondsLeft, dismiss: dismissWarning } = useInactivityReset(
    state.screen !== "buyer",
    reset,
    settings.inactivityTimeoutMs,
  );

  useEffect(() => {
    if (state.screen !== "buyer") return;
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [state.screen, reload]);

  const handleBuyerSelect = useCallback((b: Buyer) => {
    setState((s) => ({
      ...s,
      buyer: b.id,
      buyerLabel: formatBuyerLabel(b.label),
      screen: "category",
    }));
  }, []);

  const handleCategorySelect = useCallback((category: CatalogCategory) => {
    setState((s) => ({ ...s, category, screen: "item" }));
  }, []);

  const handlePreorderEntry = useCallback(() => {
    if (!preorderOrderingAllowed || preorderCategories.length !== 1) {
      setState((s) => ({ ...s, screen: "preorder-category" }));
    } else {
      setState((s) => ({ ...s, category: preorderCategories[0], screen: "item" }));
    }
  }, [preorderCategories, preorderOrderingAllowed]);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    setConfirmError(null);
    setState((s) => ({ ...s, item, screen: "confirm" }));
  }, []);

  const handleBackToCategory = useCallback(() => {
    setState((s) => {
      if (s.category?.preorder) {
        return { ...s, item: null, category: null, screen: "preorder-category" };
      }
      return { ...s, item: null, category: null, screen: "category" };
    });
  }, []);

  const handleRepeat = useCallback(() => {
    if (!lastOrder) return;
    setConfirmError(null);
    setState({
      screen: "confirm",
      buyer: lastOrder.buyer,
      buyerLabel: lastOrder.buyerLabel,
      category: lastOrder.category,
      item: lastOrder.item,
    });
  }, [lastOrder]);

  const handleConfirm = useCallback(
    async (operation: "+" | "-", quantity: number) => {
      const isPreorder = state.category!.preorder;
      const count = operation === "+" ? quantity : -quantity;

      const recordData = {
        buyer: state.buyer!,
        count,
        category: state.category!.name,
        item: state.item!.name,
        itemId: state.item!.id,
        quantity: state.item!.quantity,
        price: state.item!.price,
      };

      if (operation === "+") {
        enqueueRecord(recordData);
        const label = isPreorder ? `${quantity}\u00d7 ${state.item!.name}` : state.item!.name;
        setLastSuccess(t("app.added", { label }));
        setLastOrder({
          buyer: state.buyer!,
          buyerLabel: state.buyerLabel!,
          category: state.category!,
          item: state.item!,
        });
        reset();
        return;
      }

      setConfirmError(null);
      setIsSending(true);
      try {
        await postRecord(recordData);
        setLastSuccess(t("app.removed", { label: state.item!.name }));
        reset();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "insufficient_balance") {
          setConfirmError(
            t("app.insufficientBalance", { buyer: state.buyerLabel!, item: state.item!.name }),
          );
        } else {
          console.error("Record error:", err);
          setConfirmError(t("app.connectionFailed"));
        }
      } finally {
        setIsSending(false);
      }
    },
    [state, reset, t],
  );

  if (settings.maintenance) {
    return (
      <div className="app">
        <div className="maintenance-screen">
          <div className="maintenance-screen__icon">🔧</div>
          <div className="maintenance-screen__title">{t("app.maintenance.title")}</div>
          <div className="maintenance-screen__message">{t("app.maintenance.message")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {dimmed && <div className="idle-dim" />}
      <div className="toast-layer">
        {secondsLeft !== null && (
          <button type="button" className="inactivity-warning" onClick={dismissWarning}>
            {t("app.inactivityWarning", { seconds: secondsLeft })}
          </button>
        )}
      </div>

      <OfflineBanner isOffline={isOffline} />

      {lastSuccess && <SuccessFlash message={lastSuccess} onDone={() => setLastSuccess(null)} />}

      {state.screen === "buyer" && (
        <BuyerSelect
          buyers={buyers}
          onSelect={handleBuyerSelect}
          error={catalogError}
          lastOrder={lastOrder}
          onRepeat={handleRepeat}
          buyerNoun={settings.buyerNoun}
        />
      )}

      {state.screen === "category" && state.buyer !== null && state.buyerLabel !== null && (
        <CategorySelect
          buyerLabel={state.buyerLabel}
          catalog={catalog}
          onSelect={handleCategorySelect}
          onOverview={() => setState((s) => ({ ...s, screen: "overview" }))}
          onPreorder={handlePreorderEntry}
          onMainMenu={reset}
        />
      )}

      {state.screen === "preorder-category" &&
        state.buyer !== null &&
        state.buyerLabel !== null && (
          <PreorderCategorySelect
            buyerLabel={state.buyerLabel}
            categories={preorderCategories}
            orderingAllowed={preorderOrderingAllowed}
            onSelect={handleCategorySelect}
            onViewOrders={() => setState((s) => ({ ...s, screen: "preorder-orders" }))}
            onBack={() => setState((s) => ({ ...s, screen: "category" }))}
          />
        )}

      {state.screen === "item" &&
        state.buyer !== null &&
        state.buyerLabel !== null &&
        state.category !== null && (
          <ItemSelect
            buyerLabel={state.buyerLabel}
            category={state.category}
            onSelect={handleItemSelect}
            onBack={handleBackToCategory}
            locale={settings.locale}
            currency={settings.currency}
          />
        )}

      {state.screen === "confirm" &&
        state.buyer !== null &&
        state.buyerLabel !== null &&
        state.category !== null &&
        state.item !== null && (
          <Confirm
            buyer={state.buyer}
            buyerLabel={state.buyerLabel}
            item={state.item}
            isPreorder={state.category.preorder}
            noDeliveryDays={noDeliveryDays}
            onConfirm={handleConfirm}
            onBack={() => setState((s) => ({ ...s, item: null, screen: "item" }))}
            isSending={isSending}
            error={confirmError}
            onErrorDismiss={() => setConfirmError(null)}
            locale={settings.locale}
            currency={settings.currency}
          />
        )}

      {state.screen === "overview" && state.buyer !== null && (
        <ConsumptionOverview
          buyer={state.buyer}
          onBack={() => setState((s) => ({ ...s, screen: "category" }))}
          locale={settings.locale}
          currency={settings.currency}
        />
      )}

      {state.screen === "preorder-orders" && state.buyer !== null && (
        <PreorderOrdersOverview
          buyer={state.buyer}
          preorderNames={preorderNames}
          noDeliveryDays={noDeliveryDays}
          onBack={() =>
            setState((s) => ({
              ...s,
              screen: state.category ? ("preorder-category" as Screen) : "category",
            }))
          }
          locale={settings.locale}
        />
      )}
    </div>
  );
}
