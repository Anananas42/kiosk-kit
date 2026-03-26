#!/bin/sh
set -e

tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Wait for tailscaled to be ready
sleep 2

# If already authenticated (persistent volume has state), just reconnect
if tailscale status >/dev/null 2>&1; then
  tailscale up --hostname=kioskkit-web --advertise-tags=tag:kioskkit,tag:server
else
  # First boot: exchange OAuth credentials for an auth key via API
  # Note: must request ALL tags from the OAuth client, not a subset
  token_response=$(curl -sS --max-time 30 \
    -d "client_id=${TAILSCALE_OAUTH_CLIENT_ID}" \
    -d "client_secret=${TAILSCALE_OAUTH_CLIENT_SECRET}" \
    "https://api.tailscale.com/api/v2/oauth/token")

  access_token=$(printf '%s' "$token_response" | jq -r '.access_token // empty')
  if [ -z "$access_token" ]; then
    echo "Failed to get OAuth token. Response: $token_response" >&2
    exit 1
  fi

  key_response=$(curl -sS --max-time 30 \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d '{"capabilities":{"devices":{"create":{"reusable":false,"ephemeral":false,"preauthorized":true,"tags":["tag:kioskkit","tag:server"]}}}}' \
    "https://api.tailscale.com/api/v2/tailnet/-/keys")

  auth_key=$(printf '%s' "$key_response" | jq -r '.key // empty')
  if [ -z "$auth_key" ]; then
    echo "Failed to create auth key. Response: $key_response" >&2
    exit 1
  fi

  tailscale up --authkey="${auth_key}" --hostname=kioskkit-web --advertise-tags=tag:kioskkit,tag:server
fi

node dist/index.js
