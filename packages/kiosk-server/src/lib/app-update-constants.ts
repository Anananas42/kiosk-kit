/** Centralized constants for the app-update subsystem (upload route + service layer). */

export const APP_UPDATE_STATE_DIR = "/data/app-update";
export const APP_UPDATE_STATE_FILE = "/data/app-update/state.json";
export const APP_UPDATE_PENDING_DIR = "/data/app-update/pending";
export const APP_UPDATE_PROGRESS_FILE = "/data/app-update/pending/progress.json";
export const APP_UPDATE_VERSION_FILE = "/data/app-update/pending/version";

// Must match the sudoers rule in deploy/pi/ansible/roles/kioskkit/templates/sudoers-app-update.j2
export const APP_UPDATE_BUNDLE_FILE = "/data/app-update/pending/app-bundle.tar.gz";

export const APP_VERSION_FILE = "/etc/kioskkit/version";
export const APP_PKG_VERSION_FILE = "/opt/kioskkit/current/package.json";
export const APP_RELEASES_DIR = "/opt/kioskkit/releases";

export const MAX_BUNDLE_SIZE = 500 * 1024 * 1024; // 500 MB
