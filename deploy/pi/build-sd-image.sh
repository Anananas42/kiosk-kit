#!/usr/bin/env bash
# build-sd-image.sh — Build a flashable SD card image for KioskKit Pi devices.
#
# Uses qemu-user-static chroot to run Ansible provisioning inside a stock
# Raspberry Pi OS image, producing a device-specific .img ready for dd/Etcher.
#
# Prerequisites: qemu-user-static, binfmt-support, ansible-playbook, kpartx, parted
#
# Usage:
#   ./build-sd-image.sh --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
#   ./build-sd-image.sh --dev   # reads PI_DEV_* env vars

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Configuration -----------------------------------------------------------

# Same Pi OS image as the emulator
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
PIOS_CHECKSUM="a0dc4251e73151e4109d0c499aba04dae7afbbcfaac54afa1ea1b55f75764f0d"

IMAGE_SIZE="6G"
WORK_DIR="$SCRIPT_DIR/.work"
OUTPUT_DIR="$SCRIPT_DIR/.output"
MNT_DIR="$WORK_DIR/mnt"
CACHED_IMAGE="$WORK_DIR/raspios.img"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"
PISHRINK="$WORK_DIR/pishrink.sh"
PISHRINK_URL="https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh"

# --- State tracking for cleanup ---------------------------------------------

LOOP_DEV=""
MOUNTED_ROOT=0
MOUNTED_BOOT=0
MOUNTED_PROC=0
MOUNTED_SYS=0
MOUNTED_DEV=0
MOUNTED_DEVPTS=0
WORK_IMAGE=""

# --- Utilities ---------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || err "Required command not found: $cmd"
  done
}

# --- Cleanup trap ------------------------------------------------------------

cleanup() {
  local exit_code=$?
  set +e
  log "Cleaning up..."

  if [[ "$MOUNTED_PROC" -eq 1 ]]; then
    umount "$MNT_DIR/proc" 2>/dev/null
  fi
  if [[ "$MOUNTED_SYS" -eq 1 ]]; then
    umount "$MNT_DIR/sys" 2>/dev/null
  fi
  if [[ "$MOUNTED_DEVPTS" -eq 1 ]]; then
    umount "$MNT_DIR/dev/pts" 2>/dev/null
  fi
  if [[ "$MOUNTED_DEV" -eq 1 ]]; then
    umount "$MNT_DIR/dev" 2>/dev/null
  fi
  if [[ "$MOUNTED_BOOT" -eq 1 ]]; then
    umount "$MNT_DIR/boot/firmware" 2>/dev/null
  fi
  if [[ "$MOUNTED_ROOT" -eq 1 ]]; then
    umount "$MNT_DIR" 2>/dev/null
  fi
  if [[ -n "$LOOP_DEV" ]]; then
    kpartx -dv "$WORK_IMAGE" 2>/dev/null
    LOOP_DEV=""
  fi

  set -e
  exit "$exit_code"
}
trap cleanup EXIT

# --- Domain functions --------------------------------------------------------

