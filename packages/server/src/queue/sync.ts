import { PASTRY_CATEGORIES } from '@zahumny/shared';
import type { QueueStore } from './store.js';
import { appendRow, getItemBalance } from '../sheets/evidence.js';
import { updatePastrySheet } from '../sheets/pastry.js';

export function startSyncInterval(queue: QueueStore, onStatusChange: (online: boolean) => void): void {
  setInterval(async () => {
    const entries = queue.getAll();
    if (entries.length === 0) return;

    const successIds: string[] = [];
    let hasPastry = false;

    for (const entry of entries) {
      try {
        // Validate balance on flush for removals
        if (entry.delta < 0) {
          const remaining = entries.filter(e => !successIds.includes(e.id));
          const balance = await getItemBalance(entry.buyer, entry.item, entry.quantity, remaining);
          const m = entry.quantity.match(/^(\d+) ks$/);
          const required = m ? Number(m[1]) : 1;
          if (balance < required) {
            console.log(`[sync] Skipping ${entry.id}: insufficient balance (${balance} < ${required})`);
            successIds.push(entry.id); // Remove invalid entries from queue
            continue;
          }
        }

        await appendRow(entry);
        successIds.push(entry.id);
        if (PASTRY_CATEGORIES.has(entry.category)) hasPastry = true;
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
      }
    }
  }, 30_000);
}
