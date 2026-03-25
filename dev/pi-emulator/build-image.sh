#!/usr/bin/env bash
# build-image.sh — Download Pi OS, boot in QEMU, provision with Ansible, snapshot golden image.
#
# Prerequisites: qemu-system-aarch64, qemu-img, qemu-efi-aarch64, guestfish (libguestfs-tools)
#
# Usage: ./build-image.sh [--force]
#   --force   Rebuild the golden image even if it already exists.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Configuration -----------------------------------------------------------

# Raspberry Pi OS Lite (64-bit, Bookworm) — update URL when new releases ship.
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
PIOS_CHECKSUM="a0dc4251e73151e4109d0c499aba04dae7afbbcfaac54afa1ea1b55f75764f0d"

SSH_PORT=2222
QEMU_RAM="2G"
QEMU_CPUS=4

WORK_DIR="$SCRIPT_DIR/.work"
GOLDEN_IMAGE="$SCRIPT_DIR/golden.qcow2"
UEFI_FW="$WORK_DIR/QEMU_EFI.fd"
UEFI_VARS="$WORK_DIR/efivars.fd"
RAW_IMAGE="$WORK_DIR/raspios.img"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

# --- Utilities ---------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || err "Required command not found: $cmd"
  done
}

wait_for_ssh() {
  local port=$1 timeout=${2:-120}
  log "Waiting up to ${timeout}s for SSH on port $port..."
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -o UserKnownHostsFile=/dev/null \
         -p "$port" pi@localhost true 2>/dev/null; then
      log "SSH is up."
      return 0
    fi
    sleep 3
  done
  err "SSH did not become available within ${timeout}s"
}

cleanup_qemu() {
  if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
    log "Shutting down QEMU (PID $QEMU_PID)..."
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
}
trap cleanup_qemu EXIT

# --- Domain functions --------------------------------------------------------

download_pios() {
  [[ -f "$RAW_IMAGE" ]] && return 0
  log "Downloading Raspberry Pi OS Lite..."
  local local_xz="$WORK_DIR/raspios.img.xz"
  curl -fL -o "$local_xz" "$PIOS_URL"
  log "Verifying checksum..."
  echo "$PIOS_CHECKSUM  $local_xz" | sha256sum -c - || err "Checksum mismatch for downloaded image"
  log "Decompressing..."
  xz -d "$local_xz"
}

prepare_disk() {
  log "Converting to qcow2 and resizing to 8G..."
  qemu-img convert -f raw -O qcow2 "$RAW_IMAGE" "$DISK_IMAGE"
  qemu-img resize "$DISK_IMAGE" 8G
}

patch_image_for_virt() {
  log "Patching image for QEMU virt machine (this takes a few minutes)..."
  guestfish --rw -a "$DISK_IMAGE" <<'GUESTFISH_SCRIPT'
run

list-partitions

# Resize the root partition to fill the disk
resize2fs /dev/sda2

# Mount root and boot
mount /dev/sda2 /
mount /dev/sda1 /boot/firmware

# Enable SSH
touch /boot/firmware/ssh

# Set a known password for the pi user (raspberry)
# Generate password hash: openssl passwd -6 raspberry
write /boot/firmware/userconf "pi:$6$rpi$PFE1MajCJkWCfVJz0Rk1O7MNlUjwPnSRzFiGBVPFH.ghCKYtY3vOJ8RLVB0R.dEfDLzCiNlQ3Gb/xf7GRWRA0"

# Fix fstab to use /dev/vda* instead of PARTUUIDs (required for virtio-blk)
write /etc/fstab "/dev/vda2  /              ext4  defaults,noatime  0  1
/dev/vda1  /boot/firmware  vfat  defaults          0  2
"

# Install the Debian arm64 kernel with virtio support.
# Pi OS is bookworm-based, so the Debian bookworm main repo is compatible.
command "apt-get update"
command "DEBIAN_FRONTEND=noninteractive apt-get install -y linux-image-arm64"

GUESTFISH_SCRIPT
}

