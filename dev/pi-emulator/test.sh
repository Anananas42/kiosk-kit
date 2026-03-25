#!/usr/bin/env bash
# test.sh — Boot the golden image and run smoke tests against it.
#
# Usage:
#   ./test.sh                  Run all smoke tests
#   ./test.sh --skip-boot      Skip booting QEMU (assume it's already running)
#
# Environment:
#   PI_EMU_SSH_PORT    SSH port (default: 2222)
#   PI_EMU_KIOSK_PORT  Kiosk server port (default: 3001)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SSH_PORT="${PI_EMU_SSH_PORT:-2222}"
KIOSK_PORT="${PI_EMU_KIOSK_PORT:-3001}"

# --- Helpers ------------------------------------------------------------------

PASS=0
FAIL=0
SKIP=0

log()      { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
log_test() { printf '\033[1;33m  TEST:\033[0m %s... ' "$*"; }
pass()     { printf '\033[1;32mPASS\033[0m\n'; ((PASS++)); }
fail()     { printf '\033[1;31mFAIL\033[0m — %s\n' "$*"; ((FAIL++)); }
skip()     { printf '\033[1;33mSKIP\033[0m — %s\n' "$*"; ((SKIP++)); }

SSH_CMD=(ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -p "$SSH_PORT" pi@localhost)

remote() {
  "${SSH_CMD[@]}" "$@" 2>/dev/null
}

wait_for_ssh() {
  local timeout=${1:-180}
  log "Waiting up to ${timeout}s for SSH on port $SSH_PORT..."
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if remote true; then
      log "SSH is up."
      return 0
    fi
    sleep 3
  done
  echo "FATAL: SSH did not become available within ${timeout}s" >&2
  exit 1
}

cleanup_qemu() {
  if [[ "${BOOT_MANAGED:-0}" -eq 1 && -f "$SCRIPT_DIR/.work/qemu.pid" ]]; then
    local pid
    pid=$(cat "$SCRIPT_DIR/.work/qemu.pid")
    if kill -0 "$pid" 2>/dev/null; then
      log "Shutting down QEMU (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  fi
}
trap cleanup_qemu EXIT

# --- Parse args ---------------------------------------------------------------

SKIP_BOOT=0
for arg in "$@"; do
  case "$arg" in
    --skip-boot) SKIP_BOOT=1 ;;
    *)           echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# --- Boot if needed -----------------------------------------------------------

if [[ $SKIP_BOOT -eq 0 ]]; then
  BOOT_MANAGED=1
  log "Booting golden image for testing..."
  "$SCRIPT_DIR/run.sh" --bg
  wait_for_ssh 180
else
  log "Skipping boot — assuming QEMU is already running."
  # Quick check that SSH is reachable
  remote true || { echo "FATAL: Cannot reach SSH on port $SSH_PORT" >&2; exit 1; }
fi

# --- Smoke tests --------------------------------------------------------------

log "Running smoke tests..."
echo ""

# 1. SSH connectivity (already verified, but make it an explicit test)
log_test "SSH connectivity"
if remote echo ok | grep -q ok; then
  pass
else
  fail "cannot execute commands via SSH"
fi

# 2. OS identification
log_test "Raspberry Pi OS detected"
if remote cat /etc/os-release | grep -qi "raspberry\|debian"; then
  pass
else
  fail "unexpected OS"
fi

# 3. Kiosk user exists
log_test "Kiosk user exists"
if remote id kiosk >/dev/null 2>&1; then
  pass
else
  fail "kiosk user not found"
fi

# 4. Node.js installed
log_test "Node.js available"
NODE_VERSION=$(remote node --version 2>/dev/null || echo "")
if [[ -n "$NODE_VERSION" ]]; then
  pass
else
  fail "node not found"
fi

# 5. pnpm installed
log_test "pnpm available"
if remote pnpm --version >/dev/null 2>&1; then
  pass
else
  fail "pnpm not found"
fi

# 6. KioskKit application directory exists
log_test "KioskKit app directory exists"
if remote test -d /opt/kioskkit; then
  pass
else
  fail "/opt/kioskkit not found"
fi

# 7. kioskkit systemd service exists
log_test "kioskkit.service unit exists"
if remote systemctl cat kioskkit.service >/dev/null 2>&1; then
  pass
else
  fail "kioskkit.service not found"
fi

# 8. kioskkit service starts (or at least doesn't crash immediately)
log_test "kioskkit.service is enabled"
if remote systemctl is-enabled kioskkit.service 2>/dev/null | grep -q "enabled"; then
  pass
else
  fail "kioskkit.service not enabled"
fi

# 9. wpa_supplicant installed
log_test "wpa_supplicant installed"
if remote which wpa_supplicant >/dev/null 2>&1; then
  pass
else
  fail "wpa_supplicant not found"
fi

# 10. WiFi scripts deployed
log_test "WiFi management scripts deployed"
WIFI_SCRIPTS_OK=1
for script in wifi-scan.sh wifi-connect.sh wifi-forget.sh wifi-status.sh; do
  if ! remote test -x "/opt/kioskkit/system/$script"; then
    WIFI_SCRIPTS_OK=0
    break
  fi
done
if [[ $WIFI_SCRIPTS_OK -eq 1 ]]; then
  pass
else
  fail "one or more WiFi scripts missing from /opt/kioskkit/system/"
fi

# 11. mac80211_hwsim module
log_test "mac80211_hwsim kernel module"
if remote lsmod | grep -q mac80211_hwsim; then
  pass
elif remote sudo modprobe mac80211_hwsim radios=2 2>/dev/null && remote lsmod | grep -q mac80211_hwsim; then
  pass
else
  skip "mac80211_hwsim not available in this kernel"
fi

# 12. Simulated WiFi interface (only if hwsim loaded)
log_test "Simulated WiFi interface (wlan0)"
if remote ip link show wlan0 >/dev/null 2>&1; then
  pass
elif remote lsmod | grep -q mac80211_hwsim; then
  fail "mac80211_hwsim loaded but no wlan0 interface"
else
  skip "depends on mac80211_hwsim"
fi

# 13. Firewall (nftables) active
log_test "nftables firewall active"
if remote sudo nft list ruleset 2>/dev/null | grep -q "table"; then
  pass
else
  fail "nftables has no rules loaded"
fi

# 14. Kiosk server responds on port 3001 (inside the VM)
log_test "Kiosk server health endpoint (port 3001)"
HEALTH=$(remote curl -sf http://localhost:3001/api/health 2>/dev/null || echo "")
if [[ -n "$HEALTH" ]]; then
  pass
else
  skip "kiosk server not running (may need app deployment)"
fi

# 15. Security: SSH password auth disabled
log_test "SSH password authentication disabled"
if remote grep -qi "^PasswordAuthentication no" /etc/ssh/sshd_config 2>/dev/null; then
  pass
else
  # Check for sshd_config.d drop-ins
  if remote grep -rqi "PasswordAuthentication no" /etc/ssh/sshd_config.d/ 2>/dev/null; then
    pass
  else
    fail "password authentication may still be enabled"
  fi
fi

# --- Results ------------------------------------------------------------------

echo ""
log "Results: $PASS passed, $FAIL failed, $SKIP skipped (total $((PASS + FAIL + SKIP)))"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
