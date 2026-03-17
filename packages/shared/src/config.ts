// ---------------------------------------------------------------------------
// Centralized timing & behavioral constants for the kiosk app.
//
// System-level constants (sway, display-sleep.py) live in their own files
// under system/config/ — see comments there for display-off timeout (15 min)
// and wake-touch grab hold (1.5s).
// ---------------------------------------------------------------------------

// --- Display & idle ---

// Dark overlay appears after this much inactivity (CSS fade-in: 1s)
export const IDLE_DIM_MS = 15_000;

// Default settings — used when [Nastavení] sheet is missing or unreadable
import type { KioskSettings } from './types.js';
export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  idleDimMs: IDLE_DIM_MS,
};

// --- Session reset ---

// Total inactivity before the app resets to the home screen
export const INACTIVITY_TIMEOUT_MS = 60_000;

// Countdown warning shown before reset (subtracted from INACTIVITY_TIMEOUT_MS)
export const INACTIVITY_WARNING_MS = 10_000;

// --- Order flow ---

// How long the "repeat last order" shortcut stays available after a purchase
export const REPEAT_ORDER_MS = 10_000;

// How long the success confirmation message is shown
export const SUCCESS_FLASH_MS = 1_500;

// --- Polling & sync ---

// Server health check interval (drives the offline banner)
export const HEALTH_CHECK_INTERVAL_MS = 15_000;

// How often the client reloads catalog data from the server
export const CATALOG_RELOAD_INTERVAL_MS = 5 * 60_000;

// Client-side submit queue flush interval (offline-first record submission)
export const SUBMIT_FLUSH_INTERVAL_MS = 30_000;

// Server-side queue sync interval (pending records → Google Sheets)
export const SYNC_INTERVAL_MS = 30_000;

// --- Server ---

// Google Sheets API request timeout
export const SHEETS_API_TIMEOUT_MS = 10_000;

// Server-side evidence records cache TTL
export const RECORDS_CACHE_TTL_MS = 5_000;

// --- Backups ---

// How often to back up all sheet data to local filesystem
export const BACKUP_INTERVAL_MS = 60 * 60_000; // 1 hour

// Maximum total size of backup files on disk
export const BACKUP_MAX_BYTES = 8 * 1024 ** 3; // 8 GB
