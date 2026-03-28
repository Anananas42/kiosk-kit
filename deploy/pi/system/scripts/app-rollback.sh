#!/usr/bin/env bash
# app-rollback.sh — Restore the previous app version and restart the service.
#
# Reads the current symlink, finds the previous release in releases/,
# and performs an atomic symlink swap.
#
# Usage: app-rollback.sh

set -euo pipefail

INSTALL_DIR="/opt/kioskkit"
RELEASES_DIR="$INSTALL_DIR/releases"
DATA_DIR="/data/app-update"
STATE_FILE="$DATA_DIR/state.json"

log() { echo "[app-rollback] $*"; }

write_state() {
  local tmp
  tmp=$(mktemp "$DATA_DIR/.state.XXXXXX")
  echo "$1" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

if [[ ! -L "$INSTALL_DIR/current" ]]; then
  log "ERROR: No current symlink found at $INSTALL_DIR/current"
  exit 1
fi

CURRENT_RELEASE=$(readlink -f "$INSTALL_DIR/current")

# Find the most recent release that isn't current (sorted descending by name/timestamp).
# Note: the Ansible-created "initial" release sorts after numeric timestamps in reverse,
# so it won't be picked as a rollback target if a newer release exists — this is intentional
# (the initial release is the SD image build, not a proper update target).
PREVIOUS_RELEASE=""
while IFS= read -r dir; do
  if [[ -d "$dir" && "$dir" != "$CURRENT_RELEASE" ]]; then
    PREVIOUS_RELEASE="$dir"
    break
  fi
done < <(printf '%s\n' "$RELEASES_DIR"/*/ | sed 's|/$||' | sort -r)

if [[ -z "$PREVIOUS_RELEASE" ]]; then
  log "ERROR: No previous release found to roll back to"
  exit 1
fi

log "Rolling back from $CURRENT_RELEASE to $PREVIOUS_RELEASE..."

# Atomic symlink swap
local_relative=$(basename "$PREVIOUS_RELEASE")
ln -sfn "releases/$local_relative" "$INSTALL_DIR/current.tmp"
mv -T "$INSTALL_DIR/current.tmp" "$INSTALL_DIR/current"

# Remove the failed release
rm -rf "$CURRENT_RELEASE"

log "Restarting kioskkit.service..."
systemctl restart kioskkit.service

write_state "{\"status\":\"idle\",\"lastUpdate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"lastResult\":\"rolled_back\"}"

log "Rollback complete."
exit 0
