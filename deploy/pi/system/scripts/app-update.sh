#!/usr/bin/env bash
# app-update.sh — Extract a pre-built app bundle, swap it into place, and restart the service.
#
# Usage: app-update.sh <tarball-path>
#
# Uses symlink-based atomic swap:
#   /opt/kioskkit/releases/<timestamp>/  — extracted app bundle
#   /opt/kioskkit/current -> releases/<timestamp>  — atomic symlink swap
#
# The tarball contains a pre-built bundle with fully resolved node_modules
# (production deps only, native modules cross-compiled for arm64).
# No pnpm install or build step needed on-device.

set -euo pipefail

DATA_DIR="/data/app-update"
STATE_FILE="$DATA_DIR/state.json"
INSTALL_DIR="/opt/kioskkit"
RELEASES_DIR="$INSTALL_DIR/releases"
VERSION_FILE="/etc/kioskkit/version"
HEALTH_URL="http://localhost:3001/api/health"
HEALTH_TIMEOUT=60
POLL_INTERVAL=2

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

# --- Record current release for rollback ---

PREVIOUS_RELEASE=""
if [[ -L "$INSTALL_DIR/current" ]]; then
  PREVIOUS_RELEASE=$(readlink -f "$INSTALL_DIR/current")
fi

# --- Extract to new release directory ---

RELEASE_TS=$(date +%s)
NEW_RELEASE="$RELEASES_DIR/$RELEASE_TS"

mkdir -p "$RELEASES_DIR"
rm -rf "$NEW_RELEASE"
mkdir -p "$NEW_RELEASE"

log "Extracting tarball to $NEW_RELEASE..."
tar -xzf "$TARBALL" -C "$NEW_RELEASE"

# --- Fix ownership ---

KIOSK_USER="${KIOSKKIT_USER:-kiosk}"
log "Setting ownership to $KIOSK_USER..."
chown -R "$KIOSK_USER:$KIOSK_USER" "$NEW_RELEASE"

# --- Create data symlink inside release (for cwd-relative access) ---

ln -sfn "$INSTALL_DIR/data" "$NEW_RELEASE/data"

# --- Atomic symlink swap ---

log "Swapping current symlink to $NEW_RELEASE..."
ln -sfn "releases/$RELEASE_TS" "$INSTALL_DIR/current.tmp"
mv -T "$INSTALL_DIR/current.tmp" "$INSTALL_DIR/current"

# --- Clear Chromium cache ---

log "Clearing Chromium cache..."
rm -rf "/home/$KIOSK_USER/.cache/chromium"

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

  # Read version from the pending metadata
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

  # Clean up old releases (keep current + previous only)
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" && "$PREVIOUS_RELEASE" != "$NEW_RELEASE" ]]; then
    # Remove any release that isn't current or previous
    for dir in "$RELEASES_DIR"/*/; do
      dir="${dir%/}"
      if [[ "$dir" != "$NEW_RELEASE" && "$dir" != "$PREVIOUS_RELEASE" ]]; then
        log "Removing old release: $dir"
        rm -rf "$dir"
      fi
    done
  fi

  write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"success\"}"

  log "App update complete."
  exit 0
else
  log "Health check FAILED — rolling back..."

  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    # Atomic swap back to previous release
    local_relative=$(basename "$PREVIOUS_RELEASE")
    ln -sfn "releases/$local_relative" "$INSTALL_DIR/current.tmp"
    mv -T "$INSTALL_DIR/current.tmp" "$INSTALL_DIR/current"

    # Remove failed release
    rm -rf "$NEW_RELEASE"
  fi

  systemctl restart kioskkit.service

  write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"failed_health_check\"}"

  log "Rolled back to previous version."
  exit 1
fi
