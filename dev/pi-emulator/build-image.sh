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

# --- Docker re-exec ---------------------------------------------------------
# If not inside a container, rebuild and re-exec inside Docker.

if [ ! -f /.dockerenv ] && [ -z "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required when running outside a container" >&2; exit 1; }
  echo "==> Building pi-emulator Docker image..."
  docker build -t kioskkit-pi-emulator "$REPO_ROOT/deploy/pi"
  echo "==> Re-executing inside container..."
  DOCKER_TTY_FLAG=""
  if [ -t 0 ]; then DOCKER_TTY_FLAG="-it"; fi
  # shellcheck disable=SC2086
  exec docker run --rm $DOCKER_TTY_FLAG \
    -e KIOSKKIT_IN_CONTAINER=1 \
    ${PI_EMU_RAM:+-e PI_EMU_RAM="$PI_EMU_RAM"} \
    ${PI_EMU_CPUS:+-e PI_EMU_CPUS="$PI_EMU_CPUS"} \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$SCRIPT_DIR/.work:/build" \
    -v "$SCRIPT_DIR/.output:/output" \
    --entrypoint /workspace/dev/pi-emulator/build-image.sh \
    kioskkit-pi-emulator "$@"
fi

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
# shellcheck disable=SC2034
_emu_half_cpus=$(( $(nproc) / 2 ))
# shellcheck disable=SC2034
QEMU_CPUS="${PI_EMU_CPUS:-$(( _emu_half_cpus > 8 ? 8 : _emu_half_cpus ))}"

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

GOLDEN_IMAGE="$OUTPUT_DIR/golden.qcow2"
# shellcheck disable=SC2034
CACHE_DIR="$WORK_DIR/cache"
# shellcheck disable=SC2034
BOOT_DIR="$WORK_DIR/boot"
# shellcheck disable=SC2034
BUILD_DIR="$WORK_DIR/build"
# shellcheck disable=SC2034
RUN_DIR="$WORK_DIR/run"
# shellcheck disable=SC2034
KERNEL="$BOOT_DIR/vmlinuz"
# shellcheck disable=SC2034
INITRD="$BOOT_DIR/initrd.img"
# shellcheck disable=SC2034
RAW_IMAGE="$CACHE_DIR/raspios.img"
DISK_IMAGE="$BUILD_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

BASE_IMAGE="$CACHE_DIR/provisioned-base.qcow2"

# shellcheck source=../../deploy/pi/lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Emulator-specific functions ---------------------------------------------

# write_inventory — create the Ansible inventory file used by both layers.
# Called once from main() so the inventory exists even when Layer 1 is cached.
write_inventory() {
  local inventory_file="$BUILD_DIR/inventory.yml"
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
}

# provision_base — run provision.yml skipping tailscale and app tags (Layer 1).
provision_base() {
  log "Running Ansible base provisioning (--skip-tags tailscale,app)..."

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$BUILD_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale,app \
    -e "kioskkit_tailscale_auth_key=skip" \
    || { err "Ansible base provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."; }
}

# deploy_app — run deploy.yml to sync code and build the application (Layer 2).
deploy_app() {
  log "Deploying kiosk application into the VM..."

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$BUILD_DIR/inventory.yml" \
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

  log "Dumping kioskkit.service status and logs for debugging..."
  ssh_pi "systemctl status kioskkit.service" || true
  ssh_pi "journalctl -u kioskkit.service --no-pager -n 30" || true
  err "Kiosk server health check failed after $retries attempts"
}

