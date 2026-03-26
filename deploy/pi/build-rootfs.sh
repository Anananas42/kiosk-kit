#!/usr/bin/env bash
# build-rootfs.sh — Extract and package a rootfs image for OTA distribution.
#
# Runs Layer 1 (base provision) + Layer 2 (app deploy), skips Layer 3 (device stamping).
# Extracts the rootfs (partition 2) from the app image, stamps a version file,
# compresses with zstd, and generates a sha256 checksum.
#
# Output:
#   kioskkit-rootfs-<version>.img.zst
#   kioskkit-rootfs-<version>.img.zst.sha256
#
# Usage:
#   ./build-rootfs.sh                   # Use git describe for version
#   ./build-rootfs.sh --version 1.2.3   # Explicit version string
#   ./build-rootfs.sh --force           # Rebuild all layers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Docker re-exec ---------------------------------------------------------

if [ ! -f /.dockerenv ] && [ -z "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required when running outside a container" >&2; exit 1; }
  echo "==> Building SD image builder Docker image..."
  docker build -t kioskkit-sd-builder "$SCRIPT_DIR"
  echo "==> Re-executing inside container..."
  DOCKER_TTY_FLAG=""
  if [ -t 0 ]; then DOCKER_TTY_FLAG="-it"; fi
  # shellcheck disable=SC2086
  exec docker run --rm $DOCKER_TTY_FLAG \
    -e KIOSKKIT_IN_CONTAINER=1 \
    ${SD_BUILD_RAM:+-e SD_BUILD_RAM="$SD_BUILD_RAM"} \
    ${SD_BUILD_CPUS:+-e SD_BUILD_CPUS="$SD_BUILD_CPUS"} \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$SCRIPT_DIR/.work:/build" \
    -v "$SCRIPT_DIR/.output:/output" \
    --entrypoint /workspace/deploy/pi/build-rootfs.sh \
    kioskkit-sd-builder "$@"
fi

# --- Configuration -----------------------------------------------------------

# shellcheck disable=SC2034
SSH_PORT=2222
# shellcheck disable=SC2034
QEMU_RAM="${SD_BUILD_RAM:-6G}"
_half_cpus=$(( $(nproc) / 2 ))
# shellcheck disable=SC2034
QEMU_CPUS="${SD_BUILD_CPUS:-$(( _half_cpus > 8 ? 8 : _half_cpus ))}"

