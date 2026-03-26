#!/usr/bin/env bash
# ota-download.sh — Download a rootfs image and verify its checksum.
#
# Usage: ota-download.sh <url> <sha256>
#
# Downloads the rootfs image (expected .img.zst) to /data/ota/pending/,
# verifies the sha256 checksum, and exits 0 on success.

set -euo pipefail

DOWNLOAD_DIR="/data/ota/pending"
DOWNLOAD_TIMEOUT=1800  # 30 minutes — generous for large images on slow connections
STATE_FILE="/data/ota/state.json"

log() { echo "[ota-download] $*"; }

# Atomic write: write to temp file then mv to avoid corruption on power loss
write_state() {
  local tmp
  tmp=$(mktemp "$DOWNLOAD_DIR/../.state.XXXXXX")
  echo "$1" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <url> <sha256>" >&2
  exit 1
fi

URL="$1"
EXPECTED_SHA256="$2"
FILENAME=$(basename "$URL")

# Sanitize filename: allow only alphanumeric, dots, hyphens, and underscores
FILENAME=$(echo "$FILENAME" | sed 's/[^a-zA-Z0-9._-]//g')
if [[ -z "$FILENAME" ]]; then
  log "ERROR: URL produced an invalid filename after sanitization."
  exit 1
fi

OUTPUT="$DOWNLOAD_DIR/$FILENAME"

mkdir -p "$DOWNLOAD_DIR"

# Update OTA state
write_state "{\"status\":\"downloading\",\"url\":\"${URL}\",\"started\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

log "Downloading $URL..."
if ! curl -fSL --max-time "$DOWNLOAD_TIMEOUT" --progress-bar -o "$OUTPUT" "$URL"; then
  log "ERROR: Download failed."
  write_state "{\"status\":\"idle\",\"last_update\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_result\":\"download_failed\"}"
  rm -f "$OUTPUT"
  exit 1
fi

log "Verifying sha256 checksum..."
ACTUAL_SHA256=$(sha256sum "$OUTPUT" | cut -d' ' -f1)

if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  log "ERROR: Checksum mismatch!"
  log "  Expected: $EXPECTED_SHA256"
  log "  Actual:   $ACTUAL_SHA256"
  write_state "{\"status\":\"idle\",\"last_update\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_result\":\"checksum_failed\"}"
  rm -f "$OUTPUT"
  exit 1
fi

write_state "{\"status\":\"downloaded\",\"file\":\"${OUTPUT}\",\"sha256\":\"${EXPECTED_SHA256}\",\"downloaded\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

log "Download complete and verified: $OUTPUT"
