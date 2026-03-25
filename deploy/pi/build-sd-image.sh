#!/usr/bin/env bash
# build-sd-image.sh — Build a flashable SD card image for KioskKit Pi devices.
#
# Uses QEMU system emulation (no sudo, no chroot, no binfmt_misc) to run
# Ansible provisioning inside a booted Pi OS VM, then restores the native
# Pi boot state and injects Tailscale first-boot authentication.
#
# Prerequisites (all provided by the Dockerfile):
#   qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools),
#   ansible-playbook, sshpass, curl, xz, dpkg-deb
#
# Usage:
#   ./build-sd-image.sh --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
#   ./build-sd-image.sh --dev   # reads PI_DEV_* env vars

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Docker re-exec ---------------------------------------------------------
# If not inside a container, rebuild and re-exec inside Docker.

if [ ! -f /.dockerenv ] && [ -z "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required when running outside a container" >&2; exit 1; }
  echo "==> Building SD image builder Docker image..."
  docker build -t kioskkit-sd-builder "$SCRIPT_DIR"
  echo "==> Re-executing inside container..."
  exec docker run --rm \
    -e KIOSKKIT_IN_CONTAINER=1 \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$SCRIPT_DIR/.output:/output" \
    kioskkit-sd-builder "$@"
fi

# --- Configuration -----------------------------------------------------------

# Variables consumed by pi-image-common.sh after sourcing
# shellcheck disable=SC2034
SSH_PORT=2222
# shellcheck disable=SC2034
QEMU_RAM="${SD_BUILD_RAM:-4G}"
# shellcheck disable=SC2034
QEMU_CPUS="${SD_BUILD_CPUS:-$(( $(nproc) / 2 ))}"

# When running in the container, /workspace is the repo root (read-only mount).
# Use /build as the writable work directory.
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

# shellcheck disable=SC2034
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
# shellcheck disable=SC2034
PIOS_CHECKSUM="6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4"

# Tailscale arm64 .deb URL and checksum
TAILSCALE_VERSION="1.80.3"
TAILSCALE_DEB_URL="https://pkgs.tailscale.com/stable/debian/pool/tailscale_${TAILSCALE_VERSION}_arm64.deb"
TAILSCALE_DEB_CHECKSUM="aed221f435b3ed6e5a6ed0694a3e91b04136264b96ae27cca39433a95fbd03e2"

# shellcheck source=lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Argument parsing --------------------------------------------------------

