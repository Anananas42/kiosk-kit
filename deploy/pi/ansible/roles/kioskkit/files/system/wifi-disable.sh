#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Disables WiFi radio via NetworkManager. Idempotent. Requires sudo.
set -euo pipefail

nmcli radio wifi off
rfkill block wifi 2>/dev/null || true

echo '{"ok": true, "wifi": "disabled"}'
