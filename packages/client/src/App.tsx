import { useState, useCallback, useEffect, useRef } from 'react';
import { PASTRY_CATEGORIES, parsePrice, formatPrice, type CatalogCategory, type CatalogItem } from '@zahumny/shared';
import { postRecord } from './api.js';
import { useHealth } from './hooks/useHealth.js';
import { useCatalog } from './hooks/useCatalog.js';
import { useInactivityReset } from './hooks/useInactivityReset.js';
import { enqueueRecord, startFlushTimer } from './utils/submitQueue.js';
import OfflineBanner from './components/OfflineBanner.js';
import SuccessFlash from './components/SuccessFlash.js';
import BuyerSelect from './screens/BuyerSelect.js';
import CategorySelect from './screens/CategorySelect.js';
import PastryCategorySelect from './screens/PastryCategorySelect.js';
import ItemSelect from './screens/ItemSelect.js';
import Confirm from './screens/Confirm.js';
import ConsumptionOverview from './screens/ConsumptionOverview.js';
import PastryOrdersOverview from './screens/PastryOrdersOverview.js';

type Screen = 'buyer' | 'category' | 'pastry-category' | 'item' | 'confirm' | 'overview' | 'pastry-orders';

interface AppState {
  screen: Screen;
  buyer: number | null;
  category: CatalogCategory | null;
  item: CatalogItem | null;
}

interface LastOrder {
  buyer: number;
  category: CatalogCategory;
  item: CatalogItem;
}

const INITIAL_STATE: AppState = {
  screen: 'buyer',
  buyer: null,
  category: null,
  item: null,
};

const REPEAT_TIMEOUT = 10_000;

