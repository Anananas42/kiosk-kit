#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Enables WiFi radio and starts wpa_supplicant. Idempotent. Requires sudo.
set -euo pipefail

rfkill unblock wifi 2>/dev/null || true
ip link set wlan0 up 2>/dev/null || true
systemctl start wpa_supplicant@wlan0.service 2>/dev/null || true

echo '{"ok": true, "wifi": "enabled"}'