setup_wifi_simulation() {
  log "Setting up mac80211_hwsim for WiFi testing..."
  ssh_pi "sudo modprobe mac80211_hwsim radios=2 2>/dev/null && echo 'mac80211_hwsim loaded' || echo 'WARN: mac80211_hwsim not available — WiFi simulation will be limited'"

  ssh_pi "echo 'mac80211_hwsim' | sudo tee /etc/modules-load.d/hwsim.conf >/dev/null; echo 'options mac80211_hwsim radios=2' | sudo tee /etc/modprobe.d/hwsim.conf >/dev/null"

  # Disable wpa_supplicant@wlan0 to prevent boot stalls when mac80211_hwsim
  # can't load (e.g. inside Docker where the kernel module isn't available).
  # WiFi scripts still work when the module IS available.
  ssh_pi "sudo systemctl disable wpa_supplicant@wlan0.service 2>/dev/null || true"
}

initialize_ota_state() {
  log "Initializing OTA state on data partition..."
  guestfish --rw -a "$DISK_IMAGE" <<'EOF'
run
mount /dev/sda4 /
mkdir-p /ota
mkdir-p /ota/pending
write /ota/boot-slot "A"
write /ota/state.json "{\"status\":\"idle\",\"slot\":\"A\"}"
EOF
}

shutdown_and_snapshot() {
  shutdown_qemu

  # Initialize OTA state on the data partition (guestfish on cold image)
  initialize_ota_state

  log "Creating golden image..."
  flatten_overlay "$DISK_IMAGE" "$GOLDEN_IMAGE"

  # Copy boot files and SSH key to output so run.sh/test.sh can find them
  # even when the build ran inside Docker with separate volumes.
  cp "$KERNEL" "$OUTPUT_DIR/vmlinuz"
  cp "$INITRD" "$OUTPUT_DIR/initrd.img"
  cp "$BUILD_SSH_KEY" "$OUTPUT_DIR/build-ssh-key"
  cp "${BUILD_SSH_KEY}.pub" "$OUTPUT_DIR/build-ssh-key.pub"

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
  mkdir -p "$CACHE_DIR" "$BOOT_DIR" "$BUILD_DIR" "$RUN_DIR" "$OUTPUT_DIR"

  # Set BUILD_SSH_KEY path early so write_inventory can reference it.
  # The key itself is generated in create_pi_user() during Layer 1; on cached
  # runs the file already exists on disk.
  BUILD_SSH_KEY="$BUILD_DIR/build-ssh-key"
  write_inventory

  local ansible_hash app_hash
  ansible_hash=$(compute_layer_hash "$REPO_ROOT/deploy/pi/ansible")
  app_hash=$(compute_layer_hash "$REPO_ROOT/packages" "$REPO_ROOT/pnpm-lock.yaml" "$REPO_ROOT/turbo.json")

  # --- Layer 1: Base system ---------------------------------------------------
  local base_changed=0
  if [[ $app_only -eq 1 ]]; then
    [[ -f "$BASE_IMAGE" ]] || err "No base image found at $BASE_IMAGE. Run without --app-only first."
    [[ -f "$KERNEL" ]] || err "No virt kernel found at $KERNEL. Run without --app-only first."
    log "Skipping base layer (--app-only)."
  elif [[ -f "$BASE_IMAGE" ]] && [[ "$(cat "$CACHE_DIR/base-hash" 2>/dev/null)" == "$ansible_hash" ]] && [[ $force -eq 0 ]]; then
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
    setup_wifi_simulation
    shutdown_qemu
    cp "$DISK_IMAGE" "$BASE_IMAGE"
    echo "$ansible_hash" > "$CACHE_DIR/base-hash"
    log "Base system layer cached."
  fi

  # --- Layer 2: App deployment ------------------------------------------------
  if [[ -f "$GOLDEN_IMAGE" ]] && [[ "$(cat "$CACHE_DIR/app-hash" 2>/dev/null)" == "$app_hash" ]] && [[ $base_changed -eq 0 ]] && [[ $force -eq 0 ]]; then
    log "App layer cached. Golden image is up to date."
  else
    log "Building app deployment layer..."
    create_cow_overlay "$BASE_IMAGE" "$DISK_IMAGE"
    boot_qemu
    deploy_app
    shutdown_and_snapshot
    echo "$app_hash" > "$CACHE_DIR/app-hash"
  fi
}

main "$@"
