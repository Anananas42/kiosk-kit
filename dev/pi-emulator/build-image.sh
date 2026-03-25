#!/usr/bin/env bash
# build-image.sh — Download Pi OS, boot in QEMU, provision with Ansible, snapshot golden image.
#
# Prerequisites: qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools)
#
# Usage: ./build-image.sh [--force]
#   --force   Rebuild the golden image even if it already exists.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Configuration -----------------------------------------------------------

# Override defaults before sourcing the shared library
# shellcheck disable=SC2034
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
# shellcheck disable=SC2034
PIOS_CHECKSUM="6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4"

SSH_PORT=2222
# shellcheck disable=SC2034
QEMU_RAM="${PI_EMU_RAM:-6G}"
# shellcheck disable=SC2034
QEMU_CPUS="${PI_EMU_CPUS:-$(( $(nproc) / 2 ))}"

WORK_DIR="$SCRIPT_DIR/.work"
GOLDEN_IMAGE="$SCRIPT_DIR/golden.qcow2"
# shellcheck disable=SC2034
KERNEL="$WORK_DIR/vmlinuz"
# shellcheck disable=SC2034
INITRD="$WORK_DIR/initrd.img"
# shellcheck disable=SC2034
RAW_IMAGE="$WORK_DIR/raspios.img"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

# shellcheck source=../../deploy/pi/lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Emulator-specific functions ---------------------------------------------

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
          # Tailscale is skipped in the emulator — use dummy values
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "emu-001"
          kioskkit_customer_tag: "emulator"
EOF

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale \
    -e "kioskkit_tailscale_auth_key=skip" \
    || { err "Ansible provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."; }
}

setup_wifi_simulation() {
  log "Setting up mac80211_hwsim for WiFi testing..."
  ssh_pi "sudo modprobe mac80211_hwsim radios=2 2>/dev/null && echo 'mac80211_hwsim loaded' || echo 'WARN: mac80211_hwsim not available — WiFi simulation will be limited'"

  ssh_pi "echo 'mac80211_hwsim' | sudo tee /etc/modules-load.d/hwsim.conf >/dev/null; echo 'options mac80211_hwsim radios=2' | sudo tee /etc/modprobe.d/hwsim.conf >/dev/null"
}

deploy_kiosk_app() {
  log "Deploying kiosk application into the VM..."

  local inventory_file="$WORK_DIR/inventory.yml"

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || { err "Ansible deploy failed. QEMU VM is still running on port $SSH_PORT for debugging."; }

  log "Waiting for kioskkit.service to start..."
  sleep 5

  local retries=12
  for (( i=1; i<=retries; i++ )); do
    if ssh_pi "curl -sf -o /dev/null http://localhost:3001/api/health" 2>/dev/null; then
      log "Kiosk server is healthy (port 3001)."
      return 0
    fi
    log "Health check attempt $i/$retries — waiting 5s..."
    sleep 5
  done

  err "Kiosk server health check failed after $retries attempts"
}

shutdown_and_snapshot() {
  shutdown_qemu

  log "Creating golden image..."
  cp "$DISK_IMAGE" "$GOLDEN_IMAGE"

  log "Golden image created at: $GOLDEN_IMAGE"
  log "Size: $(du -h "$GOLDEN_IMAGE" | cut -f1)"
  log ""
  log "Next steps:"
  log "  ./run.sh          — Boot the golden image"
  log "  ./test.sh         — Run smoke tests"
}

# --- Main --------------------------------------------------------------------

main() {
  local force=0
  [[ "${1:-}" == "--force" ]] && force=1

  if [[ -f "$GOLDEN_IMAGE" && $force -eq 0 ]]; then
    log "Golden image already exists at $GOLDEN_IMAGE"
    log "Use --force to rebuild."
    exit 0
  fi

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook
  mkdir -p "$WORK_DIR"

  download_pios
  prepare_disk
  patch_image_for_virt
  boot_qemu
  provision_with_ansible
  wait_for_reboot
  setup_wifi_simulation
  shutdown_and_snapshot
}

main "$@"