export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isSending, setIsSending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout>>();

  const isOffline = useHealth();
  const { catalog, apartments, reload, error: catalogError } = useCatalog();

  const pastryCategories = catalog.filter((cat) => PASTRY_CATEGORIES.has(cat.name));

  useEffect(() => { startFlushTimer(); }, []);

  useEffect(() => {
    if (!lastOrder) return;
    clearTimeout(repeatTimer.current);
    repeatTimer.current = setTimeout(() => setLastOrder(null), REPEAT_TIMEOUT);
    return () => clearTimeout(repeatTimer.current);
  }, [lastOrder]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setConfirmError(null);
    reload();
  }, [reload]);

  const { secondsLeft, dismiss: dismissWarning } = useInactivityReset(state.screen !== 'buyer', reset);

  const handleBuyerSelect = useCallback((buyer: number) => {
    setState((s) => ({ ...s, buyer, screen: 'category' }));
  }, []);

  const handleCategorySelect = useCallback((category: CatalogCategory) => {
    setState((s) => ({ ...s, category, screen: 'item' }));
  }, []);

  const handlePastryEntry = useCallback(() => {
    // If only one pastry category, skip straight to items
    if (pastryCategories.length === 1) {
      setState((s) => ({ ...s, category: pastryCategories[0], screen: 'item' }));
    } else {
      setState((s) => ({ ...s, screen: 'pastry-category' }));
    }
  }, [pastryCategories]);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    setConfirmError(null);
    setState((s) => ({ ...s, item, screen: 'confirm' }));
  }, []);

  const handleBackToCategory = useCallback(() => {
    setState((s) => ({ ...s, item: null, category: null, screen: 'category' }));
  }, []);

  const handleRepeat = useCallback(() => {
    if (!lastOrder) return;
    setConfirmError(null);
    setState({
      screen: 'confirm',
      buyer: lastOrder.buyer,
      category: lastOrder.category,
      item: lastOrder.item,
    });
  }, [lastOrder]);

  const handleConfirm = useCallback(async (operation: '+' | '-', quantity: number) => {
    const isPastry = PASTRY_CATEGORIES.has(state.category!.name);
    const unitPrice = parsePrice(state.item!.price);

    const qtyStr = isPastry ? `${quantity} ks` : state.item!.quantity;
    let priceStr = state.item!.price;
    if (isPastry && unitPrice) {
      const total = Math.round(unitPrice * quantity * 100) / 100;
      priceStr = formatPrice(total);
    }

    const recordData = {
      buyer: state.buyer!,
      delta: (operation === '+' ? 1 : -1) as 1 | -1,
      category: state.category!.name,
      item: state.item!.name,
      quantity: qtyStr,
      price: priceStr,
    };

    if (operation === '+') {
      enqueueRecord(recordData);
      const label = isPastry
        ? `${quantity}\u00d7 ${state.item!.name}`
        : state.item!.name;
      setLastSuccess(`Přidáno: ${label}`);
      setLastOrder({
        buyer: state.buyer!,
        category: state.category!,
        item: state.item!,
      });
      reset();
      return;
    }

    setConfirmError(null);
    setIsSending(true);
    try {
      const result = await postRecord(recordData);
      if (result.error === 'insufficient_balance') {
        setConfirmError(`Kupující #${state.buyer} nemá žádný „${state.item!.name}" k odebrání.`);
      } else {
        setLastSuccess(`Odebráno: ${state.item!.name}`);
        reset();
      }
    } catch (err) {
      console.error('Record error:', err);
      setConfirmError('Připojení selhalo. Zkuste to znovu.');
    } finally {
      setIsSending(false);
    }
  }, [state, reset]);

  return (
    <div className="app">
      <div className="toast-layer">
        {secondsLeft !== null && (
          <div className="inactivity-warning" onClick={dismissWarning}>
            Neaktivita — resetuji za {secondsLeft}s &middot; <strong>Klepněte pro pokračování</strong>
          </div>
        )}
      </div>

      <OfflineBanner isOffline={isOffline} />

      {lastSuccess && (
        <SuccessFlash message={lastSuccess} onDone={() => setLastSuccess(null)} />
      )}

      {state.screen === 'buyer' && (
        <BuyerSelect
          apartments={apartments}
          onSelect={handleBuyerSelect}
          error={catalogError}
          lastOrder={lastOrder}
          onRepeat={handleRepeat}
        />
      )}

      {state.screen === 'category' && state.buyer !== null && (
        <CategorySelect
          buyer={state.buyer}
          catalog={catalog}
          onSelect={handleCategorySelect}
          onOverview={() => setState((s) => ({ ...s, screen: 'overview' }))}
          onPastry={handlePastryEntry}
          onMainMenu={reset}
        />
      )}

      {state.screen === 'pastry-category' && state.buyer !== null && (
        <PastryCategorySelect
          buyer={state.buyer}
          categories={pastryCategories}
          onSelect={handleCategorySelect}
          onViewOrders={() => setState((s) => ({ ...s, screen: 'pastry-orders' }))}
          onBack={() => setState((s) => ({ ...s, screen: 'category' }))}
        />
      )}

      {state.screen === 'item' && state.buyer !== null && state.category !== null && (
        <ItemSelect
          buyer={state.buyer}
          category={state.category}
          onSelect={handleItemSelect}
          onBack={handleBackToCategory}
        />
      )}

      {state.screen === 'confirm' && state.buyer !== null && state.category !== null && state.item !== null && (
        <Confirm
          buyer={state.buyer}
          category={state.category}
          item={state.item}
          isPastry={PASTRY_CATEGORIES.has(state.category.name)}
          onConfirm={handleConfirm}
          onBack={() => setState((s) => ({ ...s, item: null, screen: 'item' }))}
          isSending={isSending}
          error={confirmError}
          onErrorDismiss={() => setConfirmError(null)}
        />
      )}

      {state.screen === 'overview' && state.buyer !== null && (
        <ConsumptionOverview
          buyer={state.buyer}
          onBack={() => setState((s) => ({ ...s, screen: 'category' }))}
        />
      )}

      {state.screen === 'pastry-orders' && state.buyer !== null && (
        <PastryOrdersOverview
          buyer={state.buyer}
          onBack={() => setState((s) => ({ ...s, screen: state.category ? 'pastry-category' as Screen : 'category' }))}
        />
      )}
    </div>
  );
}
