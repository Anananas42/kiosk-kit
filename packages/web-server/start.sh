#!/bin/sh
set -e
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname=kioskkit-web
node dist/index.js
