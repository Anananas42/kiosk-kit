#!/usr/bin/env bash
set -euo pipefail

echo "==> Copying repo to /workspace..."
cp -a /mnt/repo/. /workspace/
# Remove host worktrees and node_modules (will reinstall)
rm -rf /workspace/.claude/worktrees /workspace/node_modules

echo "==> Configuring git..."
git config user.name "kiosk-kit-agent[bot]"
git config user.email "kiosk-kit-agent[bot]@users.noreply.github.com"
git config commit.gpgsign false
git remote set-url origin "https://github.com/Anananas42/kiosk-kit.git"
git remote set-url --push origin "https://github.com/Anananas42/kiosk-kit.git"

# Set up GitHub App PEM in expected location
if [ -f /mnt/secrets/kiosk-kit-agent.pem ]; then
  mkdir -p "$HOME/.config/github-apps"
  cp /mnt/secrets/kiosk-kit-agent.pem "$HOME/.config/github-apps/kiosk-kit-agent.pem"
  chmod 600 "$HOME/.config/github-apps/kiosk-kit-agent.pem"
fi

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Waiting for postgres..."
for i in $(seq 1 30); do
  if pg_isready -h postgres -U kioskkit -q 2>/dev/null || \
     node -e "const c=require('net').connect(5432,'postgres');c.on('connect',()=>{c.destroy();process.exit(0)});c.on('error',()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "==> Pushing database schema..."
pnpm --filter @kioskkit/web-server db:push

echo "==> Ready."

# If AGENT_TASK is set, run claude non-interactively
if [ -n "${AGENT_TASK:-}" ]; then
  exec claude --dangerously-skip-permissions -p "$AGENT_TASK"
fi

# Otherwise, drop into interactive claude
exec claude --dangerously-skip-permissions