parse_args() {
  DEVICE_ID=""
  CUSTOMER_TAG=""
  TAILSCALE_KEY=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device-id)   [[ $# -ge 2 ]] || err "--device-id requires a value"; DEVICE_ID="$2"; shift 2 ;;
      --customer-tag) [[ $# -ge 2 ]] || err "--customer-tag requires a value"; CUSTOMER_TAG="$2"; shift 2 ;;
      --tailscale-key) [[ $# -ge 2 ]] || err "--tailscale-key requires a value"; TAILSCALE_KEY="$2"; shift 2 ;;
      --dev)
        DEVICE_ID="${PI_DEV_DEVICE_ID:-}"
        CUSTOMER_TAG="${PI_DEV_CUSTOMER_TAG:-}"
        TAILSCALE_KEY="${PI_DEV_TAILSCALE_KEY:-}"
        shift
        ;;
      *) err "Unknown argument: $1" ;;
    esac
  done

  [[ -n "$DEVICE_ID" ]]    || err "Missing --device-id (or set PI_DEV_DEVICE_ID with --dev)"
  [[ -n "$CUSTOMER_TAG" ]] || err "Missing --customer-tag (or set PI_DEV_CUSTOMER_TAG with --dev)"
  [[ -n "$TAILSCALE_KEY" ]] || err "Missing --tailscale-key (or set PI_DEV_TAILSCALE_KEY with --dev)"

  WORK_IMAGE="$WORK_DIR/kioskkit-${DEVICE_ID}.img"

  log "Building image for device=$DEVICE_ID customer=$CUSTOMER_TAG"
}

download_pios() {
  if [[ -f "$CACHED_IMAGE" ]]; then
    log "Using cached Pi OS image."
    return 0
  fi

  log "Downloading Raspberry Pi OS Lite..."
  mkdir -p "$WORK_DIR"
  local xz_file="$WORK_DIR/raspios.img.xz"
  curl -fL -o "$xz_file" "$PIOS_URL"
  log "Verifying checksum..."
  echo "$PIOS_CHECKSUM  $xz_file" | sha256sum -c - || err "Checksum mismatch for downloaded image"
  log "Decompressing..."
  xz -d "$xz_file"
}

prepare_image() {
  log "Preparing working image..."
  cp "$CACHED_IMAGE" "$WORK_IMAGE"

  log "Expanding image to $IMAGE_SIZE..."
  truncate -s "$IMAGE_SIZE" "$WORK_IMAGE"

  log "Expanding root partition..."
  parted -s "$WORK_IMAGE" resizepart 2 100%

  # Set up loop device to resize filesystem
  local kpartx_out
  kpartx_out=$(kpartx -av "$WORK_IMAGE")
  local loop_name
  loop_name=$(echo "$kpartx_out" | grep -m1 'loop' | awk '{print $3}' | sed 's/p[0-9]*$//')
  local root_dev="/dev/mapper/${loop_name}p2"

  log "Running e2fsck and resize2fs on $root_dev..."
  e2fsck -f -y "$root_dev" || true
  resize2fs "$root_dev"

  kpartx -dv "$WORK_IMAGE"
  log "Image prepared."
}

mount_image() {
  log "Mounting image partitions..."
  mkdir -p "$MNT_DIR"

  local kpartx_out
  kpartx_out=$(kpartx -av "$WORK_IMAGE")
  local loop_name
  loop_name=$(echo "$kpartx_out" | grep -m1 'loop' | awk '{print $3}' | sed 's/p[0-9]*$//')
  LOOP_DEV="$loop_name"

  local boot_dev="/dev/mapper/${loop_name}p1"
  local root_dev="/dev/mapper/${loop_name}p2"

  mount "$root_dev" "$MNT_DIR"
  MOUNTED_ROOT=1

  mkdir -p "$MNT_DIR/boot/firmware"
  mount "$boot_dev" "$MNT_DIR/boot/firmware"
  MOUNTED_BOOT=1

  log "Image mounted at $MNT_DIR"
}

setup_chroot() {
  log "Setting up chroot environment..."

  mount -t proc proc "$MNT_DIR/proc"
  MOUNTED_PROC=1

  mount -t sysfs sys "$MNT_DIR/sys"
  MOUNTED_SYS=1

  mount -o bind /dev "$MNT_DIR/dev"
  MOUNTED_DEV=1

  mount -o bind /dev/pts "$MNT_DIR/dev/pts"
  MOUNTED_DEVPTS=1

  # DNS resolution
  cp /etc/resolv.conf "$MNT_DIR/etc/resolv.conf"

  # qemu-user-static for ARM binary execution
  cp /usr/bin/qemu-aarch64-static "$MNT_DIR/usr/bin/"

  # Install fake systemctl wrapper
  log "Installing fake systemctl wrapper..."
  mkdir -p "$MNT_DIR/usr/local/bin"
  cp "$SCRIPT_DIR/chroot-bin/fake-systemctl" "$MNT_DIR/usr/local/bin/systemctl"
  chmod +x "$MNT_DIR/usr/local/bin/systemctl"

  log "Chroot environment ready."
}

run_ansible() {
  log "Running Ansible provisioning (chroot connection)..."

  local inventory_file="$WORK_DIR/inventory.yml"
  cat > "$inventory_file" <<EOF
---
all:
  children:
    kiosks:
      hosts:
        sdimage:
          ansible_connection: chroot
          ansible_host: ${MNT_DIR}
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "${DEVICE_ID}"
          kioskkit_customer_tag: "${CUSTOMER_TAG}"
EOF

  ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale \
    -e "kioskkit_tailscale_auth_key=skip" \
    || err "Ansible provisioning failed. Check logs above."

  log "Ansible provisioning complete."
}

install_tailscale() {
  log "Installing Tailscale package inside chroot..."

  chroot "$MNT_DIR" /bin/bash -c '
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
      > /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
      > /etc/apt/sources.list.d/tailscale.list
    apt-get update -qq
    apt-get install -y -qq tailscale
  '

  log "Tailscale installed."
}

inject_firstboot_service() {
  log "Injecting first-boot Tailscale service..."

  # Write config file with device-specific values
  mkdir -p "$MNT_DIR/etc/kioskkit"
  cat > "$MNT_DIR/etc/kioskkit/tailscale-firstboot.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
TAILSCALE_AUTH_KEY=${TAILSCALE_KEY}
EOF
  chmod 600 "$MNT_DIR/etc/kioskkit/tailscale-firstboot.conf"

  # Copy service file and script
  cp "$SCRIPT_DIR/first-boot/kioskkit-tailscale-firstboot.service" \
    "$MNT_DIR/etc/systemd/system/"

  mkdir -p "$MNT_DIR/opt/kioskkit/system"
  cp "$SCRIPT_DIR/first-boot/tailscale-firstboot.sh" \
    "$MNT_DIR/opt/kioskkit/system/"
  chmod +x "$MNT_DIR/opt/kioskkit/system/tailscale-firstboot.sh"

  # Enable via symlink
  mkdir -p "$MNT_DIR/etc/systemd/system/multi-user.target.wants"
  ln -sf /etc/systemd/system/kioskkit-tailscale-firstboot.service \
    "$MNT_DIR/etc/systemd/system/multi-user.target.wants/kioskkit-tailscale-firstboot.service"

  log "First-boot service injected."
}

cleanup_chroot() {
  log "Cleaning up chroot..."

  # Remove fake systemctl wrapper — must NOT be in the final image
  rm -f "$MNT_DIR/usr/local/bin/systemctl"

  # Remove qemu binary
  rm -f "$MNT_DIR/usr/bin/qemu-aarch64-static"

  # Restore resolv.conf (remove our copy, the image has its own)
  rm -f "$MNT_DIR/etc/resolv.conf"

  # Clear apt caches
  rm -rf "$MNT_DIR/var/cache/apt/archives/"*.deb
  rm -rf "$MNT_DIR/var/lib/apt/lists/"*

  log "Chroot cleaned."
}

unmount_image() {
  log "Unmounting image..."

  if [[ "$MOUNTED_PROC" -eq 1 ]]; then
    umount "$MNT_DIR/proc"
    MOUNTED_PROC=0
  fi
  if [[ "$MOUNTED_SYS" -eq 1 ]]; then
    umount "$MNT_DIR/sys"
    MOUNTED_SYS=0
  fi
  if [[ "$MOUNTED_DEVPTS" -eq 1 ]]; then
    umount "$MNT_DIR/dev/pts"
    MOUNTED_DEVPTS=0
  fi
  if [[ "$MOUNTED_DEV" -eq 1 ]]; then
    umount "$MNT_DIR/dev"
    MOUNTED_DEV=0
  fi
  if [[ "$MOUNTED_BOOT" -eq 1 ]]; then
    umount "$MNT_DIR/boot/firmware"
    MOUNTED_BOOT=0
  fi
  if [[ "$MOUNTED_ROOT" -eq 1 ]]; then
    umount "$MNT_DIR"
    MOUNTED_ROOT=0
  fi
  if [[ -n "$LOOP_DEV" ]]; then
    kpartx -dv "$WORK_IMAGE"
    LOOP_DEV=""
  fi

  log "Image unmounted."
}

shrink_image() {
  log "Shrinking image with PiShrink..."

  if [[ ! -f "$PISHRINK" ]]; then
    curl -fL -o "$PISHRINK" "$PISHRINK_URL"
    chmod +x "$PISHRINK"
  fi

  bash "$PISHRINK" "$WORK_IMAGE"
  log "Image shrunk."
}

# --- Main --------------------------------------------------------------------

main() {
  parse_args "$@"

  require_cmd qemu-aarch64-static ansible-playbook kpartx parted e2fsck resize2fs curl chroot
  mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

  download_pios
  prepare_image
  mount_image
  setup_chroot
  run_ansible
  install_tailscale
  inject_firstboot_service
  cleanup_chroot
  unmount_image
  shrink_image

  # Move to output
  local output_file="$OUTPUT_DIR/kioskkit-${DEVICE_ID}.img"
  mv "$WORK_IMAGE" "$output_file"

  local size
  size=$(du -h "$output_file" | cut -f1)
  log ""
  log "Image built successfully!"
  log "  Output: $output_file"
  log "  Size:   $size"
  log ""
  log "Flash with:"
  log "  sudo dd if=$output_file of=/dev/sdX bs=4M status=progress"
  log "  # or use balenaEtcher"
}

main "$@"
