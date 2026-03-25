#!/usr/bin/env bash
# build-sd-image.sh — Build a flashable SD card image for KioskKit Pi devices.
#
# Uses QEMU system emulation (aarch64 virt machine) to run Ansible provisioning
# inside a stock Raspberry Pi OS image, then finalizes the image for real Pi
# hardware. No sudo required.
#
# Prerequisites: qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools),
#                ansible-playbook, sshpass, curl, xz-utils, dpkg-deb
#
# Usage:
#   ./build-sd-image.sh --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
#   ./build-sd-image.sh --dev   # reads PI_DEV_* env vars
#   ./build-sd-image.sh --docker --device-id 042 ...  # run inside Docker container

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Docker self-wrapping ----------------------------------------------------

DOCKER_IMAGE_NAME="kioskkit-sd-builder"

run_in_docker() {
  local args=("$@")

  log "Building Docker image ($DOCKER_IMAGE_NAME)..."
  docker build -t "$DOCKER_IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$REPO_ROOT"

  log "Running build inside Docker container..."
  mkdir -p "$SCRIPT_DIR/.output"

  docker run --rm \
    -v "$SCRIPT_DIR/.output:/workspace/deploy/pi/.output" \
    "$DOCKER_IMAGE_NAME" \
    ./deploy/pi/build-sd-image.sh "${args[@]}"
}

# --- Configuration -----------------------------------------------------------

# Variables used by common.sh after sourcing
# shellcheck disable=SC2034
SSH_PORT=2222
# shellcheck disable=SC2034
QEMU_RAM="${PI_EMU_RAM:-6G}"
# shellcheck disable=SC2034
QEMU_CPUS="${PI_EMU_CPUS:-$(( $(nproc) / 2 ))}"

WORK_DIR="$SCRIPT_DIR/.work"
OUTPUT_DIR="$SCRIPT_DIR/.output"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
RAW_IMAGE="$WORK_DIR/raspios.img"
# shellcheck disable=SC2034
KERNEL="$WORK_DIR/vmlinuz"
# shellcheck disable=SC2034
INITRD="$WORK_DIR/initrd.img"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

# --- Source shared library ---------------------------------------------------

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# --- Argument parsing --------------------------------------------------------

parse_args() {
  DEVICE_ID=""
  CUSTOMER_TAG=""
  TAILSCALE_KEY=""
  USE_DOCKER=0

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
      --docker)
        USE_DOCKER=1
        shift
        ;;
      *) err "Unknown argument: $1" ;;
    esac
  done

  # If --docker was passed and we're NOT already inside the container, re-exec
  if [[ "$USE_DOCKER" -eq 1 && ! -f /.sd-builder-container ]]; then
    run_in_docker --device-id "$DEVICE_ID" --customer-tag "$CUSTOMER_TAG" --tailscale-key "$TAILSCALE_KEY"
    exit $?
  fi

  [[ -n "$DEVICE_ID" ]]     || err "Missing --device-id (or set PI_DEV_DEVICE_ID with --dev)"
  [[ -n "$CUSTOMER_TAG" ]]  || err "Missing --customer-tag (or set PI_DEV_CUSTOMER_TAG with --dev)"
  [[ -n "$TAILSCALE_KEY" ]] || err "Missing --tailscale-key (or set PI_DEV_TAILSCALE_KEY with --dev)"

  log "Building image for device=$DEVICE_ID customer=$CUSTOMER_TAG"
}

# --- Domain functions --------------------------------------------------------

save_original_fstab() {
  log "Saving original Pi OS fstab (with PARTUUIDs for real Pi hardware)..."
  mkdir -p "$WORK_DIR/original"

  # The raw image still has the original fstab with PARTUUIDs.
  # Read it before we convert to qcow2 and patch for virt.
  guestfish --ro -a "$RAW_IMAGE" -m /dev/sda2 <<EOF
download /etc/fstab $WORK_DIR/original/fstab
EOF

  log "Original fstab saved."
}

run_ansible_provision() {
  log "Running Ansible provisioning over SSH..."

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
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password -o PubkeyAuthentication=no"
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

  # provision.yml ends with a reboot. QEMU is started with -no-reboot so it
  # will exit cleanly instead of rebooting. Wait for it to die, then restart.
  log "Waiting for QEMU to exit after provisioning reboot..."
  local deadline=$((SECONDS + 60))
  while kill -0 "$QEMU_PID" 2>/dev/null && (( SECONDS < deadline )); do
    sleep 2
  done

  if kill -0 "$QEMU_PID" 2>/dev/null; then
    log "QEMU did not exit after reboot, killing..."
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
  unset QEMU_PID

  log "Re-booting QEMU after provisioning reboot..."
  boot_qemu_for_provisioning
}

