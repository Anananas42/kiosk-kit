#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Enables WiFi radio and starts wpa_supplicant. Idempotent. Requires sudo.
set -euo pipefail

CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"

# Create minimal config if missing (first-time enable)
if [ ! -f "$CONF" ]; then
    cat > "$CONF" <<'EOF'
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US
EOF
    chmod 600 "$CONF"
fi

rfkill unblock wifi 2>/dev/null || true
ip link set wlan0 up 2>/dev/null || true
systemctl enable --now wpa_supplicant@wlan0.service

echo '{"ok": true, "wifi": "enabled"}'
