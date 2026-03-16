#!/usr/bin/env bash
# Pulls latest from git, rebuilds and redeploys if there are changes.
# Run as root (via systemd timer or manually).
set -euo pipefail

REPO_DIR="/opt/zahumny-kiosk-repo"
INSTALL_DIR="/opt/zahumny-kiosk"
KIOSK_USER="kiosk"
GIT_SSH_KEY="/opt/zahumny-kiosk-repo/.deploy-key"
REMOTE_URL="git@github.com:Anananas42/zahumny-kiosk.git"

export GIT_SSH_COMMAND="ssh -i $GIT_SSH_KEY -o StrictHostKeyChecking=accept-new"

info() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Initial clone if repo dir doesn't exist
# ---------------------------------------------------------------------------

if [[ ! -d "$REPO_DIR/.git" ]]; then
    info "Initial clone"
    git clone "$REMOTE_URL" "$REPO_DIR"
fi

# ---------------------------------------------------------------------------
# Pull and check for changes
# ---------------------------------------------------------------------------

cd "$REPO_DIR"

OLD_HEAD=$(git rev-parse HEAD)
git fetch origin main
NEW_HEAD=$(git rev-parse origin/main)

if [[ "$OLD_HEAD" = "$NEW_HEAD" ]]; then
    info "No changes (at $OLD_HEAD)"
    exit 0
fi

info "Updating $OLD_HEAD -> $NEW_HEAD"
git reset --hard origin/main

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude 'data/' \
    --exclude 'system/' \
    --exclude '.env' \
    --exclude 'credentials/' \
    "$REPO_DIR/" "$INSTALL_DIR/"

# System config files (live under system/ which is excluded from main rsync)
mkdir -p "$INSTALL_DIR/system/config"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 \
    "$REPO_DIR/system/config/display-sleep.py" "$INSTALL_DIR/system/config/display-sleep.py"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 644 \
    "$REPO_DIR/system/config/sway-config" "/home/$KIOSK_USER/.config/sway/config"

chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"

info "Installing dependencies and building"
su - "$KIOSK_USER" -c "cd $INSTALL_DIR && pnpm install --frozen-lockfile && pnpm build"

info "Clearing Chromium cache"
rm -rf "/home/$KIOSK_USER/.cache/chromium"

info "Restarting service"
systemctl restart zahumny-kiosk.service

# Force Chromium to reload by restarting sway (respawns via getty)
if pgrep -u "$KIOSK_USER" sway >/dev/null 2>&1; then
    info "Restarting kiosk display"
    pkill -u "$KIOSK_USER" sway || true
    sleep 2
    # Clean up stale wayland sockets so the next sway gets a fresh wayland-0
    rm -f /tmp/kiosk-xdg/wayland-* /tmp/kiosk-xdg/sway-ipc.*.sock
fi

info "Deploy complete ($NEW_HEAD)"
