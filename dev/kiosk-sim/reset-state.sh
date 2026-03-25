#!/usr/bin/env bash
# Resets mock WiFi state to initial seed values.
# Called between integration tests.
set -euo pipefail

STATE_DIR="/tmp/mock-wifi-state"
WPA_CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"

# Re-seed scan results from env (or keep existing scan.json)
if [ -n "${MOCK_WIFI_NETWORKS:-}" ]; then
    echo "$MOCK_WIFI_NETWORKS" > "$STATE_DIR/scan.json"
fi

# Reset connected state
echo "null" > "$STATE_DIR/connected.json"

# Reset saved networks
echo '[]' > "$STATE_DIR/networks.json"

# Reset wpa_supplicant.conf
cat > "$WPA_CONF" <<'HEADER'
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=0
country=US
HEADER
chmod 600 "$WPA_CONF"

# Reset ethernet carrier
CARRIER_PATH="${CARRIER_PATH:-/sys/class/net/eth0/carrier}"
mkdir -p "$(dirname "$CARRIER_PATH")"
echo "${MOCK_ETHERNET_CARRIER:-1}" > "$CARRIER_PATH"

echo '{"ok": true}'
