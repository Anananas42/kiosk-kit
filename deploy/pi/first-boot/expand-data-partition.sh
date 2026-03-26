#!/bin/bash
# expand-data-partition.sh — Expand the data partition (p4) to fill the SD card.
#
# Runs once on first boot, then disables itself.

set -euo pipefail

DISK="/dev/mmcblk0"
PART_NUM=4
PART="${DISK}p${PART_NUM}"

echo "Expanding data partition ${PART} to fill disk..."

# Grow partition to use all remaining space
growpart "$DISK" "$PART_NUM" || {
  echo "growpart: partition already at max size or failed"
}

# Resize filesystem to match
resize2fs "$PART" || {
  echo "resize2fs failed"
  exit 1
}

echo "Data partition expanded successfully."

# Disable this service — only needs to run once
systemctl disable kioskkit-expand-data.service
