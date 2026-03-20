// ---------------------------------------------------------------------------
// Centralized timing & behavioral constants for the kiosk app.
//
// System-level constants (sway, display-sleep.py) live in their own files
// under system/config/ — see comments there for display-off timeout (45 min)
// and wake-touch grab hold (1.5s).
// ---------------------------------------------------------------------------

// --- Timezone ---

export const TZ: string =
  (typeof globalThis !== "undefined" && "process" in globalThis
    ? (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process
        .env.KIOSK_TZ
    : undefined) ?? "Europe/Prague";

// --- Display & idle ---

// Dark overlay appears after this much inactivity (CSS fade-in: 1s)
export const IDLE_DIM_MS = 15_000;

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

// --- Default kiosk settings ---

import type { KioskSettings, PreorderConfig } from "./types.js";

export const DEFAULT_PREORDER_CONFIG: PreorderConfig = {
  orderingDays: Array(7).fill(true),
  deliveryDays: Array(7).fill(true),
};

export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  idleDimMs: IDLE_DIM_MS,
  inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS,
  maintenance: false,
  locale: "cs",
  currency: "CZK",
  buyerNoun: "apartmán",
};
