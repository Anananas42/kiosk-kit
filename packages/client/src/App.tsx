import { useState, useCallback, useEffect } from 'react';
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
import ItemSelect from './screens/ItemSelect.js';
import QuantitySelect from './screens/QuantitySelect.js';
import Confirm from './screens/Confirm.js';
import ConsumptionOverview from './screens/ConsumptionOverview.js';
import PastryOrdersOverview from './screens/PastryOrdersOverview.js';

type Screen = 'buyer' | 'category' | 'item' | 'quantity' | 'confirm' | 'overview' | 'pastry-orders';

interface AppState {
  screen: Screen;
  buyer: number | null;
  category: CatalogCategory | null;
  item: CatalogItem | null;
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
  const [pendingOperation, setPendingOperation] = useState<'+' | '-' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const isOffline = useHealth();
  const { catalog, apartments, reload, error: catalogError } = useCatalog();

  useEffect(() => { startFlushTimer(); }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setPendingOperation(null);
    setConfirmError(null);
    reload();
  }, [reload]);

  useInactivityReset(state.screen !== 'buyer', reset);

  const handleBuyerSelect = useCallback((buyer: number) => {
    setState((s) => ({ ...s, buyer, screen: 'category' }));
  }, []);

  const handleCategorySelect = useCallback((category: CatalogCategory) => {
    setState((s) => ({ ...s, category, screen: 'item' }));
  }, []);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    const nextScreen: Screen = PASTRY_CATEGORIES.has(state.category!.name) ? 'quantity' : 'confirm';
    setState((s) => ({ ...s, item, screen: nextScreen }));
  }, [state.category]);

  const handleQuantitySelect = useCallback((qty: number) => {
    setState((s) => {
      const unitPrice = parsePrice(s.item!.price);
      let newPrice = s.item!.price;
      if (unitPrice) {
        const total = Math.round(unitPrice * qty * 100) / 100;
        newPrice = formatPrice(total);
      }
      return { ...s, item: { ...s.item!, quantity: `${qty} ks`, price: newPrice }, screen: 'confirm' };
    });
  }, []);

  const handleBackToCategory = useCallback(() => {
    setState((s) => ({ ...s, item: null, category: null, screen: 'category' }));
  }, []);

  const handleBackFromConfirm = useCallback(() => {
    setState((s) => {
      if (s.item && s.category && PASTRY_CATEGORIES.has(s.category.name)) {
        return { ...s, screen: 'quantity' };
      }
      return { ...s, screen: 'item' };
    });
  }, []);

  const handleConfirm = useCallback(async (operation: '+' | '-') => {
    const recordData = {
      buyer: state.buyer!,
      delta: (operation === '+' ? 1 : -1) as 1 | -1,
      category: state.category!.name,
      item: state.item!.name,
      quantity: state.item!.quantity,
      price: state.item!.price,
    };

    if (operation === '+') {
      // Optimistic: enqueue and show success immediately
      enqueueRecord(recordData);
      setLastSuccess(`Záznam přidán: ${state.item!.name}`);
      reset();
      return;
    }

    // Synchronous for remove — needs server-side balance validation
    setPendingOperation(operation);
    setConfirmError(null);
    setIsSending(true);
    try {
      const result = await postRecord(recordData);
      if (result.error === 'insufficient_balance') {
        setConfirmError(`Kupující #${state.buyer} dosud neodebral žádný „${state.item!.name}" — nelze stornovat.`);
      } else {
        setLastSuccess(`Storno: ${state.item!.name}`);
        reset();
      }
    } catch (err) {
      console.error('Record error:', err);
      setConfirmError('Chyba sítě — zkuste to znovu.');
    } finally {
      setIsSending(false);
    }
  }, [state, reset]);

  return (
    <div className="app">
      <OfflineBanner isOffline={isOffline} />

      {lastSuccess && (
        <SuccessFlash message={lastSuccess} onDone={() => setLastSuccess(null)} />
      )}

      {state.screen === 'buyer' && (
        <BuyerSelect apartments={apartments} onSelect={handleBuyerSelect} error={catalogError} />
      )}

      {state.screen === 'category' && state.buyer !== null && (
        <CategorySelect
          buyer={state.buyer}
          catalog={catalog}
          onSelect={handleCategorySelect}
          onOverview={() => setState((s) => ({ ...s, screen: 'overview' }))}
          onPastryOrders={() => setState((s) => ({ ...s, screen: 'pastry-orders' }))}
          onMainMenu={reset}
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

      {state.screen === 'quantity' && state.buyer !== null && state.category !== null && state.item !== null && (
        <QuantitySelect
          buyer={state.buyer}
          category={state.category}
          item={state.item}
          onSelect={handleQuantitySelect}
          onBack={() => setState((s) => ({ ...s, item: null, screen: 'item' }))}
        />
      )}

      {state.screen === 'confirm' && state.buyer !== null && state.category !== null && state.item !== null && (
        <Confirm
          buyer={state.buyer}
          category={state.category}
          item={state.item}
          onConfirm={handleConfirm}
          onBack={handleBackFromConfirm}
          isSending={isSending}
          pendingOperation={pendingOperation}
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
          onBack={() => setState((s) => ({ ...s, screen: 'category' }))}
        />
      )}
    </div>
  );
}
