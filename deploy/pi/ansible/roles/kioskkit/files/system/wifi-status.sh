#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Reports WiFi connection status as JSON.
# No sudo required.
set -euo pipefail

CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"

# Current connection
CURRENT="null"
WPA_STATUS=$(/sbin/wpa_cli -i wlan0 status 2>/dev/null) || true

CONNECTED_SSID=$(echo "$WPA_STATUS" | grep -oP '^ssid=\K.*' || true)
WPA_STATE=$(echo "$WPA_STATUS" | grep -oP '^wpa_state=\K.*' || true)

if [ "$WPA_STATE" = "COMPLETED" ] && [ -n "$CONNECTED_SSID" ]; then
    # Get signal strength
    SIGNAL_POLL=$(/sbin/wpa_cli -i wlan0 signal_poll 2>/dev/null) || true
    RSSI=$(echo "$SIGNAL_POLL" | grep -oP '^RSSI=\K-?[0-9]+' || echo "0")

    # Escape SSID for JSON
    SAFE_SSID=$(printf '%s' "$CONNECTED_SSID" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CURRENT="{\"ssid\":\"$SAFE_SSID\",\"signal\":$RSSI}"
fi

# Ethernet status
ETHERNET="false"
if [ -f /sys/class/net/eth0/carrier ] && [ "$(cat /sys/class/net/eth0/carrier 2>/dev/null)" = "1" ]; then
    ETHERNET="true"
fi

# Saved networks
SAVED="[]"
if [ -f "$CONF" ]; then
    SAVED=$( (grep -oP 'ssid="\K[^"]+' "$CONF" 2>/dev/null || true) | awk '
        BEGIN { printf "[" }
        NR > 1 { printf "," }
        {
            ssid = $0
            gsub(/\\/, "\\\\", ssid)
            gsub(/"/, "\\\"", ssid)
            printf "{\"ssid\":\"%s\"}", ssid
        }
        END { printf "]" }
    ')
fi

echo "{\"current\":$CURRENT,\"ethernet\":$ETHERNET,\"saved\":$SAVED}"
