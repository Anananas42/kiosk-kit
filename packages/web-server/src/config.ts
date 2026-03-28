// ── Timeouts (ms) ────────────────────────────────────────────────────

/** Default timeout for lightweight device requests (health, pairing). */
export const DEVICE_TIMEOUT_MS = 5_000;

/** Timeout for proxied device requests (settings, catalog, etc.). */
export const PROXY_TIMEOUT_MS = 10_000;

/** Timeout for fetching backup snapshots from devices. */
export const BACKUP_FETCH_TIMEOUT_MS = 60_000;

/** Timeout for restoring a backup to a device. */
export const RESTORE_TIMEOUT_MS = 60_000;

/** Timeout for fetching OTA release assets from GitHub. */
export const OTA_FETCH_TIMEOUT_MS = 120_000;

/** Timeout for pushing an OTA update to a device. */
export const OTA_PUSH_TIMEOUT_MS = 300_000;

/** Timeout for proxying OTA manifest/binary requests from devices. */
export const OTA_PROXY_TIMEOUT_MS = 60_000;

// ── Intervals ────────────────────────────────────────────────────────

/** How often to pull backups from all devices. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ── Sessions ─────────────────────────────────────────────────────────

/** How long a session token remains valid. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Extend the session if less than this much time remains. */
export const SESSION_EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

// ── Limits ───────────────────────────────────────────────────────────

/** Maximum number of backups retained per device. */
export const MAX_RETAINED_BACKUPS = 30;

// ── Device network ───────────────────────────────────────────────────

/** Port kiosk-server listens on. */
export const DEVICE_PORT = 3001;
