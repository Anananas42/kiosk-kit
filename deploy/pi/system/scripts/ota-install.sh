#!/usr/bin/env bash
# ota-install.sh — Write a downloaded rootfs image to the inactive partition and reboot.
#
# Usage: ota-install.sh [image-path]
#
# If no image path given, uses the most recent file in /data/ota/pending/.
# Detects the current boot slot, writes to the other slot, sets up tryboot, and reboots.

set -euo pipefail

DATA_DIR="/data/ota"
PENDING_DIR="$DATA_DIR/pending"
BOOT_SLOT_FILE="$DATA_DIR/boot-slot"
STATE_FILE="$DATA_DIR/state.json"

log() { echo "[ota-install] $*"; }

# --- Determine image to install ---

if [[ $# -ge 1 ]]; then
  IMAGE="$1"
else
  IMAGE=$(find "$PENDING_DIR" -maxdepth 1 -type f -name '*.img.zst' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
  if [[ -z "$IMAGE" ]]; then
    # Try uncompressed .img
    IMAGE=$(find "$PENDING_DIR" -maxdepth 1 -type f -name '*.img' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
  fi
fi

if [[ -z "${IMAGE:-}" ]] || [[ ! -f "$IMAGE" ]]; then
  log "ERROR: No rootfs image found. Run ota-download.sh first."
  exit 1
fi

# --- Determine current and target slots ---

CURRENT_SLOT="A"
if [[ -f "$BOOT_SLOT_FILE" ]]; then
  CURRENT_SLOT=$(cat "$BOOT_SLOT_FILE")
fi

case "$CURRENT_SLOT" in
  A|a) TARGET_SLOT="B"; TARGET_DEV_SUFFIX="3" ;;
  B|b) TARGET_SLOT="A"; TARGET_DEV_SUFFIX="2" ;;
  *)   log "ERROR: Unknown boot slot: $CURRENT_SLOT"; exit 1 ;;
esac

# Detect the block device naming scheme
if [[ -b /dev/mmcblk0 ]]; then
  # Real Pi with SD card
  TARGET_DEV="/dev/mmcblk0p${TARGET_DEV_SUFFIX}"
elif [[ -b /dev/vda ]]; then
  # QEMU emulator
  TARGET_DEV="/dev/vda${TARGET_DEV_SUFFIX}"
else
  log "ERROR: Cannot detect block device (no /dev/mmcblk0 or /dev/vda)"
  exit 1
fi

log "Current slot: $CURRENT_SLOT, target slot: $TARGET_SLOT ($TARGET_DEV)"
log "Image: $IMAGE"

# --- Write image to target partition ---

cat > "$STATE_FILE" <<EOF
{"status":"installing","target_slot":"${TARGET_SLOT}","target_dev":"${TARGET_DEV}","started":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

if [[ "$IMAGE" == *.zst ]]; then
  log "Decompressing and writing to $TARGET_DEV..."
  zstd -d -c "$IMAGE" | dd of="$TARGET_DEV" bs=4M conv=fsync status=progress
else
  log "Writing to $TARGET_DEV..."
  dd if="$IMAGE" of="$TARGET_DEV" bs=4M conv=fsync status=progress
fi

sync

log "Image written to $TARGET_DEV."

# --- Set up tryboot ---

if [[ -d /boot/firmware ]]; then
  # Real Pi: update cmdline-tryboot.txt with the target partition's PARTUUID
  TARGET_PARTUUID=$(blkid -s PARTUUID -o value "$TARGET_DEV")
  if [[ -n "$TARGET_PARTUUID" ]]; then
    # Read current cmdline.txt, replace the root= PARTUUID
    sed "s|root=PARTUUID=[^ ]*|root=PARTUUID=${TARGET_PARTUUID}|" \
      /boot/firmware/cmdline.txt > /boot/firmware/cmdline-tryboot.txt
    log "Updated cmdline-tryboot.txt with PARTUUID=$TARGET_PARTUUID"
  else
    log "ERROR: Could not determine PARTUUID for $TARGET_DEV"
    exit 1
  fi

  cat > "$STATE_FILE" <<EOF
{"status":"rebooting","target_slot":"${TARGET_SLOT}","method":"tryboot","started":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  log "Rebooting into tryboot..."
  # Pi 4/5 tryboot: reboot with '0 tryboot' argument
  reboot '0 tryboot'
else
  # QEMU: write tryboot file to data partition for initrd to consume
  echo "$TARGET_SLOT" > "$DATA_DIR/tryboot"

  cat > "$STATE_FILE" <<EOF
{"status":"rebooting","target_slot":"${TARGET_SLOT}","method":"qemu-tryboot","started":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  log "Rebooting into slot $TARGET_SLOT (QEMU tryboot)..."
  reboot
fi
