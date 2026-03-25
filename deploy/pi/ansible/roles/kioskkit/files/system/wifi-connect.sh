#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Connects to a WiFi network. Requires sudo.
# Usage: wifi-connect.sh <ssid> [password]
set -euo pipefail

CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"
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

# Ensure config file exists with header
if [ ! -f "$CONF" ]; then
    cat > "$CONF" <<'HEADER'
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=0
country=US
HEADER
    chmod 600 "$CONF"
fi

# Find highest existing priority
MAX_PRIO=$(grep -oP 'priority=\K[0-9]+' "$CONF" 2>/dev/null | sort -rn | head -1)
NEW_PRIO=$(( ${MAX_PRIO:-0} + 1 ))

# Remove existing network block for this SSID (if any) to avoid duplicates
# Uses awk to remove the entire network={...} block matching the SSID
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

# Append new network block
if [ -n "$PASSWORD" ]; then
    # WPA/WPA2/WPA3 network
    PSK=$(wpa_passphrase "$SSID" "$PASSWORD" 2>/dev/null | grep -oP '^\s+psk=\K[0-9a-f]+') || {
        echo '{"error": "Failed to generate PSK"}'
        exit 1
    }
    cat >> "$CONF" <<EOF

network={
    ssid="$SSID"
    psk=$PSK
    priority=$NEW_PRIO
}
EOF
else
    # Open network
    cat >> "$CONF" <<EOF

network={
    ssid="$SSID"
    key_mgmt=NONE
    priority=$NEW_PRIO
}
EOF
fi

# Apply configuration
wpa_cli -i wlan0 reconfigure >/dev/null 2>&1 || {
    echo '{"error": "wpa_cli reconfigure failed"}'
    exit 1
}

echo '{"ok": true}'
