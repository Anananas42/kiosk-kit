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

# --- Test framework -----------------------------------------------------------

PASS=0
FAIL=0
SKIP=0

log()      { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
log_test() { printf '\033[1;33m  TEST:\033[0m %s... ' "$*"; }
pass()     { printf '\033[1;32mPASS\033[0m\n'; PASS=$((PASS + 1)); }
fail()     { printf '\033[1;31mFAIL\033[0m — %s\n' "$*"; FAIL=$((FAIL + 1)); }
skip()     { printf '\033[1;33mSKIP\033[0m — %s\n' "$*"; SKIP=$((SKIP + 1)); }

export SSH_ASKPASS=""
export SSH_ASKPASS_REQUIRE=never
# Prefer output dir (works after Docker builds); fall back to work dir.
if [[ -f "$SCRIPT_DIR/.output/build-ssh-key" ]]; then
  BUILD_SSH_KEY="$SCRIPT_DIR/.output/build-ssh-key"
else
  BUILD_SSH_KEY="$SCRIPT_DIR/.work/build/build-ssh-key"
fi
SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5)

remote() {
  if [[ -f "$BUILD_SSH_KEY" ]]; then
    ssh -i "$BUILD_SSH_KEY" "${SSH_OPTS[@]}" -p "$SSH_PORT" pi@localhost "$@" 2>/dev/null
  else
    sshpass -p raspberry ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" pi@localhost "$@" 2>/dev/null
  fi
}

# Assert that a remote command succeeds.
assert_remote() {
  local name=$1 cmd=$2 fail_msg=$3
  log_test "$name"
  if remote "$cmd"; then
    pass
  else
    fail "$fail_msg"
  fi
}

# Assert that a remote command's output matches a pattern.
assert_remote_grep() {
  local name=$1 cmd=$2 pattern=$3 fail_msg=$4
  log_test "$name"
  if remote "$cmd" | grep -qi "$pattern"; then
    pass
  else
    fail "$fail_msg"
  fi
}

# --- Boot management ---------------------------------------------------------

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
  if [[ "${BOOT_MANAGED:-0}" -eq 1 && -f "$SCRIPT_DIR/.work/run/qemu.pid" ]]; then
    local pid
    pid=$(cat "$SCRIPT_DIR/.work/run/qemu.pid")
    if kill -0 "$pid" 2>/dev/null; then
      log "Shutting down QEMU (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  fi
}
trap cleanup_qemu EXIT

ensure_booted() {
  local skip_boot=$1
  if [[ $skip_boot -eq 0 ]]; then
    BOOT_MANAGED=1
    log "Booting golden image for testing..."
    "$SCRIPT_DIR/run.sh" --bg
    wait_for_ssh 180
  else
    log "Skipping boot — assuming QEMU is already running."
    remote true || { echo "FATAL: Cannot reach SSH on port $SSH_PORT" >&2; exit 1; }
  fi
}

# --- Test groups --------------------------------------------------------------

test_system_basics() {
  assert_remote \
    "SSH connectivity" \
    "echo ok" \
    "cannot execute commands via SSH"

  assert_remote_grep \
    "Raspberry Pi OS detected" \
    "cat /etc/os-release" \
    "raspberry\|debian" \
    "unexpected OS"
}

test_kiosk_app() {
  assert_remote \
    "Kiosk user exists" \
    "id kiosk" \
    "kiosk user not found"

  assert_remote \
    "Node.js available" \
    "node --version" \
    "node not found"

  assert_remote \
    "pnpm available" \
    "pnpm --version" \
    "pnpm not found"

  assert_remote \
    "KioskKit app directory exists" \
    "test -d /opt/kioskkit" \
    "/opt/kioskkit not found"

  assert_remote \
    "kioskkit.service unit exists" \
    "systemctl cat kioskkit.service" \
    "kioskkit.service not found"

  assert_remote_grep \
    "kioskkit.service is enabled" \
    "systemctl is-enabled kioskkit.service" \
    "enabled" \
    "kioskkit.service not enabled"

  assert_remote \
    "Kiosk server health endpoint (port $KIOSK_PORT)" \
    "curl -sf -o /dev/null http://localhost:$KIOSK_PORT/api/health" \
    "kiosk server not responding on port $KIOSK_PORT"

  assert_remote_grep \
    "Kiosk UI serves HTML at /" \
    "curl -sf http://localhost:$KIOSK_PORT/" \
    "<html" \
    "expected HTML response from kiosk server"
}

