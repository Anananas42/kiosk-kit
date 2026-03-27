#!/bin/bash
# tailscale-firstboot.sh — Authenticate Tailscale on first boot.
#
# Reads credentials from /etc/kioskkit/tailscale-firstboot.conf, runs
# tailscale up, then removes the config file and disables itself on success.
# On failure, exits non-zero so systemd retries on next boot.

set -euo pipefail

CONF="/etc/kioskkit/tailscale-firstboot.conf"

if [[ ! -f "$CONF" ]]; then
  echo "Config file $CONF not found — already authenticated?"
  exit 0
fi

# shellcheck source=/dev/null
source "$CONF"

echo "Authenticating Tailscale as kioskkit-${DEVICE_ID} (stage:${STAGE})..."

tailscale up \
  --authkey="$TAILSCALE_AUTH_KEY" \
  --hostname="kioskkit-${DEVICE_ID}"

echo "Tailscale authenticated successfully."

# Clean up — remove credentials and disable this one-shot service
rm -f "$CONF"
systemctl disable kioskkit-tailscale-firstboot.service

echo "First-boot service disabled. Tailscale is ready."