run_ansible_deploy() {
  log "Running Ansible deploy (kiosk app) over SSH..."

  local inventory_file="$WORK_DIR/inventory.yml"

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || err "Ansible deploy failed. QEMU VM is still running on port $SSH_PORT for debugging."
}

install_tailscale_via_ssh() {
  log "Installing Tailscale package via SSH..."

  ssh_pi "sudo bash -c '
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
      > /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
      > /etc/apt/sources.list.d/tailscale.list
    apt-get update -qq
    apt-get install -y -qq tailscale
  '"

  log "Tailscale installed."
}

shutdown_qemu() {
  log "Shutting down QEMU cleanly..."
  ssh_pi "sudo shutdown -h now" 2>/dev/null || true

  local deadline=$((SECONDS + 30))
  while kill -0 "$QEMU_PID" 2>/dev/null && (( SECONDS < deadline )); do
    sleep 2
  done

  if kill -0 "$QEMU_PID" 2>/dev/null; then
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
  unset QEMU_PID
  log "QEMU stopped."
}

finalize_image() {
  log "Finalizing image for real Pi hardware (guestfish post-processing)..."

  # Prepare first-boot config file on the host
  local firstboot_conf="$WORK_DIR/tailscale-firstboot.conf"
  cat > "$firstboot_conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
TAILSCALE_AUTH_KEY=${TAILSCALE_KEY}
EOF
  chmod 600 "$firstboot_conf"

  guestfish --rw -a "$DISK_IMAGE" -m /dev/sda2 <<EOF
# --- Restore original Pi fstab (PARTUUIDs for real hardware) ---
upload $WORK_DIR/original/fstab /etc/fstab

# --- Remove virt kernel and initrd (Pi has its own in boot partition) ---
# Remove Debian virt kernel files from /boot (vmlinuz-*, config-*, System.map-*)
glob rm /boot/vmlinuz-*
glob rm /boot/config-*
glob rm /boot/System.map-*
# Note: We leave /usr/lib/modules alone — the virt kernel modules won't
# conflict with the Pi's built-in kernel modules.

# --- Inject first-boot Tailscale service ---
upload $SCRIPT_DIR/first-boot/kioskkit-tailscale-firstboot.service /etc/systemd/system/kioskkit-tailscale-firstboot.service

mkdir-p /opt/kioskkit/system
upload $SCRIPT_DIR/first-boot/tailscale-firstboot.sh /opt/kioskkit/system/tailscale-firstboot.sh
chmod 0755 /opt/kioskkit/system/tailscale-firstboot.sh

mkdir-p /etc/systemd/system/multi-user.target.wants
ln-sf /etc/systemd/system/kioskkit-tailscale-firstboot.service /etc/systemd/system/multi-user.target.wants/kioskkit-tailscale-firstboot.service

# --- Write first-boot config with device credentials ---
mkdir-p /etc/kioskkit
upload $firstboot_conf /etc/kioskkit/tailscale-firstboot.conf
chmod 0600 /etc/kioskkit/tailscale-firstboot.conf
EOF

  rm -f "$firstboot_conf"
  log "Image finalized for Pi hardware."
}

convert_to_raw() {
  log "Converting qcow2 back to raw .img..."
  local raw_output="$WORK_DIR/kioskkit-${DEVICE_ID}.img"
  qemu-img convert -f qcow2 -O raw "$DISK_IMAGE" "$raw_output"

  # Shrink the image: find the actual end of the last partition and truncate
  log "Shrinking image to actual partition end..."
  local part_end
  part_end=$(parted -s -m "$raw_output" unit B print 2>/dev/null \
    | grep '^2:' | cut -d: -f3 | tr -d 'B')

  if [[ -n "$part_end" ]]; then
    # Add 1 byte past the end of partition 2
    truncate -s "$((part_end + 1))" "$raw_output"
    log "Image truncated to $(du -h "$raw_output" | cut -f1)"
  else
    log "WARN: Could not determine partition end, keeping full image size."
  fi

  # Move to output
  mkdir -p "$OUTPUT_DIR"
  local output_file="$OUTPUT_DIR/kioskkit-${DEVICE_ID}.img"
  mv "$raw_output" "$output_file"

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

# --- Main --------------------------------------------------------------------

main() {
  parse_args "$@"

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook curl parted
  mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

  download_pios
  save_original_fstab
  prepare_disk
  patch_image_for_virt
  boot_qemu_for_provisioning
  run_ansible_provision
  run_ansible_deploy
  install_tailscale_via_ssh
  shutdown_qemu
  finalize_image
  convert_to_raw
}

main "$@"
