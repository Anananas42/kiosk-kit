#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Removes a saved WiFi network. Requires sudo.
# Usage: wifi-forget.sh <ssid>
set -euo pipefail

CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"
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

if [[ "$SSID" =~ [^a-zA-Z0-9\ _\.\-] ]]; then
    echo '{"error": "SSID contains invalid characters"}'
    exit 1
fi

if [ ! -f "$CONF" ]; then
    echo '{"error": "No WiFi configuration file found"}'
    exit 1
fi

# Check the network exists before trying to remove it
if ! grep -q "ssid=\"$SSID\"" "$CONF"; then
    echo '{"error": "Network not found"}'
    exit 1
fi

# Remove the network block matching this SSID
TEMP=$(mktemp)
awk -v target="$SSID" '
    /^network=\{/ { block = ""; inside = 1 }
    inside { block = block $0 "\n" }
    inside && /^\}/ {
        inside = 0
        if (block !~ "ssid=\"" target "\"") printf "%s", block
        next
    }
    !inside { print }
' "$CONF" > "$TEMP"
mv "$TEMP" "$CONF"
chmod 600 "$CONF"

# Apply configuration — wpa_supplicant auto-falls back to next saved network
wpa_cli -i wlan0 reconfigure >/dev/null 2>&1 || {
    echo '{"error": "wpa_cli reconfigure failed"}'
    exit 1
}

echo '{"ok": true}'
