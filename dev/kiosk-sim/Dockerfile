# Pi simulator — Debian slim with mock system tools and kiosk-server.
FROM node:24-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo iproute2 curl jq bash python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Create kiosk user matching real Pi setup
RUN groupadd -r netdev 2>/dev/null || true \
    && useradd -m -s /bin/bash -G sudo,netdev kiosk

# Configure sudoers — kiosk can run wifi-connect.sh and wifi-forget.sh without password
RUN echo 'kiosk ALL=(root) NOPASSWD: /opt/kioskkit/system/wifi-connect.sh, /opt/kioskkit/system/wifi-forget.sh' \
    > /etc/sudoers.d/wifi && chmod 440 /etc/sudoers.d/wifi

# Install WiFi system scripts
COPY ansible/roles/kioskkit/files/system/wifi-scan.sh /opt/kioskkit/system/
COPY ansible/roles/kioskkit/files/system/wifi-connect.sh /opt/kioskkit/system/
COPY ansible/roles/kioskkit/files/system/wifi-forget.sh /opt/kioskkit/system/
COPY ansible/roles/kioskkit/files/system/wifi-status.sh /opt/kioskkit/system/
RUN chmod +x /opt/kioskkit/system/*.sh

# Install mock wpa_cli as /usr/sbin/wpa_cli (overrides any real binary)
COPY dev/kiosk-sim/mock-wpa-cli.sh /usr/sbin/wpa_cli
RUN chmod +x /usr/sbin/wpa_cli

# Install mock wpa_passphrase (generates a deterministic hex PSK)
RUN printf '#!/bin/bash\n# Mock wpa_passphrase — outputs deterministic PSK\nSSID="$1"\nPASS="$2"\n# Generate a 64-char hex string from the inputs\nHEX=$(echo -n "${SSID}${PASS}" | sha256sum | cut -c1-64)\necho "network={"\necho "    ssid=\\"$SSID\\""\necho "    #psk=\\"$PASS\\""\necho "    psk=$HEX"\necho "}"\n' > /usr/sbin/wpa_passphrase \
    && chmod +x /usr/sbin/wpa_passphrase

# Install reset-state script
COPY dev/kiosk-sim/reset-state.sh /opt/kioskkit/system/reset-state.sh
RUN chmod +x /opt/kioskkit/system/reset-state.sh

# Create wpa_supplicant directory
RUN mkdir -p /etc/wpa_supplicant && mkdir -p /tmp/mock-wifi-state

# Install sudo wrapper that fixes wpa_supplicant.conf permissions after wifi scripts.
# On the real Pi, wpa_supplicant runs as root and the kiosk user reads the conf via group
# permissions set by Ansible. In the simulator, we fix permissions after each sudo call.
RUN mv /usr/bin/sudo /usr/bin/sudo.real \
    && printf '#!/bin/bash\n/usr/bin/sudo.real "$@"\nRET=$?\nchmod 644 /etc/wpa_supplicant/wpa_supplicant-wlan0.conf 2>/dev/null || true\nexit $RET\n' > /usr/bin/sudo \
    && chmod +x /usr/bin/sudo

# --- Build stage ---
FROM base AS build

WORKDIR /build

# Copy all package.json files (pnpm --frozen-lockfile needs complete workspace)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/kiosk-server/package.json packages/kiosk-server/
COPY packages/kiosk-client/package.json packages/kiosk-client/
COPY packages/kiosk-admin/package.json packages/kiosk-admin/
COPY packages/admin-client/package.json packages/admin-client/
COPY packages/web-server/package.json packages/web-server/
COPY packages/web-client/package.json packages/web-client/
COPY packages/landing/package.json packages/landing/

RUN pnpm install --frozen-lockfile

# Copy source for packages we need to build
COPY packages/shared/ packages/shared/
COPY packages/kiosk-server/ packages/kiosk-server/
COPY packages/kiosk-client/ packages/kiosk-client/
COPY packages/kiosk-admin/ packages/kiosk-admin/
COPY packages/admin-client/ packages/admin-client/
COPY turbo.json ./

RUN pnpm turbo build --filter=@kioskkit/kiosk-server --filter=@kioskkit/kiosk-client --filter=@kioskkit/kiosk-admin

# --- Runtime stage ---
FROM base AS runtime

WORKDIR /app

# Copy all package.json files and install production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/kiosk-server/package.json packages/kiosk-server/
COPY packages/kiosk-client/package.json packages/kiosk-client/
COPY packages/kiosk-admin/package.json packages/kiosk-admin/
COPY packages/admin-client/package.json packages/admin-client/
COPY packages/web-server/package.json packages/web-server/
COPY packages/web-client/package.json packages/web-client/
COPY packages/landing/package.json packages/landing/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /build/packages/shared/dist/ packages/shared/dist/
COPY --from=build /build/packages/kiosk-server/dist/ packages/kiosk-server/dist/
COPY --from=build /build/packages/kiosk-client/dist/ packages/kiosk-client/dist/
COPY --from=build /build/packages/kiosk-admin/dist/ packages/kiosk-admin/dist/

# Create data directory for SQLite
RUN mkdir -p /app/data && chown kiosk:kiosk /app/data

# Copy entrypoint
COPY dev/kiosk-sim/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
