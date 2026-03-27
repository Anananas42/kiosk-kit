#!/bin/bash
# expand-data-partition.sh — Expand the data partition (p4) to fill the SD card.
#
# Runs once on first boot, then disables itself.
# Logs to /var/log/expand-data.log (on rootfs, always available).

set -euo pipefail

DISK="/dev/mmcblk0"
PART_NUM=4
PART="${DISK}p${PART_NUM}"
LOG="/var/log/expand-data.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== expand-data-partition.sh starting ==="
log "Expanding data partition ${PART} to fill disk..."

# growpart needs /tmp for lock files; it may not exist yet at early boot
mkdir -p /tmp

# Grow partition to use all remaining space
# Exit code 0 = grew, 1 = already at max size (NOCHANGE)
log "Running growpart..."
rc=0
growpart "$DISK" "$PART_NUM" 2>&1 | tee -a "$LOG" || rc=$?
if [ "$rc" -eq 1 ]; then
  log "growpart: partition already at max size"
elif [ "$rc" -ne 0 ]; then
  log "ERROR: growpart failed with exit code $rc"
  exit 1
fi

# Notify the kernel about the resized partition
log "Running partx --update..."
partx --update --nr "$PART_NUM" "$DISK" 2>&1 | tee -a "$LOG"
sleep 1

# Filesystem check required for offline resize (partition is not yet mounted)
log "Running e2fsck -fy..."
e2fsck -fy "$PART" 2>&1 | tee -a "$LOG" || {
  log "ERROR: e2fsck failed"
  exit 1
}

# Resize filesystem to fill expanded partition
log "Running resize2fs..."
resize2fs "$PART" 2>&1 | tee -a "$LOG" || {
  log "ERROR: resize2fs failed"
  exit 1
}

log "Data partition expanded successfully."

# Remove marker so this service doesn't run again
rm -f /etc/.expand-data-needed
log "=== expand-data-partition.sh finished ==="
