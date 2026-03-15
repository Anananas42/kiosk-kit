import { SYNC_INTERVAL_MS } from '@zahumny/shared';
import type { QueueStore } from './store.js';
import { appendRow, getItemBalance } from '../sheets/evidence.js';
import { getPastryCategories } from '../sheets/catalog.js';
import { updatePastrySheet, updatePastryDaySheets } from '../sheets/pastry.js';

export function startSyncInterval(queue: QueueStore, onStatusChange: (online: boolean) => void): void {
  setInterval(async () => {
    const entries = queue.getAll();
    if (entries.length === 0) return;

    const successIds: string[] = [];
    let hasPastry = false;
    let pastryNames: Set<string> | null = null;

    for (const entry of entries) {
      try {
        // Validate balance on flush for removals
        if (entry.count < 0) {
          const remaining = entries.filter(e => !successIds.includes(e.id));
          const balance = await getItemBalance(entry.buyer, entry.item, remaining);
          if (balance + entry.count < 0) {
            console.log(`[sync] Skipping ${entry.id}: insufficient balance (${balance} + ${entry.count} < 0)`);
            successIds.push(entry.id); // Remove invalid entries from queue
            continue;
          }
        }

        await appendRow(entry);
        successIds.push(entry.id);

        if (!pastryNames) pastryNames = await getPastryCategories();
        if (pastryNames.has(entry.category)) hasPastry = true;
      } catch (err) {
        console.error(`[sync] Failed for ${entry.id}:`, (err as Error).message);
        onStatusChange(false);
        break; // Stop trying if Sheets is down
      }
    }

    if (successIds.length > 0) {
      queue.remove(successIds);
      onStatusChange(true);
      console.log(`[sync] Flushed ${successIds.length}/${entries.length} entries`);

      if (hasPastry) {
        try {
          await updatePastrySheet();
        } catch (err) {
          console.error('[sync] Pastry sheet update failed:', (err as Error).message);
        }
        try {
          await updatePastryDaySheets();
        } catch (err) {
          console.error('[sync] Pastry day sheets update failed:', err);
        }
      }
    }
  }, SYNC_INTERVAL_MS);
}
