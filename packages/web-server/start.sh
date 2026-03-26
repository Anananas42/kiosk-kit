#!/bin/sh
set -e

tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Wait for tailscaled to be ready
sleep 2

# If already authenticated (persistent volume has state), just reconnect
if tailscale status >/dev/null 2>&1; then
  tailscale up --hostname=kioskkit-web --advertise-tags=tag:server
else
  # First boot: register using OAuth client secret directly
  tailscale up \
    --auth-key="${TAILSCALE_OAUTH_CLIENT_SECRET}?ephemeral=false&preauthorized=true" \
    --hostname=kioskkit-web \
    --advertise-tags=tag:server
fi

node dist/index.js
