#!/bin/sh
set -e
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
tailscale up --authkey="${TAILSCALE_OAUTH_CLIENT_SECRET}?ephemeral=false&preauthorized=true" --advertise-tags=tag:server --hostname=kioskkit-web
node dist/index.js
