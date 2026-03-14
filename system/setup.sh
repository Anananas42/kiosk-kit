#!/usr/bin/env bash
# Idempotent setup script for zahumny-kiosk on Raspberry Pi OS Lite.
# Run as root: sudo bash system/setup.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="/opt/zahumny-kiosk"
DEPLOY_REPO="/opt/zahumny-kiosk-repo"
KIOSK_USER="kiosk"
NODE_MAJOR=20
REMOTE_URL="git@github.com:Anananas42/zahumny-kiosk.git"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERR]\033[0m %s\n'  "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "Run as root: sudo bash $0"

# ---------------------------------------------------------------------------
# 1. Install system packages
# ---------------------------------------------------------------------------

info "Installing system packages"

# Node.js repo (idempotent — skips if already present)
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt $NODE_MAJOR ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
fi

apt-get update -qq
apt-get install -y -qq \
    cage \
    chromium \
    nftables \
    nodejs \
    rsync \
    >/dev/null

# pnpm
if ! command -v pnpm &>/dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
fi

# ---------------------------------------------------------------------------
# 2. Create kiosk user
# ---------------------------------------------------------------------------

if ! id "$KIOSK_USER" &>/dev/null; then
    info "Creating $KIOSK_USER user"
    useradd -r -m -s /bin/bash -G video,input,render "$KIOSK_USER"
    passwd -l "$KIOSK_USER"
fi

# ---------------------------------------------------------------------------
# 3. Deploy application
# ---------------------------------------------------------------------------

info "Deploying application to $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"

rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude 'data/' \
    --exclude 'system/' \
    "$REPO_DIR/" "$INSTALL_DIR/"

chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"

# Build as kiosk user
info "Installing dependencies and building"
su - "$KIOSK_USER" -c "cd $INSTALL_DIR && pnpm install --frozen-lockfile && pnpm build"

# ---------------------------------------------------------------------------
# 4. Copy secrets
# ---------------------------------------------------------------------------

info "Installing secrets"

# .env
if [[ -f "$REPO_DIR/.env" ]]; then
    install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 600 "$REPO_DIR/.env" "$INSTALL_DIR/.env"
fi

# credentials/
if [[ -d "$REPO_DIR/credentials" ]]; then
    mkdir -p "$INSTALL_DIR/credentials"
    rsync -a "$REPO_DIR/credentials/" "$INSTALL_DIR/credentials/"
    chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR/credentials"
    chmod -R 600 "$INSTALL_DIR/credentials"
    chmod 700 "$INSTALL_DIR/credentials"
fi

# Data dir (writable by app)
mkdir -p "$INSTALL_DIR/data"
chown "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR/data"

# ---------------------------------------------------------------------------
# 5. Systemd service
# ---------------------------------------------------------------------------

info "Installing systemd service"

install -m 644 "$REPO_DIR/system/services/zahumny-kiosk.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable zahumny-kiosk.service

# ---------------------------------------------------------------------------
# 6. Getty autologin on tty1
# ---------------------------------------------------------------------------

info "Configuring autologin on tty1"

mkdir -p /etc/systemd/system/getty@tty1.service.d
install -m 644 "$REPO_DIR/system/config/getty-autologin.conf" \
    /etc/systemd/system/getty@tty1.service.d/autologin.conf

# ---------------------------------------------------------------------------
# 7. Kiosk user .bash_profile
# ---------------------------------------------------------------------------

info "Writing kiosk .bash_profile"

cat > "/home/$KIOSK_USER/.bash_profile" << 'PROFILE'
# Only launch kiosk on tty1
if [ "$(tty)" = "/dev/tty1" ]; then
    # Wait for the app server to be ready
    until curl -sf http://localhost:3001 >/dev/null 2>&1; do
        sleep 2
    done

    exec cage -- chromium \
        --kiosk \
        --noerrdialogs \
        --disable-infobars \
        --disable-translate \
        --no-first-run \
        --disable-features=TranslateUI \
        --disable-session-crashed-bubble \
        --disable-component-update \
        --autoplay-policy=no-user-gesture-required \
        --password-store=basic \
        http://localhost:3001
fi
PROFILE

chown "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.bash_profile"
chmod 644 "/home/$KIOSK_USER/.bash_profile"

# ---------------------------------------------------------------------------
# 8. Chromium managed policies
# ---------------------------------------------------------------------------

info "Installing Chromium policies"

mkdir -p /etc/chromium/policies/managed
install -m 644 "$REPO_DIR/system/config/chromium-policies.json" \
    /etc/chromium/policies/managed/zahumny-kiosk.json

# ---------------------------------------------------------------------------
# 9. Security hardening
# ---------------------------------------------------------------------------

info "Applying security hardening"

# USB storage block
install -m 644 "$REPO_DIR/system/config/udev-usb-storage.rules" \
    /etc/udev/rules.d/99-usb-storage-block.rules
udevadm control --reload-rules

# Also blacklist usb-storage kernel module
if ! grep -q '^blacklist usb-storage' /etc/modprobe.d/blacklist-usb-storage.conf 2>/dev/null; then
    echo 'blacklist usb-storage' > /etc/modprobe.d/blacklist-usb-storage.conf
fi

# SysRq disable
install -m 644 "$REPO_DIR/system/config/sysctl-kiosk.conf" /etc/sysctl.d/99-kiosk.conf
sysctl --system >/dev/null 2>&1

# nftables firewall
install -m 644 "$REPO_DIR/system/config/nftables.conf" /etc/nftables.conf
systemctl enable nftables.service

# SSH hardening
info "Hardening SSH"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config

# ---------------------------------------------------------------------------
# 10. Hardware watchdog
# ---------------------------------------------------------------------------

info "Configuring hardware watchdog"

# Load watchdog module on boot
if ! grep -q '^bcm2835_wdt' /etc/modules-load.d/watchdog.conf 2>/dev/null; then
    echo 'bcm2835_wdt' > /etc/modules-load.d/watchdog.conf
fi

# Tell systemd to pet the watchdog
if ! grep -q '^RuntimeWatchdogSec=' /etc/systemd/system.conf; then
    sed -i 's/^#\?RuntimeWatchdogSec=.*/RuntimeWatchdogSec=15/' /etc/systemd/system.conf
fi

# ---------------------------------------------------------------------------
# 11. Filesystem tuning
# ---------------------------------------------------------------------------

info "Filesystem tuning"

# tmpfs on /tmp
if ! grep -q 'tmpfs.*/tmp' /etc/fstab; then
    echo 'tmpfs /tmp tmpfs defaults,nosuid,nodev,size=64M 0 0' >> /etc/fstab
fi

# noatime on root
if grep -q ' / .*defaults' /etc/fstab && ! grep -q 'noatime' /etc/fstab; then
    sed -i '/ \/ /s/defaults/defaults,noatime/' /etc/fstab
fi

# ---------------------------------------------------------------------------
# 12. Disable unnecessary services
# ---------------------------------------------------------------------------

info "Disabling unnecessary services"

for svc in bluetooth cups lightdm; do
    if systemctl is-enabled "$svc" &>/dev/null 2>&1; then
        systemctl disable --now "$svc" 2>/dev/null || true
    fi
done

# Ensure console target (no desktop environment)
systemctl set-default multi-user.target

# ---------------------------------------------------------------------------
# 13. Auto-deploy (daily git pull)
# ---------------------------------------------------------------------------

info "Setting up auto-deploy"

# Clone repo for deploy pulls (if not already present)
if [[ ! -d "$DEPLOY_REPO/.git" ]]; then
    git clone "$REMOTE_URL" "$DEPLOY_REPO"
fi

# Install deploy key (must exist at system/config/deploy-key)
DEPLOY_KEY_SRC="$REPO_DIR/system/config/deploy-key"
DEPLOY_KEY_DST="$DEPLOY_REPO/.deploy-key"
if [[ -f "$DEPLOY_KEY_SRC" ]]; then
    install -m 600 "$DEPLOY_KEY_SRC" "$DEPLOY_KEY_DST"
else
    info "WARNING: No deploy key found at system/config/deploy-key"
    info "  Generate one: ssh-keygen -t ed25519 -f system/config/deploy-key -N ''"
    info "  Add the .pub key to GitHub as a read-only deploy key"
fi

export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY_DST -o StrictHostKeyChecking=accept-new"

# Install deploy timer + service
install -m 644 "$REPO_DIR/system/services/zahumny-kiosk-deploy.service" /etc/systemd/system/
install -m 644 "$REPO_DIR/system/services/zahumny-kiosk-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable zahumny-kiosk-deploy.timer

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

info "Setup complete. Reboot to start the kiosk."
info "  sudo reboot"