test_wifi() {
  assert_remote \
    "NetworkManager running" \
    "systemctl is-active --quiet NetworkManager" \
    "NetworkManager not running"

  log_test "WiFi management scripts deployed"
  local scripts_ok=1
  for script in wifi-scan.sh wifi-connect.sh wifi-forget.sh wifi-status.sh; do
    if ! remote test -x "/opt/kioskkit/system/$script"; then
      scripts_ok=0
      break
    fi
  done
  if [[ $scripts_ok -eq 1 ]]; then
    pass
  else
    fail "one or more WiFi scripts missing from /opt/kioskkit/system/"
  fi

  log_test "mac80211_hwsim kernel module"
  if remote lsmod | grep -q mac80211_hwsim; then
    pass
  elif remote sudo modprobe mac80211_hwsim radios=2 2>/dev/null && remote lsmod | grep -q mac80211_hwsim; then
    pass
  else
    skip "mac80211_hwsim not available in this kernel"
  fi

  log_test "Simulated WiFi interface (wlan0)"
  if remote ip link show wlan0 >/dev/null 2>&1; then
    pass
  elif remote lsmod | grep -q mac80211_hwsim; then
    fail "mac80211_hwsim loaded but no wlan0 interface"
  else
    skip "depends on mac80211_hwsim"
  fi
}

test_partition_layout() {
  assert_remote_grep \
    "Data partition mounted at /data" \
    "mount | grep /data" \
    "/data" \
    "/data partition not mounted"

  assert_remote \
    "OTA boot-slot file exists" \
    "test -f /data/ota/boot-slot" \
    "/data/ota/boot-slot not found"

  assert_remote_grep \
    "Boot slot is A" \
    "cat /data/ota/boot-slot" \
    "A" \
    "boot-slot is not A"

  assert_remote \
    "OTA state.json exists" \
    "test -f /data/ota/state.json" \
    "/data/ota/state.json not found"

  log_test "Bind mount: /opt/kioskkit/data -> /data/kioskkit"
  if remote "mount | grep '/opt/kioskkit/data'" | grep -q "bind\|/data/kioskkit"; then
    pass
  elif remote "findmnt /opt/kioskkit/data" | grep -q "/data/kioskkit"; then
    pass
  else
    skip "bind mount may not be active in build image"
  fi

  assert_remote \
    "Boot-confirm service unit exists" \
    "systemctl cat kioskkit-boot-confirm.service" \
    "kioskkit-boot-confirm.service not found"

  log_test "OTA scripts deployed"
  local ota_ok=1
  for script in ota-download.sh ota-install.sh ota-rollback.sh boot-confirm.sh; do
    if ! remote test -x "/opt/kioskkit/system/$script"; then
      ota_ok=0
      break
    fi
  done
  if [[ $ota_ok -eq 1 ]]; then
    pass
  else
    fail "one or more OTA scripts missing from /opt/kioskkit/system/"
  fi
}

test_security() {
  log_test "nftables firewall active"
  local nft_out
  nft_out=$(remote "sudo nft list ruleset 2>&1") || true
  if echo "$nft_out" | grep -q "table"; then
    pass
  elif echo "$nft_out" | grep -qi "not supported\|Protocol not supported"; then
    skip "nftables not supported in QEMU virt kernel"
  else
    fail "nftables has no rules loaded"
  fi

  log_test "SSH password authentication disabled"
  if remote grep -qi "^PasswordAuthentication no" /etc/ssh/sshd_config 2>/dev/null; then
    pass
  elif remote grep -rqi "PasswordAuthentication no" /etc/ssh/sshd_config.d/ 2>/dev/null; then
    pass
  else
    fail "password authentication may still be enabled"
  fi
}

# --- Main --------------------------------------------------------------------

main() {
  local skip_boot=0
  for arg in "$@"; do
    case "$arg" in
      --skip-boot) skip_boot=1 ;;
      *)           echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
  done

  ensure_booted "$skip_boot"

  log "Running smoke tests..."
  echo ""

  test_system_basics
  test_kiosk_app
  test_partition_layout
  test_wifi
  test_security

  echo ""
  log "Results: $PASS passed, $FAIL failed, $SKIP skipped (total $((PASS + FAIL + SKIP)))"

  [[ $FAIL -gt 0 ]] && exit 1
  exit 0
}

main "$@"