if [ -n "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  REPO_ROOT="/workspace"
  WORK_DIR="/build"
  OUTPUT_DIR="/output"
else
  WORK_DIR="$SCRIPT_DIR/.work"
  OUTPUT_DIR="$SCRIPT_DIR/.output"
fi

# shellcheck disable=SC2034
KERNEL="$WORK_DIR/vmlinuz"
# shellcheck disable=SC2034
INITRD="$WORK_DIR/initrd.img"
# shellcheck disable=SC2034
RAW_IMAGE="$WORK_DIR/raspios.img"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

BASE_IMAGE="$WORK_DIR/provisioned-base.qcow2"
APP_IMAGE="$WORK_DIR/app-image.qcow2"

# shellcheck disable=SC2034
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
# shellcheck disable=SC2034
PIOS_CHECKSUM="6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4"

# shellcheck source=lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Argument parsing --------------------------------------------------------

VERSION=""
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)  [[ $# -ge 2 ]] || err "--version requires a value"; VERSION="$2"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    *)          err "Unknown argument: $1" ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  VERSION=$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")
fi

log "Building rootfs image version: $VERSION"

# --- Reuse Layer 1 + 2 from build-sd-image.sh cache -------------------------

write_inventory() {
  local inventory_file="$WORK_DIR/inventory.yml"
  cat > "$inventory_file" <<EOF
---
all:
  children:
    kiosks:
      hosts:
        qemu-pi:
          ansible_host: localhost
          ansible_port: $SSH_PORT
          ansible_user: pi
          ansible_ssh_pass: "raspberry"
          ansible_ssh_private_key_file: "$BUILD_SSH_KEY"
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "rootfs"
          kioskkit_customer_tag: "ota"
EOF
}

provision_base() {
  log "Running Ansible base provisioning (--skip-tags tailscale,app)..."
  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$WORK_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale,app \
    -e "kioskkit_tailscale_auth_key=skip" \
    || err "Ansible base provisioning failed."
}

deploy_app() {
  log "Deploying kiosk application into the VM..."
  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$WORK_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || err "Ansible deploy failed."
}

# --- Main --------------------------------------------------------------------

main() {
  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook dpkg-deb curl jq zstd
  mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

  BUILD_SSH_KEY="$WORK_DIR/build-ssh-key"
  write_inventory

  local ansible_hash app_hash
  ansible_hash=$(compute_layer_hash "$REPO_ROOT/deploy/pi/ansible")
  app_hash=$(compute_layer_hash "$REPO_ROOT/packages" "$REPO_ROOT/pnpm-lock.yaml" "$REPO_ROOT/turbo.json")

  # --- Layer 1: Base system ---
  local base_changed=0
  if [[ -f "$BASE_IMAGE" ]] && [[ "$(cat "$WORK_DIR/base-hash" 2>/dev/null)" == "$ansible_hash" ]] && [[ $FORCE -eq 0 ]]; then
    log "Base system cached (Ansible unchanged)."
  else
    base_changed=1
    log "Building base system layer..."
    download_pios
    prepare_disk
    patch_image_for_virt
    boot_qemu
    provision_base
    wait_for_reboot
    shutdown_qemu
    cp "$DISK_IMAGE" "$BASE_IMAGE"
    echo "$ansible_hash" > "$WORK_DIR/base-hash"
    log "Base system layer cached."
  fi

  # --- Layer 2: App deployment ---
  if [[ -f "$APP_IMAGE" ]] && [[ "$(cat "$WORK_DIR/app-hash" 2>/dev/null)" == "$app_hash" ]] && [[ $base_changed -eq 0 ]] && [[ $FORCE -eq 0 ]]; then
    log "App layer cached."
  else
    log "Building app deployment layer..."
    create_cow_overlay "$BASE_IMAGE" "$DISK_IMAGE"
    boot_qemu
    deploy_app
    shutdown_qemu
    flatten_overlay "$DISK_IMAGE" "$APP_IMAGE"
    echo "$app_hash" > "$WORK_DIR/app-hash"
    log "App layer cached."
  fi

  # --- Extract rootfs from partition 2 ---
  log "Extracting rootfs from partition 2..."

  local rootfs_raw="$WORK_DIR/rootfs.img"

  # Stamp version file into the rootfs
  guestfish --rw -a "$APP_IMAGE" -m /dev/sda2 <<EOF
mkdir-p /etc/kioskkit
write /etc/kioskkit/version "$VERSION"
EOF

  # Extract partition 2 as raw image
  guestfish --ro -a "$APP_IMAGE" <<EOF
run
download /dev/sda2 $rootfs_raw
EOF

  # --- Compress and checksum ---
  local output_name="kioskkit-rootfs-${VERSION}"
  local output_zst="$OUTPUT_DIR/${output_name}.img.zst"
  local output_sha="$OUTPUT_DIR/${output_name}.img.zst.sha256"

  log "Compressing with zstd..."
  zstd -T0 --rm -f "$rootfs_raw" -o "$output_zst"

  log "Generating sha256 checksum..."
  (cd "$OUTPUT_DIR" && sha256sum "$(basename "$output_zst")" > "$(basename "$output_sha")")

  local size
  size=$(du -h "$output_zst" | cut -f1)
  log ""
  log "Rootfs image built successfully!"
  log "  Image:    $output_zst"
  log "  Checksum: $output_sha"
  log "  Size:     $size"
  log "  Version:  $VERSION"
}

main
