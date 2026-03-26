#!/usr/bin/env bash
# ota-rollback.sh — Swap to the other boot slot and reboot.
#
# Usage: ota-rollback.sh
#
# Reads the current boot slot, switches to the other one, and reboots.

set -euo pipefail

DATA_DIR="/data/ota"
BOOT_SLOT_FILE="$DATA_DIR/boot-slot"
STATE_FILE="$DATA_DIR/state.json"

log() { echo "[ota-rollback] $*"; }

CURRENT_SLOT="A"
if [[ -f "$BOOT_SLOT_FILE" ]]; then
  CURRENT_SLOT=$(cat "$BOOT_SLOT_FILE")
fi

case "$CURRENT_SLOT" in
  A|a) TARGET_SLOT="B" ;;
  B|b) TARGET_SLOT="A" ;;
  *)   log "ERROR: Unknown boot slot: $CURRENT_SLOT"; exit 1 ;;
esac

log "Rolling back from slot $CURRENT_SLOT to slot $TARGET_SLOT..."

# Update the committed boot slot
echo "$TARGET_SLOT" > "$BOOT_SLOT_FILE"

# On real Pi, update cmdline.txt to point to the target slot
if [[ -d /boot/firmware ]]; then
  local_dev_suffix=$( [[ "$TARGET_SLOT" == "A" ]] && echo 2 || echo 3 )
  TARGET_DEV="/dev/mmcblk0p${local_dev_suffix}"
  TARGET_PARTUUID=$(blkid -s PARTUUID -o value "$TARGET_DEV" 2>/dev/null || true)

  if [[ -n "$TARGET_PARTUUID" ]]; then
    sed -i "s|root=PARTUUID=[^ ]*|root=PARTUUID=${TARGET_PARTUUID}|" /boot/firmware/cmdline.txt
    log "Updated cmdline.txt with PARTUUID=$TARGET_PARTUUID"
  else
    log "WARN: Could not determine PARTUUID for $TARGET_DEV"
  fi
fi

cat > "$STATE_FILE" <<EOF
{"status":"idle","slot":"${TARGET_SLOT}","last_update":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","last_result":"rollback"}
EOF

log "Rebooting into slot $TARGET_SLOT..."
reboot