setup_uefi_firmware() {
  log "Setting up UEFI firmware..."
  if [[ ! -f "$UEFI_FW" ]]; then
    for fw_path in \
      /usr/share/qemu-efi-aarch64/QEMU_EFI.fd \
      /usr/share/AAVMF/AAVMF_CODE.fd \
      /usr/share/edk2/aarch64/QEMU_EFI.fd; do
      if [[ -f "$fw_path" ]]; then
        cp "$fw_path" "$UEFI_FW"
        break
      fi
    done
    [[ -f "$UEFI_FW" ]] || err "Cannot find QEMU_EFI.fd — install qemu-efi-aarch64"
    truncate -s 64M "$UEFI_FW"
  fi
  if [[ ! -f "$UEFI_VARS" ]]; then
    truncate -s 64M "$UEFI_VARS"
  fi
}

boot_qemu_for_provisioning() {
  log "Booting QEMU for Ansible provisioning..."
  qemu-system-aarch64 \
    -M virt -cpu cortex-a72 -m "$QEMU_RAM" -smp "$QEMU_CPUS" \
    -drive if=pflash,format=raw,file="$UEFI_FW",readonly=on \
    -drive if=pflash,format=raw,file="$UEFI_VARS" \
    -drive if=virtio,file="$DISK_IMAGE",format=qcow2 \
    -nic user,model=virtio,hostfwd=tcp::${SSH_PORT}-:22 \
    -nographic \
    -daemonize \
    -pidfile "$WORK_DIR/qemu.pid"

  QEMU_PID=$(cat "$WORK_DIR/qemu.pid")
  log "QEMU started (PID $QEMU_PID)"
  wait_for_ssh "$SSH_PORT" 180
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
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
          # Tailscale is skipped in the emulator — use dummy values
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "emu-001"
          kioskkit_customer_tag: "emulator"
EOF

  ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale \
    -e "kioskkit_tailscale_auth_key=skip" \
    || { err "Ansible provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."; }
}

setup_wifi_simulation() {
  log "Setting up mac80211_hwsim for WiFi testing..."
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -p "$SSH_PORT" pi@localhost \
      "sudo modprobe mac80211_hwsim radios=2 2>/dev/null && echo 'mac80211_hwsim loaded' || echo 'WARN: mac80211_hwsim not available — WiFi simulation will be limited'"

  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -p "$SSH_PORT" pi@localhost \
      "echo 'mac80211_hwsim' | sudo tee /etc/modules-load.d/hwsim.conf >/dev/null; echo 'options mac80211_hwsim radios=2' | sudo tee /etc/modprobe.d/hwsim.conf >/dev/null"
}

deploy_kiosk_app() {
  log "Deploying kiosk application into the VM..."

  local inventory_file="$WORK_DIR/inventory.yml"

  ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || { err "Ansible deploy failed. QEMU VM is still running on port $SSH_PORT for debugging."; }

  log "Waiting for kioskkit.service to start..."
  sleep 5

  local retries=12
  for (( i=1; i<=retries; i++ )); do
    if ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
         -p "$SSH_PORT" pi@localhost \
         "curl -sf -o /dev/null http://localhost:3001/api/health" 2>/dev/null; then
      log "Kiosk server is healthy (port 3001)."
      return 0
    fi
    log "Health check attempt $i/$retries — waiting 5s..."
    sleep 5
  done

  err "Kiosk server health check failed after $retries attempts"
}

shutdown_and_snapshot() {
  log "Shutting down VM for snapshotting..."
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -p "$SSH_PORT" pi@localhost "sudo shutdown -h now" 2>/dev/null || true

  sleep 5
  if kill -0 "$QEMU_PID" 2>/dev/null; then
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
  unset QEMU_PID

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

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh ansible-playbook
  mkdir -p "$WORK_DIR"

  download_pios
  prepare_disk
  patch_image_for_virt
  setup_uefi_firmware
  boot_qemu_for_provisioning
  provision_with_ansible
  setup_wifi_simulation
  deploy_kiosk_app
  shutdown_and_snapshot
}

main "$@"
