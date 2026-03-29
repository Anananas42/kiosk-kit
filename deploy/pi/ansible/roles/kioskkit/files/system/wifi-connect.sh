#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Connects to a WiFi network via NetworkManager. Requires sudo.
# Usage: wifi-connect.sh <ssid> [password]
set -euo pipefail

SSID="${1:-}"
PASSWORD="${2:-}"

if [ -z "$SSID" ]; then
    echo '{"error": "SSID is required"}'
    exit 1
fi

# Validate SSID: max 32 chars, no shell metacharacters
if [ "${#SSID}" -gt 32 ]; then
    echo '{"error": "SSID must be 32 characters or fewer"}'
    exit 1
fi

if [[ "$SSID" =~ [^a-zA-Z0-9\ _\.\-] ]]; then
    echo '{"error": "SSID contains invalid characters"}'
    exit 1
fi

# Validate password if provided
if [ -n "$PASSWORD" ]; then
    if [ "${#PASSWORD}" -lt 8 ] || [ "${#PASSWORD}" -gt 63 ]; then
        echo '{"error": "Password must be 8-63 characters"}'
        exit 1
    fi
    if [[ "$PASSWORD" =~ [^[:print:]] ]]; then
        echo '{"error": "Password contains invalid characters"}'
        exit 1
    fi
fi

# Ensure WiFi radio is on
rfkill unblock wifi 2>/dev/null || true
nmcli radio wifi on 2>/dev/null || true

# Delete existing connection profile for this SSID (if any) to avoid duplicates
nmcli connection delete "$SSID" 2>/dev/null || true

# Connect (creates a persistent connection profile automatically)
if [ -n "$PASSWORD" ]; then
    nmcli device wifi connect "$SSID" password "$PASSWORD" ifname wlan0 2>&1 || {
        echo '{"error": "Failed to connect to network"}'
        exit 1
    }
else
    nmcli device wifi connect "$SSID" ifname wlan0 2>&1 || {
        echo '{"error": "Failed to connect to network"}'
        exit 1
    }
fi

echo '{"ok": true}'
