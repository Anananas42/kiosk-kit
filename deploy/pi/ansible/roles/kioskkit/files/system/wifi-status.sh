#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Reports WiFi connection status as JSON via NetworkManager.
set -euo pipefail

# Current connection
CURRENT="null"
ACTIVE_SSID=$(nmcli -t -f active,ssid dev wifi 2>/dev/null | grep '^yes:' | cut -d: -f2- || true)

if [ -n "$ACTIVE_SSID" ]; then
    # Get signal strength (0-100 from NM, convert to approximate dBm)
    SIGNAL=$(nmcli -t -f active,signal dev wifi 2>/dev/null | grep '^yes:' | cut -d: -f2 || echo "0")
    # NM reports 0-100 percentage; approximate dBm = (signal/2) - 100
    RSSI=$(( (SIGNAL / 2) - 100 ))

    # Determine security from nmcli active connection security field
    SECURITY_FIELD=$(nmcli -t -f active,security dev wifi 2>/dev/null | grep '^yes:' | cut -d: -f2- || true)
    if [ -z "$SECURITY_FIELD" ] || [ "$SECURITY_FIELD" = "--" ]; then
        CURRENT_SECURITY="open"
    else
        CURRENT_SECURITY="wpa"
    fi

    # Escape SSID for JSON
    SAFE_SSID=$(printf '%s' "$ACTIVE_SSID" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CURRENT="{\"ssid\":\"$SAFE_SSID\",\"signal\":$RSSI,\"security\":\"$CURRENT_SECURITY\"}"
fi

# Ethernet status
ETHERNET="false"
if [ -f /sys/class/net/eth0/carrier ] && [ "$(cat /sys/class/net/eth0/carrier 2>/dev/null)" = "1" ]; then
    ETHERNET="true"
fi

# Saved networks (wifi connection profiles managed by NM, with security info)
SAVED=$(nmcli -t -f NAME,TYPE connection show 2>/dev/null | { grep ':802-11-wireless$' || true; } | cut -d: -f1 | while IFS= read -r name; do
    # Check if connection has WPA security configured
    KEY_MGMT=$(nmcli -t -f 802-11-wireless-security.key-mgmt connection show "$name" 2>/dev/null | cut -d: -f2 || true)
    if [ -n "$KEY_MGMT" ] && [ "$KEY_MGMT" != "--" ]; then
        sec="wpa"
    else
        sec="open"
    fi
    # Escape for JSON
    safe=$(printf '%s' "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '%s\t%s\n' "$safe" "$sec"
done | awk -F'\t' '
    BEGIN { printf "[" }
    NR > 1 { printf "," }
    {
        printf "{\"ssid\":\"%s\",\"security\":\"%s\"}", $1, $2
    }
    END { printf "]" }
')

echo "{\"current\":$CURRENT,\"ethernet\":$ETHERNET,\"saved\":$SAVED}"
