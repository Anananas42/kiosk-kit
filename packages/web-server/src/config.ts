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

/** Timeout for fetching app bundle release assets from GitHub. */
export const APP_FETCH_TIMEOUT_MS = 120_000;

/** Timeout for pushing an app bundle update to a device. */
export const APP_PUSH_TIMEOUT_MS = 300_000;

/** Timeout for proxying OTA manifest/binary requests from devices. */
export const OTA_PROXY_TIMEOUT_MS = 60_000;

// ── Intervals ────────────────────────────────────────────────────────

/** How often to poll for devices that are due for backup. */
export const BACKUP_POLL_INTERVAL_MS = 30 * 60 * 1000;

/** How often to clean up stale device operations. */
export const STALE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ── Sessions ─────────────────────────────────────────────────────────

/** How long a session token remains valid. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Extend the session if less than this much time remains. */
export const SESSION_EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

// ── Limits ───────────────────────────────────────────────────────────

/** Maximum number of backups retained per device. */
export const MAX_RETAINED_BACKUPS = 30;

// ── Stale operation thresholds ──────────────────────────────────────

/** How long a backup operation can be in_progress before it's considered stale. */
export const BACKUP_STALE_OP_MS = 5 * 60 * 1000;

/** How long a restore operation can be in_progress before it's considered stale. */
export const RESTORE_STALE_OP_MS = 5 * 60 * 1000;

/** How long an OTA/app update operation can be in_progress before it's considered stale. */
export const UPDATE_STALE_OP_MS = 15 * 60 * 1000;

// ── Device network ───────────────────────────────────────────────────

/** Port kiosk-server listens on. */
export const DEVICE_PORT = 3001;
