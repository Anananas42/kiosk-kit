import { DEFAULT_KIOSK_SETTINGS } from '@zahumny/shared';
import type { CacheStore } from './cache/store.js';
import { updatePastrySheet, updatePastryDaySheets } from './sheets/pastry.js';
import { updateConsumptionSheet } from './sheets/consumption.js';

let dirty = false;

/** Mark report sheets as needing regeneration on the next interval tick. */
export function markReportsDirty(): void {
  dirty = true;
}

/**
 * Start the periodic report update loop.
 * Reads reportUpdateIntervalMs from cached settings, falling back to 1 minute.
 * Only runs updates when data has changed (dirty flag set by record/sync paths).
 */
export function startReportInterval(cache: CacheStore): void {
  const tick = async () => {
    if (!dirty) return;
    dirty = false;

    try {
      await updateConsumptionSheet();
    } catch (err) {
      console.error('[reports] Consumption summary update failed:', (err as Error).message);
    }

    try {
      await updatePastrySheet();
    } catch (err) {
      console.error('[reports] Pastry overview update failed:', (err as Error).message);
    }

    try {
      await updatePastryDaySheets();
    } catch (err) {
      console.error('[reports] Pastry day sheets update failed:', (err as Error).message);
    }
  };

  const schedule = () => {
    const intervalMs = cache.getSettings()?.reportUpdateIntervalMs
      ?? DEFAULT_KIOSK_SETTINGS.reportUpdateIntervalMs
      ?? 60_000;
    setTimeout(async () => {
      await tick();
      schedule();
    }, intervalMs);
  };

  schedule();
}
