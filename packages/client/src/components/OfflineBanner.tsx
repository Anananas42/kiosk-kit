import { useSyncExternalStore } from 'react';
import { getPendingCount, subscribePendingCount } from '../utils/submitQueue.js';

export default function OfflineBanner({ isOffline }: { isOffline: boolean }) {
  const pending = useSyncExternalStore(subscribePendingCount, getPendingCount);

  if (!isOffline && pending === 0) return null;

  return (
    <div className="offline-banner">
      {isOffline && 'Offline'}
      {isOffline && pending > 0 && ' — '}
      {pending > 0 && `${pending} ${pending === 1 ? 'záznam čeká' : 'záznamů čeká'} na odeslání`}
    </div>
  );
}
