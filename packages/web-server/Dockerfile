# --- base ---
FROM node:24-slim AS base
RUN corepack enable pnpm
WORKDIR /app

# --- deps ---
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web-server/package.json packages/web-server/
COPY packages/web-client/package.json packages/web-client/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
COPY turbo.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/web-server packages/web-server
COPY packages/web-client packages/web-client
RUN pnpm turbo build --filter=@kioskkit/web-server --filter=@kioskkit/web-client

# --- runtime ---
FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Tailscale via apt repository
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
      | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
      | tee /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends tailscale \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/web-server/node_modules packages/web-server/node_modules
COPY --from=build /app/packages/web-server/dist packages/web-server/dist
COPY --from=build /app/packages/web-client/dist packages/web-client/dist
COPY packages/web-server/start.sh packages/web-server/start.sh
RUN chmod +x packages/web-server/start.sh

WORKDIR /app/packages/web-server
CMD ["./start.sh"]
