#!/usr/bin/env bash
# boot-confirm.sh — Confirm a successful boot after an OTA update.
#
# On tryboot (Pi: kernel cmdline, QEMU: pending-confirm file):
#   - Polls the kiosk health endpoint for up to 5 minutes
#   - If healthy: promotes the new slot as committed
#   - If unhealthy: reboots to fall back to the previous slot
#
# On normal boot: exits immediately (nothing to confirm).

set -euo pipefail

HEALTH_URL="http://localhost:3001/api/health"
HEALTH_TIMEOUT=300  # 5 minutes — generous for slow Pi boot + app startup
POLL_INTERVAL=5

DATA_DIR="/data/ota"
BOOT_SLOT_FILE="$DATA_DIR/boot-slot"
STATE_FILE="$DATA_DIR/state.json"

log() { echo "[boot-confirm] $*"; }

# --- Detect tryboot mode ---

is_tryboot() {
  # Real Pi: kernel cmdline contains "tryboot" flag
  if grep -q "tryboot" /proc/cmdline 2>/dev/null; then
    return 0
  fi
  # QEMU: initrd writes a pending-confirm marker
  if [[ -f "$DATA_DIR/pending-confirm" ]]; then
    return 0
  fi
  return 1
}

if ! is_tryboot; then
  log "Normal boot — nothing to confirm."
  exit 0
fi

log "Tryboot detected — polling health endpoint for up to ${HEALTH_TIMEOUT}s..."

# --- Poll health endpoint ---

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

# --- Act on result ---

if [[ "$healthy" == "true" ]]; then
  log "Health check passed — promoting new slot."

  # Read current boot slot
  current_slot="A"
  if [[ -f "$BOOT_SLOT_FILE" ]]; then
    current_slot=$(cat "$BOOT_SLOT_FILE")
  fi

  # On real Pi, update cmdline.txt to commit the new slot
  if [[ -d /boot/firmware ]]; then
    # Copy tryboot cmdline to committed cmdline
    if [[ -f /boot/firmware/cmdline-tryboot.txt ]]; then
      cp /boot/firmware/cmdline-tryboot.txt /boot/firmware/cmdline.txt
      log "Updated cmdline.txt from tryboot config."
    fi
  fi

  # Update persistent boot-slot file
  echo "$current_slot" > "$BOOT_SLOT_FILE"

  # Update OTA state
  cat > "$STATE_FILE" <<EOF
{"status":"idle","slot":"${current_slot}","last_update":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","last_result":"success"}
EOF

  # Clean up tryboot markers
  rm -f "$DATA_DIR/pending-confirm"

  log "Slot $current_slot confirmed as committed."
else
  log "Health check FAILED after ${HEALTH_TIMEOUT}s — rebooting to fall back."

  # Update OTA state to record failure
  current_slot="A"
  [[ -f "$BOOT_SLOT_FILE" ]] && current_slot=$(cat "$BOOT_SLOT_FILE")
  cat > "$STATE_FILE" <<EOF
{"status":"idle","slot":"${current_slot}","last_update":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","last_result":"rollback"}
EOF

  # Clean up tryboot markers so fallback boot is normal
  rm -f "$DATA_DIR/pending-confirm"

  # Reboot — without tryboot flag, firmware loads committed cmdline.txt (old slot)
  reboot
fi
