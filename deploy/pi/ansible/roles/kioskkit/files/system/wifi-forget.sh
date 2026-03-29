#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Removes a saved WiFi network via NetworkManager. Requires sudo.
# Usage: wifi-forget.sh <ssid>
set -euo pipefail

SSID="${1:-}"

if [ -z "$SSID" ]; then
    echo '{"error": "SSID is required"}'
    exit 1
fi

# Validate SSID
if [ "${#SSID}" -gt 32 ]; then
    echo '{"error": "SSID must be 32 characters or fewer"}'
    exit 1
fi

# Check the connection exists
if ! nmcli -t -f NAME connection show | grep -qxF "$SSID"; then
    echo '{"error": "Network not found"}'
    exit 1
fi

nmcli connection delete "$SSID" 2>/dev/null || {
    echo '{"error": "Failed to remove network"}'
    exit 1
}

echo '{"ok": true}'