parse_args() {
  DEVICE_ID=""
  CUSTOMER_TAG=""
  TAILSCALE_KEY=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device-id)    [[ $# -ge 2 ]] || err "--device-id requires a value"; DEVICE_ID="$2"; shift 2 ;;
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

  [[ -n "$DEVICE_ID" ]]     || err "Missing --device-id (or set PI_DEV_DEVICE_ID with --dev)"
  [[ -n "$CUSTOMER_TAG" ]]  || err "Missing --customer-tag (or set PI_DEV_CUSTOMER_TAG with --dev)"
  [[ -n "$TAILSCALE_KEY" ]] || err "Missing --tailscale-key (or set PI_DEV_TAILSCALE_KEY with --dev)"

  log "Building image for device=$DEVICE_ID customer=$CUSTOMER_TAG"
}

# --- SD image specific functions ---------------------------------------------

save_original_boot_state() {
  log "Saving original Pi boot state for later restoration..."
  local orig_dir="$WORK_DIR/original-boot"
  mkdir -p "$orig_dir"

  # Save original fstab and list boot firmware contents
  guestfish --ro -a "$DISK_IMAGE" <<EOF
run
mount /dev/sda2 /
mount /dev/sda1 /boot/firmware
download /etc/fstab $orig_dir/fstab
# List boot firmware files so we know what belongs to Pi vs. virt kernel
ls /boot/firmware
EOF
  # Also save the partition info for reference
  guestfish --ro -a "$DISK_IMAGE" <<'EOF' > "$orig_dir/boot-files.txt"
run
mount /dev/sda1 /
ls /
EOF
  log "Original boot state saved to $orig_dir"
}

provision_with_ansible() {
  log "Running Ansible provisioning..."

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
          kioskkit_device_id: "${DEVICE_ID}"
          kioskkit_customer_tag: "${CUSTOMER_TAG}"
EOF

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale \
    -e "kioskkit_tailscale_auth_key=skip" \
    || err "Ansible provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."
}

restore_pi_boot_state() {
  log "Restoring native Pi boot state..."
  local orig_dir="$WORK_DIR/original-boot"

  # Restore original fstab (PARTUUID-based) and remove virt kernel files.
  # The virt kernel modules go under /usr/lib/modules/<virt-kver>/; the Pi's
  # native kernel modules are under a different version directory and are untouched.
  #
  # We need to identify virt kernel modules to remove. They were added by
  # patch_image_for_virt from the Debian kernel. The Pi's native modules
  # are from the Raspberry Pi kernel and have a different version string.
  local virt_kver
  virt_kver=$(cat "$WORK_DIR/virt-kernel-version" 2>/dev/null || true)

  local gf_cmds="$WORK_DIR/restore-boot.cmd"
  {
    echo "add $DISK_IMAGE"
    echo "run"
    echo "mount /dev/sda2 /"
    echo "upload $orig_dir/fstab /etc/fstab"
    # Remove virt kernel modules if we know the version
    if [[ -n "$virt_kver" ]]; then
      echo "rm-rf /usr/lib/modules/$virt_kver"
    fi
    # Remove virt boot files (vmlinuz-*, config-*, System.map-* from Debian kernel)
    # These were uploaded to /boot/ by patch_image_for_virt. The Pi's real kernel
    # lives in /boot/firmware/ on the boot partition (sda1), which we didn't touch.
    echo "glob rm /boot/vmlinuz-*"
    echo "glob rm /boot/config-*"
    echo "glob rm /boot/System.map-*"
    # Remove ephemeral build SSH key from the image
    echo "rm-f /home/pi/.ssh/authorized_keys"
  } > "$gf_cmds"

  guestfish < "$gf_cmds" || log "WARN: Some restore commands failed (may be OK if files didn't exist)"
  rm -f "$gf_cmds"

  log "Pi boot state restored."
}

inject_tailscale_firstboot() {
  log "Injecting Tailscale first-boot service..."

  local inject_dir="$WORK_DIR/inject-files"
  mkdir -p "$inject_dir/etc/kioskkit"

  # Write config file with device-specific values
  cat > "$inject_dir/tailscale-firstboot.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
TAILSCALE_AUTH_KEY=${TAILSCALE_KEY}
EOF

  # Download Tailscale arm64 .deb for offline installation
  log "Downloading Tailscale arm64 .deb..."
  local ts_deb="$inject_dir/tailscale.deb"
  curl -fSL -o "$ts_deb" "$TAILSCALE_DEB_URL" \
    || err "Failed to download Tailscale .deb from $TAILSCALE_DEB_URL"
  echo "$TAILSCALE_DEB_CHECKSUM  $ts_deb" | sha256sum -c - \
    || err "Checksum mismatch for Tailscale .deb"

  # Use guestfish to inject everything into the image
  guestfish --rw -a "$DISK_IMAGE" -m /dev/sda2 <<EOF
# Tailscale first-boot config
mkdir-p /etc/kioskkit
upload $inject_dir/tailscale-firstboot.conf /etc/kioskkit/tailscale-firstboot.conf
chmod 0600 /etc/kioskkit/tailscale-firstboot.conf

# First-boot service and script
upload $REPO_ROOT/deploy/pi/first-boot/kioskkit-tailscale-firstboot.service /etc/systemd/system/kioskkit-tailscale-firstboot.service
mkdir-p /opt/kioskkit/system
upload $REPO_ROOT/deploy/pi/first-boot/tailscale-firstboot.sh /opt/kioskkit/system/tailscale-firstboot.sh
chmod 0755 /opt/kioskkit/system/tailscale-firstboot.sh

# Enable the first-boot service
mkdir-p /etc/systemd/system/multi-user.target.wants
ln-sf /etc/systemd/system/kioskkit-tailscale-firstboot.service /etc/systemd/system/multi-user.target.wants/kioskkit-tailscale-firstboot.service

# Install Tailscale .deb — extract manually since we can't run dpkg (ARM binary).
# We extract to a temp dir, then copy the files into the image.
EOF

  # Extract Tailscale .deb on the host and copy files into the image
  local ts_root="$inject_dir/tailscale-root"
  mkdir -p "$ts_root"
  dpkg-deb -x "$ts_deb" "$ts_root"

  # Build a guestfish command file to copy Tailscale files
  local gf_cmds="$inject_dir/guestfish-ts.cmd"
  {
    echo "add $DISK_IMAGE"
    echo "run"
    echo "mount /dev/sda2 /"
    # Copy binaries
    if [ -f "$ts_root/usr/bin/tailscale" ]; then
      echo "upload $ts_root/usr/bin/tailscale /usr/bin/tailscale"
      echo "chmod 0755 /usr/bin/tailscale"
    fi
    if [ -f "$ts_root/usr/sbin/tailscaled" ]; then
      echo "upload $ts_root/usr/sbin/tailscaled /usr/sbin/tailscaled"
      echo "chmod 0755 /usr/sbin/tailscaled"
    fi
    # Copy systemd service
    if [ -f "$ts_root/lib/systemd/system/tailscaled.service" ]; then
      echo "upload $ts_root/lib/systemd/system/tailscaled.service /usr/lib/systemd/system/tailscaled.service"
      echo "mkdir-p /etc/systemd/system/multi-user.target.wants"
      echo "ln-sf /usr/lib/systemd/system/tailscaled.service /etc/systemd/system/multi-user.target.wants/tailscaled.service"
    fi
    # Copy defaults file if present
    if [ -f "$ts_root/etc/default/tailscaled" ]; then
      echo "mkdir-p /etc/default"
      echo "upload $ts_root/etc/default/tailscaled /etc/default/tailscaled"
    fi
  } > "$gf_cmds"

  guestfish < "$gf_cmds"
  rm -rf "$inject_dir"

  log "Tailscale first-boot service injected."
}

convert_to_raw() {
  log "Converting qcow2 to raw image..."
  local raw_output="$WORK_DIR/kioskkit-${DEVICE_ID}.img"
  qemu-img convert -f qcow2 -O raw "$DISK_IMAGE" "$raw_output"
  FINAL_IMAGE="$raw_output"
  log "Raw image: $(du -h "$FINAL_IMAGE" | cut -f1)"
}

shrink_image() {
  log "Shrinking image..."

  # Use virt-sparsify if available, otherwise try PiShrink
  if command -v virt-sparsify >/dev/null 2>&1; then
    log "Using virt-sparsify..."
    local sparse_output="$WORK_DIR/kioskkit-${DEVICE_ID}-sparse.img"
    virt-sparsify "$FINAL_IMAGE" "$sparse_output"
    mv "$sparse_output" "$FINAL_IMAGE"
  else
    log "Downloading PiShrink..."
    local pishrink="$WORK_DIR/pishrink.sh"
    curl -fL -o "$pishrink" "https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh"
    chmod +x "$pishrink"
    bash "$pishrink" "$FINAL_IMAGE"
  fi

  log "Image shrunk: $(du -h "$FINAL_IMAGE" | cut -f1)"
}

# --- Main --------------------------------------------------------------------

main() {
  parse_args "$@"

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook dpkg-deb curl
  mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

  download_pios
  prepare_disk
  save_original_boot_state
  patch_image_for_virt
  boot_qemu
  provision_with_ansible
  wait_for_reboot
  shutdown_qemu
  restore_pi_boot_state
  inject_tailscale_firstboot
  convert_to_raw
  shrink_image

  # Move to output
  local output_file="$OUTPUT_DIR/kioskkit-${DEVICE_ID}.img"
  mv "$FINAL_IMAGE" "$output_file"

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
