FROM node:24-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq openssl ca-certificates gnupg rsync \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# pnpm + Claude Code
RUN corepack enable pnpm \
  && corepack prepare pnpm@latest --activate \
  && npm install -g @anthropic-ai/claude-code

# Playwright browser + system dependencies (for screenshot verification)
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium

# Non-root user (claude refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash agent
RUN mkdir -p /workspace/node_modules /home/agent/.local/share/pnpm/store /home/agent/.cache/node/corepack \
  && chown -R agent:agent /workspace /home/agent/.local /home/agent/.cache

# Pre-install dependencies at build time (layer cached until lockfile changes)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json /workspace/
COPY packages/kiosk-client/package.json /workspace/packages/kiosk-client/
COPY packages/kiosk-server/package.json /workspace/packages/kiosk-server/
COPY packages/landing/package.json /workspace/packages/landing/
COPY packages/shared/package.json /workspace/packages/shared/
COPY packages/web-client/package.json /workspace/packages/web-client/
COPY packages/web-server/package.json /workspace/packages/web-server/
WORKDIR /workspace
RUN pnpm install --frozen-lockfile --store-dir /home/agent/.local/share/pnpm/store \
  && chown -R agent:agent /workspace /home/agent

# CLI wrappers (enforce naming conventions for git/gh)
COPY .agents/container/wrappers /opt/wrappers
RUN chmod +x /opt/wrappers/*
ENV PATH="/opt/wrappers:$PATH"

# Entrypoint
COPY .agents/container/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER agent
WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
