#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Disables WiFi radio and stops wpa_supplicant. Idempotent. Requires sudo.
set -euo pipefail

systemctl disable --now wpa_supplicant@wlan0.service 2>/dev/null || true
ip link set wlan0 down 2>/dev/null || true
rfkill block wifi 2>/dev/null || true

echo '{"ok": true, "wifi": "disabled"}'
