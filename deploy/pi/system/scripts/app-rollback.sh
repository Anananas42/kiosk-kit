#!/usr/bin/env bash
# app-rollback.sh — Restore the previous app version from rollback and restart the service.
#
# Usage: app-rollback.sh

set -euo pipefail

INSTALL_DIR="/opt/kioskkit"
ROLLBACK_DIR="$INSTALL_DIR/.rollback"
DATA_DIR="/data/app-update"
STATE_FILE="$DATA_DIR/state.json"

# Files/dirs that are part of the app bundle
APP_PARTS=(packages node_modules package.json pnpm-workspace.yaml pnpm-lock.yaml)

log() { echo "[app-rollback] $*"; }

write_state() {
  local tmp
  tmp=$(mktemp "$DATA_DIR/.state.XXXXXX")
  echo "$1" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

if [[ ! -d "$ROLLBACK_DIR" ]]; then
  log "ERROR: No rollback directory found at $ROLLBACK_DIR"
  exit 1
fi

log "Swapping rollback back into place..."

for part in "${APP_PARTS[@]}"; do
  rm -rf "${INSTALL_DIR:?}/$part"
  if [[ -e "$ROLLBACK_DIR/$part" ]]; then
    mv "$ROLLBACK_DIR/$part" "$INSTALL_DIR/$part"
  fi
done

rm -rf "$ROLLBACK_DIR"

log "Restarting kioskkit.service..."
systemctl restart kioskkit.service

write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"success\"}"

log "Rollback complete."
exit 0
