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

    # Escape SSID for JSON
    SAFE_SSID=$(printf '%s' "$ACTIVE_SSID" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CURRENT="{\"ssid\":\"$SAFE_SSID\",\"signal\":$RSSI}"
fi

# Ethernet status
ETHERNET="false"
if [ -f /sys/class/net/eth0/carrier ] && [ "$(cat /sys/class/net/eth0/carrier 2>/dev/null)" = "1" ]; then
    ETHERNET="true"
fi

# Saved networks (wifi connection profiles managed by NM)
SAVED=$(nmcli -t -f NAME,TYPE connection show 2>/dev/null | { grep ':802-11-wireless$' || true; } | cut -d: -f1 | awk '
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

echo "{\"current\":$CURRENT,\"ethernet\":$ETHERNET,\"saved\":$SAVED}"
