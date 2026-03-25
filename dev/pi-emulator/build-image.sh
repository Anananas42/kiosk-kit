#!/usr/bin/env bash
# build-image.sh — Download Pi OS, boot in QEMU, provision with Ansible, snapshot golden image.
#
# Uses a two-layer cache so that app-only changes rebuild in ~5 min instead of ~30 min.
#
#   Layer 1 (base system):  Pi OS + QEMU patches + Ansible provision (--skip-tags tailscale,app)
#   Layer 2 (app deploy):   Boot base overlay, run deploy.yml, snapshot golden image
#
# Prerequisites: qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools)
#
# Usage:
#   ./build-image.sh              # Build with caching (skip unchanged layers)
#   ./build-image.sh --force      # Rebuild everything from scratch
#   ./build-image.sh --app-only   # Skip base layer (must already exist)

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

BASE_IMAGE="$WORK_DIR/provisioned-base.qcow2"

# shellcheck source=../../deploy/pi/lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Emulator-specific functions ---------------------------------------------

# provision_base — run provision.yml skipping tailscale and app tags (Layer 1).
provision_base() {
  log "Running Ansible base provisioning (--skip-tags tailscale,app)..."

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
    --skip-tags tailscale,app \
    -e "kioskkit_tailscale_auth_key=skip" \
    || { err "Ansible base provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."; }
}

# deploy_app — run deploy.yml to sync code and build the application (Layer 2).
deploy_app() {
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

setup_wifi_simulation() {
  log "Setting up mac80211_hwsim for WiFi testing..."
  ssh_pi "sudo modprobe mac80211_hwsim radios=2 2>/dev/null && echo 'mac80211_hwsim loaded' || echo 'WARN: mac80211_hwsim not available — WiFi simulation will be limited'"

  ssh_pi "echo 'mac80211_hwsim' | sudo tee /etc/modules-load.d/hwsim.conf >/dev/null; echo 'options mac80211_hwsim radios=2' | sudo tee /etc/modprobe.d/hwsim.conf >/dev/null"
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
  local app_only=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)    force=1; shift ;;
      --app-only) app_only=1; shift ;;
      *) err "Unknown argument: $1" ;;
    esac
  done

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook
  mkdir -p "$WORK_DIR"

  local ansible_hash app_hash
  ansible_hash=$(compute_layer_hash "$REPO_ROOT/deploy/pi/ansible")
  app_hash=$(compute_layer_hash "$REPO_ROOT/packages" "$REPO_ROOT/pnpm-lock.yaml" "$REPO_ROOT/turbo.json")

  # --- Layer 1: Base system ---------------------------------------------------
  local base_changed=0
  if [[ $app_only -eq 1 ]]; then
    [[ -f "$BASE_IMAGE" ]] || err "No base image found at $BASE_IMAGE. Run without --app-only first."
    [[ -f "$KERNEL" ]] || err "No virt kernel found at $KERNEL. Run without --app-only first."
    log "Skipping base layer (--app-only)."
  elif [[ -f "$BASE_IMAGE" ]] && [[ "$(cat "$WORK_DIR/base-hash" 2>/dev/null)" == "$ansible_hash" ]] && [[ $force -eq 0 ]]; then
    log "Base system cached (Ansible unchanged). Skipping to app deployment."
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

  # --- Layer 2: App deployment ------------------------------------------------
  if [[ -f "$GOLDEN_IMAGE" ]] && [[ "$(cat "$WORK_DIR/app-hash" 2>/dev/null)" == "$app_hash" ]] && [[ $base_changed -eq 0 ]] && [[ $force -eq 0 ]]; then
    log "App layer cached. Golden image is up to date."
  else
    log "Building app deployment layer..."
    create_cow_overlay "$BASE_IMAGE" "$DISK_IMAGE"
    boot_qemu
    deploy_app
    setup_wifi_simulation
    shutdown_and_snapshot
    echo "$app_hash" > "$WORK_DIR/app-hash"
  fi
}

main "$@"
