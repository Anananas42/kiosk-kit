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
growpart "$DISK" "$PART_NUM" || {
  echo "growpart: partition already at max size or failed"
}

# Notify the kernel about the resized partition
partx --update --nr "$PART_NUM" "$DISK"
sleep 1

# Resize filesystem to match (works online on mounted ext4)
resize2fs "$PART" || {
  echo "resize2fs failed"
  exit 1
}

echo "Data partition expanded successfully."

# Remove marker so this service doesn't run again
rm -f /etc/.expand-data-needed
