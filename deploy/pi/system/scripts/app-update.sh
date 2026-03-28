#!/usr/bin/env bash
# app-update.sh — Extract a pre-built app bundle, swap it into place, and restart the service.
#
# Usage: app-update.sh <tarball-path>
#
# The tarball contains a pre-built bundle with fully resolved node_modules
# (production deps only, native modules cross-compiled for arm64).
# No pnpm install or build step needed on-device.

set -euo pipefail

DATA_DIR="/data/app-update"
STATE_FILE="$DATA_DIR/state.json"
INSTALL_DIR="/opt/kioskkit"
STAGING_DIR="$INSTALL_DIR/.staging"
ROLLBACK_DIR="$INSTALL_DIR/.rollback"
VERSION_FILE="/etc/kioskkit/app-version"
HEALTH_URL="http://localhost:3001/api/health"
HEALTH_TIMEOUT=60
POLL_INTERVAL=2

# Files/dirs that are part of the app bundle
APP_PARTS=(packages node_modules package.json pnpm-workspace.yaml pnpm-lock.yaml)

log() { echo "[app-update] $*"; }

write_state() {
  local tmp
  tmp=$(mktemp "$DATA_DIR/.state.XXXXXX")
  echo "$1" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

# --- Validate arguments ---

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <tarball-path>" >&2
  exit 1
fi

TARBALL="$1"

if [[ ! -f "$TARBALL" ]]; then
  log "ERROR: Tarball not found: $TARBALL"
  exit 1
fi

# --- Extract to staging ---

log "Removing previous staging dir..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

log "Extracting tarball to staging..."
tar -xzf "$TARBALL" -C "$STAGING_DIR" --no-absolute-names

# --- Prepare rollback ---

log "Removing previous rollback dir..."
rm -rf "$ROLLBACK_DIR"
mkdir -p "$ROLLBACK_DIR"

log "Moving current app files to rollback..."
for part in "${APP_PARTS[@]}"; do
  if [[ -e "$INSTALL_DIR/$part" ]]; then
    mv "$INSTALL_DIR/$part" "$ROLLBACK_DIR/$part"
  fi
done

# --- Swap staging into place ---

log "Moving staging contents into place..."
for part in "${APP_PARTS[@]}"; do
  if [[ -e "$STAGING_DIR/$part" ]]; then
    mv "$STAGING_DIR/$part" "$INSTALL_DIR/$part"
  fi
done

rm -rf "$STAGING_DIR"

# --- Clear Chromium cache ---

log "Clearing Chromium cache..."
rm -rf /home/kiosk/.cache/chromium

# --- Restart service ---

log "Restarting kioskkit.service..."
systemctl restart kioskkit.service

# --- Poll health endpoint ---

log "Polling health endpoint for up to ${HEALTH_TIMEOUT}s..."
elapsed=0
healthy=false

while (( elapsed < HEALTH_TIMEOUT )); do
  if curl -sf -o /dev/null --max-time 5 "$HEALTH_URL"; then
    healthy=true
    break
  fi
  sleep "$POLL_INTERVAL"
  elapsed=$(( elapsed + POLL_INTERVAL ))
  log "Health check attempt (${elapsed}s/${HEALTH_TIMEOUT}s)..."
done

if [[ "$healthy" == "true" ]]; then
  log "Health check passed."

  # Read version from the pending metadata or header
  VERSION=""
  if [[ -f "$DATA_DIR/pending/version" ]]; then
    VERSION=$(cat "$DATA_DIR/pending/version")
  fi

  if [[ -n "$VERSION" ]]; then
    mkdir -p "$(dirname "$VERSION_FILE")"
    echo "$VERSION" > "$VERSION_FILE"
    log "Wrote version $VERSION to $VERSION_FILE"
  fi

  # Clean up pending dir
  rm -rf "$DATA_DIR/pending"

  write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"success\"}"

  log "App update complete."
  exit 0
else
  log "Health check FAILED — rolling back..."

  # Remove failed app files
  for part in "${APP_PARTS[@]}"; do
    rm -rf "${INSTALL_DIR:?}/$part"
  done

  # Restore from rollback
  for part in "${APP_PARTS[@]}"; do
    if [[ -e "$ROLLBACK_DIR/$part" ]]; then
      mv "$ROLLBACK_DIR/$part" "$INSTALL_DIR/$part"
    fi
  done

  systemctl restart kioskkit.service

  write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"failed_health_check\"}"

  log "Rolled back to previous version."
  exit 1
fi
