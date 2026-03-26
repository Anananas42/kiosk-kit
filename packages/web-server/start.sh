#!/bin/sh
set -e

tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Wait for tailscaled to be ready
sleep 2

# If already authenticated (persistent volume has state), just reconnect
if tailscale status >/dev/null 2>&1; then
  tailscale up --hostname=kioskkit-web --advertise-tags=tag:server
else
  # First boot: exchange OAuth credentials for an auth key
  token_response=$(curl -fsS --max-time 30 \
    -d "client_id=${TAILSCALE_OAUTH_CLIENT_ID}" \
    -d "client_secret=${TAILSCALE_OAUTH_CLIENT_SECRET}" \
    "https://api.tailscale.com/api/v2/oauth/token")

  access_token=$(printf '%s' "$token_response" | jq -r '.access_token')

  key_response=$(curl -fsS --max-time 30 \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d '{"capabilities":{"devices":{"create":{"reusable":false,"ephemeral":false,"tags":["tag:server"]}}}}' \
    "https://api.tailscale.com/api/v2/tailnet/${TAILSCALE_TAILNET}/keys")

  auth_key=$(printf '%s' "$key_response" | jq -r '.key')

  tailscale up --authkey="${auth_key}" --hostname=kioskkit-web --advertise-tags=tag:server
fi

node dist/index.js
