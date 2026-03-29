#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Enables WiFi radio via NetworkManager. Idempotent. Requires sudo.
set -euo pipefail

rfkill unblock wifi 2>/dev/null || true
nmcli radio wifi on

echo '{"ok": true, "wifi": "enabled"}'
