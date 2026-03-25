#!/usr/bin/env bash
# run.sh — Boot the golden image in QEMU with a copy-on-write overlay.
#
# The golden image stays clean; all changes go to a temporary overlay that is
# discarded on shutdown (unless --persist is passed).
#
# Usage:
#   ./run.sh              Boot and print SSH connection info
#   ./run.sh --persist    Keep overlay changes after shutdown
#   ./run.sh --bg         Run in background (daemonize)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Configuration -----------------------------------------------------------

GOLDEN_IMAGE="$SCRIPT_DIR/golden.qcow2"
WORK_DIR="$SCRIPT_DIR/.work"
OVERLAY="$WORK_DIR/overlay.qcow2"

SSH_PORT="${PI_EMU_SSH_PORT:-2222}"
KIOSK_PORT="${PI_EMU_KIOSK_PORT:-3001}"
QEMU_RAM="${PI_EMU_RAM:-2G}"
QEMU_CPUS="${PI_EMU_CPUS:-4}"

KERNEL="$WORK_DIR/vmlinuz"
INITRD="$WORK_DIR/initrd.img"

# --- Helpers ------------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Parse args ---------------------------------------------------------------

PERSIST=0
DAEMONIZE=0
for arg in "$@"; do
  case "$arg" in
    --persist) PERSIST=1 ;;
    --bg)      DAEMONIZE=1 ;;
    *)         err "Unknown argument: $arg" ;;
  esac
done

# --- Pre-flight ---------------------------------------------------------------

[[ -f "$GOLDEN_IMAGE" ]] || err "Golden image not found. Run ./build-image.sh first."
[[ -f "$KERNEL" ]] || err "Kernel not found at $KERNEL — run ./build-image.sh first."
[[ -f "$INITRD" ]] || err "Initrd not found at $INITRD — run ./build-image.sh first."
command -v qemu-system-aarch64 >/dev/null 2>&1 || err "qemu-system-aarch64 not found"

# --- Create overlay -----------------------------------------------------------

mkdir -p "$WORK_DIR"

if [[ -f "$OVERLAY" && $PERSIST -eq 0 ]]; then
  rm -f "$OVERLAY"
fi

if [[ ! -f "$OVERLAY" ]]; then
  log "Creating copy-on-write overlay..."
  qemu-img create -f qcow2 -b "$GOLDEN_IMAGE" -F qcow2 "$OVERLAY"
fi

# --- Boot QEMU ----------------------------------------------------------------

QEMU_ARGS=(
  -M virt -cpu cortex-a72 -m "$QEMU_RAM" -smp "$QEMU_CPUS"
  -kernel "$KERNEL"
  -initrd "$INITRD"
  -append "root=/dev/vda2 rw console=ttyAMA0 earlycon=pl011,0x09000000 panic=-1"
  -drive "if=virtio,file=$OVERLAY,format=qcow2"
  -nic "user,model=virtio,hostfwd=tcp::${SSH_PORT}-:22,hostfwd=tcp::${KIOSK_PORT}-:3001"
)

if [[ $DAEMONIZE -eq 1 ]]; then
  QEMU_ARGS+=(-display none -serial null -daemonize -pidfile "$WORK_DIR/qemu.pid")
  qemu-system-aarch64 "${QEMU_ARGS[@]}"
  QEMU_PID=$(cat "$WORK_DIR/qemu.pid")
  log "QEMU running in background (PID $QEMU_PID)"
else
  QEMU_ARGS+=(-nographic)
  log "Booting Pi emulator..."
fi

log ""
log "SSH:   ssh -p $SSH_PORT pi@localhost"
log "Kiosk: http://localhost:$KIOSK_PORT"
log ""

if [[ $DAEMONIZE -eq 0 ]]; then
  log "Press Ctrl-A X to exit QEMU."
  exec qemu-system-aarch64 "${QEMU_ARGS[@]}"
fi
