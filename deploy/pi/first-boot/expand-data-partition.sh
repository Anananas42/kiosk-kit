#!/bin/bash
# expand-data-partition.sh — Expand the data partition (p4) to fill the SD card.
#
# Runs once on first boot, then disables itself.

set -euo pipefail

DISK="/dev/mmcblk0"
PART_NUM=4
PART="${DISK}p${PART_NUM}"

echo "Expanding data partition ${PART} to fill disk..."

# growpart needs /tmp for lock files; it may not exist yet at early boot
mkdir -p /tmp

# Grow partition to use all remaining space
# Exit code 0 = grew, 1 = already at max size (NOCHANGE)
rc=0
growpart "$DISK" "$PART_NUM" || rc=$?
if [ "$rc" -eq 1 ]; then
  echo "growpart: partition already at max size"
elif [ "$rc" -ne 0 ]; then
  echo "growpart failed with exit code $rc" >&2
  exit 1
fi

# Notify the kernel about the resized partition
partx --update --nr "$PART_NUM" "$DISK"
sleep 1

# Filesystem check required for offline resize (partition is not yet mounted)
e2fsck -fy "$PART" || {
  echo "e2fsck failed"
  exit 1
}

# Resize filesystem to fill expanded partition
resize2fs "$PART" || {
  echo "resize2fs failed"
  exit 1
}

echo "Data partition expanded successfully."

# Remove marker so this service doesn't run again
rm -f /etc/.expand-data-needed
