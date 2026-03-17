import { SYNC_INTERVAL_MS } from '@zahumny/shared';
import type { QueueStore } from './store.js';
import { appendRow, getItemBalance } from '../sheets/evidence.js';
import { markReportsDirty } from '../reports.js';

export function startSyncInterval(queue: QueueStore, onStatusChange: (online: boolean) => void): void {
  setInterval(async () => {
    const entries = queue.getAll();
    if (entries.length === 0) return;

    const successIds: string[] = [];

    for (const entry of entries) {
      try {
        // Validate balance on flush for removals
        if (entry.count < 0) {
          const remaining = entries.filter(e => !successIds.includes(e.id) && e.id !== entry.id);
          const balance = await getItemBalance(entry.buyer, entry.item, remaining, entry.itemId);
          if (balance + entry.count < 0) {
            console.log(`[sync] Skipping ${entry.id}: insufficient balance (${balance} + ${entry.count} < 0)`);
            successIds.push(entry.id); // Remove invalid entries from queue
            continue;
          }
        }

        await appendRow(entry);
        successIds.push(entry.id);
      } catch (err) {
        console.error(`[sync] Failed for ${entry.id}:`, (err as Error).message);
        onStatusChange(false);
        break; // Stop trying if Sheets is down
      }
    }

    if (successIds.length > 0) {
      queue.remove(successIds);
      onStatusChange(true);
      markReportsDirty();
      console.log(`[sync] Flushed ${successIds.length}/${entries.length} entries`);
    }
  }, SYNC_INTERVAL_MS);
}
