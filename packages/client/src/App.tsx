import { useState, useCallback, useEffect, useRef } from 'react';
import { REPEAT_ORDER_MS, noDeliveryDaysSet, isOrderingAllowed, type CatalogCategory, type CatalogItem } from '@zahumny/shared';
import { postRecord } from './api.js';
import { useHealth } from './hooks/useHealth.js';
import { useCatalog } from './hooks/useCatalog.js';
import { useInactivityReset } from './hooks/useInactivityReset.js';
import { useIdleDim } from './hooks/useIdleDim.js';
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


export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isSending, setIsSending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout>>();

  const isOffline = useHealth();
  const { catalog, apartments, pastryConfig, settings, reload, error: catalogError } = useCatalog();
  const dimmed = useIdleDim(settings.idleDimMs);

  const pastryCategories = catalog.filter((cat) => cat.pastry);
  const pastryNames = new Set(pastryCategories.map((cat) => cat.name));
  const pastryOrderingAllowed = isOrderingAllowed(pastryConfig.orderingDays);
  const noDeliveryDays = noDeliveryDaysSet(pastryConfig.deliveryDays);

  useEffect(() => { startFlushTimer(); }, []);

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

  const { secondsLeft, dismiss: dismissWarning } = useInactivityReset(state.screen !== 'buyer', reset, settings.inactivityTimeoutMs);

  const handleBuyerSelect = useCallback((buyer: number) => {
    setState((s) => ({ ...s, buyer, screen: 'category' }));
  }, []);

  const handleCategorySelect = useCallback((category: CatalogCategory) => {
    setState((s) => ({ ...s, category, screen: 'item' }));
  }, []);

  const handlePastryEntry = useCallback(() => {
    // If ordering disabled or multiple categories, show the pastry category screen
    if (!pastryOrderingAllowed || pastryCategories.length !== 1) {
      setState((s) => ({ ...s, screen: 'pastry-category' }));
    } else {
      setState((s) => ({ ...s, category: pastryCategories[0], screen: 'item' }));
    }
  }, [pastryCategories, pastryOrderingAllowed]);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    setConfirmError(null);
    setState((s) => ({ ...s, item, screen: 'confirm' }));
  }, []);

  const handleBackToCategory = useCallback(() => {
    setState((s) => {
      if (s.category?.pastry) {
        return { ...s, item: null, category: null, screen: 'pastry-category' };
      }
      return { ...s, item: null, category: null, screen: 'category' };
    });
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
    const isPastry = state.category!.pastry;
    const count = operation === '+' ? quantity : -quantity;

    const recordData = {
      buyer: state.buyer!,
      count,
      category: state.category!.name,
      item: state.item!.name,
      itemId: state.item!.id,
      quantity: state.item!.quantity,
      price: state.item!.price,
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
      await postRecord(recordData);
      setLastSuccess(`Odebráno: ${state.item!.name}`);
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'insufficient_balance') {
        setConfirmError(`Kupující #${state.buyer} nemá žádný „${state.item!.name}" k odebrání.`);
      } else {
        console.error('Record error:', err);
        setConfirmError('Připojení selhalo. Zkuste to znovu.');
      }
    } finally {
      setIsSending(false);
    }
  }, [state, reset]);

  if (settings.maintenance) {
    return (
      <div className="app">
        <div className="maintenance-screen">
          <div className="maintenance-screen__icon">🔧</div>
          <div className="maintenance-screen__title">Údržba</div>
          <div className="maintenance-screen__message">Kiosek je dočasně mimo provoz.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {dimmed && <div className="idle-dim" />}
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
          orderingAllowed={pastryOrderingAllowed}
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
          backLabel={state.category.pastry ? 'Zpět na objednat pečivo' : undefined}
        />
      )}

      {state.screen === 'confirm' && state.buyer !== null && state.category !== null && state.item !== null && (
        <Confirm
          buyer={state.buyer}
          category={state.category}
          item={state.item}
          isPastry={state.category.pastry}
          noDeliveryDays={noDeliveryDays}
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
          pastryNames={pastryNames}
          noDeliveryDays={noDeliveryDays}
          onBack={() => setState((s) => ({ ...s, screen: state.category ? 'pastry-category' as Screen : 'category' }))}
        />
      )}
    </div>
  );
}
