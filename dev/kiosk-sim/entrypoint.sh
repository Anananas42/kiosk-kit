#!/usr/bin/env bash
# Entrypoint for the kiosk Pi simulator container.
# Initializes mock WiFi state and starts kiosk-server as the kiosk user.
set -euo pipefail

STATE_DIR="/tmp/mock-wifi-state"
WPA_CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"

echo "[sim] Initializing mock WiFi state..."

# Create state directory
mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$WPA_CONF")"

# Seed scan results (available networks in the "environment")
if [ -n "${MOCK_WIFI_NETWORKS:-}" ]; then
    echo "$MOCK_WIFI_NETWORKS" > "$STATE_DIR/scan.json"
else
    echo '[]' > "$STATE_DIR/scan.json"
fi

# No connected network initially
echo "null" > "$STATE_DIR/connected.json"

# Empty saved networks
echo '[]' > "$STATE_DIR/networks.json"

# Create initial wpa_supplicant.conf (empty — no saved networks)
cat > "$WPA_CONF" <<'HEADER'
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=0
country=US
HEADER
chmod 600 "$WPA_CONF"

# Create mock ethernet carrier file
CARRIER_PATH="${CARRIER_PATH:-/sys/class/net/eth0/carrier}"
mkdir -p "$(dirname "$CARRIER_PATH")"
echo "${MOCK_ETHERNET_CARRIER:-1}" > "$CARRIER_PATH"

# Make state writable by kiosk user
chown -R kiosk:kiosk "$STATE_DIR"
chmod -R 777 "$STATE_DIR"
chown kiosk:kiosk "$WPA_CONF"

echo "[sim] Starting kiosk-server on port 3001..."

# Start kiosk-server as kiosk user from the app directory
cd /app
exec su -s /bin/bash kiosk -c "NODE_ENV=${NODE_ENV:-production} PORT=3001 node packages/kiosk-server/dist/index.js"
