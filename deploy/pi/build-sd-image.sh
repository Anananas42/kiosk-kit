#!/usr/bin/env bash
# build-sd-image.sh — Build a flashable SD card image for KioskKit Pi devices.
#
# Uses a three-layer cache so that per-device stamping takes ~30s (no QEMU boot):
#
#   Layer 1 (base system, ~25 min):  Pi OS + QEMU patches + Ansible provision (--skip-tags tailscale,app)
#   Layer 2 (app deploy, ~1 min):    Host build + QEMU native addon rebuild + system config
#   Layer 3 (device stamp, ~30 sec): guestfish-only — Tailscale config, first-boot service, cleanup
#
# Prerequisites (all provided by the Dockerfile):
#   qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools),
#   ansible-playbook, sshpass, curl, jq, xz, dpkg-deb
#
# Usage:
#   ./build-sd-image.sh --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
#   ./build-sd-image.sh --device-id 042 --customer-tag acme   # auto-generates key via Tailscale API
#   ./build-sd-image.sh --dev                   # reads PI_DEV_* env vars
#   ./build-sd-image.sh --dev --force            # rebuild all layers
#   ./build-sd-image.sh --dev --app-only         # skip base layer (must exist)
#   ./build-sd-image.sh --dev --device-only      # stamp device on existing app image (~30s)
#
# Options:
#   --device-id ID         Device identifier (e.g. 042)
#   --customer-tag TAG     Customer tag for Tailscale ACLs (e.g. acme)
#   --tailscale-key KEY    Explicit Tailscale auth key; if omitted, auto-generated via API
#   --dev                  Use PI_DEV_* env vars for device-id, customer-tag, tailscale-key
#   --force                Rebuild all cached layers from scratch
#   --app-only             Skip base layer rebuild (must already exist)
#   --device-only          Only stamp device on existing app image (~30s)
#
# Environment variables (for API key auto-generation when --tailscale-key is omitted):
#   TAILSCALE_OAUTH_CLIENT_ID      Tailscale OAuth client ID (also read from .env)
#   TAILSCALE_OAUTH_CLIENT_SECRET  Tailscale OAuth client secret (also read from .env)
#   TAILSCALE_TAILNET              Tailscale tailnet name (also read from .env)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Docker re-exec ---------------------------------------------------------
# If not inside a container, rebuild and re-exec inside Docker.

if [ ! -f /.dockerenv ] && [ -z "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required when running outside a container" >&2; exit 1; }

  # --- Host-side app build (native speed, before Docker) ---
  echo "==> Building application on host (native speed)..."
  APP_STAGE="$SCRIPT_DIR/.work/app-stage"
  rm -rf "$APP_STAGE"
  mkdir -p "$APP_STAGE"

  rsync -a --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=.venv \
    --exclude=data/ \
    --exclude=deploy/ \
    --exclude=dev/ \
    --exclude=plans/ \
    --exclude=docs/ \
    --exclude=credentials/ \
    --exclude=.env \
    --exclude=.screenshots/ \
    --exclude=packages/web-client/ \
    --exclude=packages/web-server/ \
    --exclude=packages/web-admin/ \
    --exclude=packages/landing/ \
    "$REPO_ROOT/" "$APP_STAGE/"

  node -e "
    const pkg = require('$APP_STAGE/package.json');
    delete pkg.devDependencies;
    delete pkg.scripts.prepare;
    require('fs').writeFileSync('$APP_STAGE/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "

  (cd "$APP_STAGE" && pnpm install --no-frozen-lockfile \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui) || { echo "ERROR: Host pnpm install failed" >&2; exit 1; }

  (cd "$APP_STAGE" && NODE_ENV=production pnpm \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    build) || { echo "ERROR: Host pnpm build failed" >&2; exit 1; }

  (cd "$APP_STAGE" && CI=true pnpm install --no-frozen-lockfile --prod \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui) || { echo "ERROR: Host pnpm prune failed" >&2; exit 1; }

  echo "==> Host build complete."

  echo "==> Building SD image builder Docker image..."
  docker build -t kioskkit-sd-builder "$SCRIPT_DIR"
  echo "==> Re-executing inside container..."
  DOCKER_TTY_FLAG=""
  if [ -t 0 ]; then DOCKER_TTY_FLAG="-it"; fi
  # shellcheck disable=SC2086
  exec docker run --rm $DOCKER_TTY_FLAG \
    -e KIOSKKIT_IN_CONTAINER=1 \
    ${PI_DEV_DEVICE_ID:+-e PI_DEV_DEVICE_ID="$PI_DEV_DEVICE_ID"} \
    ${PI_DEV_CUSTOMER_TAG:+-e PI_DEV_CUSTOMER_TAG="$PI_DEV_CUSTOMER_TAG"} \
    ${PI_DEV_TAILSCALE_KEY:+-e PI_DEV_TAILSCALE_KEY="$PI_DEV_TAILSCALE_KEY"} \
    ${TAILSCALE_OAUTH_CLIENT_ID:+-e TAILSCALE_OAUTH_CLIENT_ID="$TAILSCALE_OAUTH_CLIENT_ID"} \
    ${TAILSCALE_OAUTH_CLIENT_SECRET:+-e TAILSCALE_OAUTH_CLIENT_SECRET="$TAILSCALE_OAUTH_CLIENT_SECRET"} \
    ${TAILSCALE_TAILNET:+-e TAILSCALE_TAILNET="$TAILSCALE_TAILNET"} \
    ${SD_BUILD_RAM:+-e SD_BUILD_RAM="$SD_BUILD_RAM"} \
    ${SD_BUILD_CPUS:+-e SD_BUILD_CPUS="$SD_BUILD_CPUS"} \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$SCRIPT_DIR/.work:/build" \
    -v "$SCRIPT_DIR/.output:/output" \
    kioskkit-sd-builder "$@"
fi

# --- Configuration -----------------------------------------------------------

# Variables consumed by pi-image-common.sh after sourcing
# shellcheck disable=SC2034
SSH_PORT=2222
# shellcheck disable=SC2034
QEMU_DISK_SIZE=18G
# shellcheck disable=SC2034
QEMU_RAM="${SD_BUILD_RAM:-6G}"
# shellcheck disable=SC2034
_half_cpus=$(( $(nproc) / 2 ))
# shellcheck disable=SC2034
QEMU_CPUS="${SD_BUILD_CPUS:-$(( _half_cpus > 8 ? 8 : _half_cpus ))}"

# When running in the container, /workspace is the repo root (read-only mount).
# Use /build as the writable work directory.
if [ -n "${KIOSKKIT_IN_CONTAINER:-}" ]; then
  REPO_ROOT="/workspace"
  WORK_DIR="/build"
  OUTPUT_DIR="/output"
else
  WORK_DIR="$SCRIPT_DIR/.work"
  OUTPUT_DIR="$SCRIPT_DIR/.output"
fi

# shellcheck disable=SC2034
KERNEL="$WORK_DIR/vmlinuz"
# shellcheck disable=SC2034
INITRD="$WORK_DIR/initrd.img"
# shellcheck disable=SC2034
RAW_IMAGE="$WORK_DIR/raspios.img"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

BASE_IMAGE="$WORK_DIR/provisioned-base.qcow2"
APP_IMAGE="$WORK_DIR/app-image.qcow2"

# shellcheck disable=SC2034
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
# shellcheck disable=SC2034
PIOS_CHECKSUM="6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4"

# Tailscale arm64 .deb URL and checksum
TAILSCALE_VERSION="1.80.3"
TAILSCALE_DEB_URL="https://pkgs.tailscale.com/stable/debian/pool/tailscale_${TAILSCALE_VERSION}_arm64.deb"
TAILSCALE_DEB_CHECKSUM="aed221f435b3ed6e5a6ed0694a3e91b04136264b96ae27cca39433a95fbd03e2"

# shellcheck source=lib/pi-image-common.sh
source "$REPO_ROOT/deploy/pi/lib/pi-image-common.sh"

trap cleanup_qemu EXIT

# --- Argument parsing --------------------------------------------------------

parse_args() {
  DEVICE_ID=""
  CUSTOMER_TAG=""
  TAILSCALE_KEY=""
  FORCE=0
  APP_ONLY=0
  DEVICE_ONLY=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device-id)    [[ $# -ge 2 ]] || err "--device-id requires a value"; DEVICE_ID="$2"; shift 2 ;;
      --customer-tag) [[ $# -ge 2 ]] || err "--customer-tag requires a value"; CUSTOMER_TAG="$2"; shift 2 ;;
      --tailscale-key) [[ $# -ge 2 ]] || err "--tailscale-key requires a value"; TAILSCALE_KEY="$2"; shift 2 ;;
      --dev)
        DEVICE_ID="${PI_DEV_DEVICE_ID:-}"
        CUSTOMER_TAG="${PI_DEV_CUSTOMER_TAG:-}"
        TAILSCALE_KEY="${PI_DEV_TAILSCALE_KEY:-}"
        shift
        ;;
      --force)       FORCE=1; shift ;;
      --app-only)    APP_ONLY=1; shift ;;
      --device-only) DEVICE_ONLY=1; shift ;;
      *) err "Unknown argument: $1" ;;
    esac
  done

  # Auto-generate a 3-word device ID if not provided
  if [[ -z "$DEVICE_ID" ]]; then
    DEVICE_ID=$(grep -E '^[a-z]{3,8}$' /usr/share/dict/words | shuf -n3 | paste -sd-)
    log "Auto-generated device ID: $DEVICE_ID"
  fi
  [[ -n "$CUSTOMER_TAG" ]]  || err "Missing --customer-tag (or set PI_DEV_CUSTOMER_TAG with --dev)"

  # --device-only implies --app-only (no base rebuild either)
  if [[ $DEVICE_ONLY -eq 1 ]]; then
    APP_ONLY=1
  fi

  log "Building image for device=$DEVICE_ID customer=$CUSTOMER_TAG"
}

# --- Tailscale API key generation --------------------------------------------

generate_tailscale_key() {
  # Load .env from repo root if present
  if [[ -f "$REPO_ROOT/.env" ]]; then
    while IFS='=' read -r key value; do
      case "$key" in
        TAILSCALE_OAUTH_CLIENT_ID|TAILSCALE_OAUTH_CLIENT_SECRET|TAILSCALE_TAILNET) export "$key=$value" ;;
      esac
    done < <(grep -E '^TAILSCALE_(OAUTH_CLIENT_ID|OAUTH_CLIENT_SECRET|TAILNET)=' "$REPO_ROOT/.env")
  fi

  if [[ -z "${TAILSCALE_OAUTH_CLIENT_ID:-}" ]] || [[ -z "${TAILSCALE_OAUTH_CLIENT_SECRET:-}" ]] || [[ -z "${TAILSCALE_TAILNET:-}" ]]; then
    err "No --tailscale-key provided and Tailscale OAuth credentials not set.
  Either pass --tailscale-key tskey-auth-XXXX explicitly, or set
  TAILSCALE_OAUTH_CLIENT_ID, TAILSCALE_OAUTH_CLIENT_SECRET, and TAILSCALE_TAILNET in environment or .env file."
  fi

  log "Generating single-use Tailscale auth key via API..."

  # Get OAuth access token
  local token_response
  if ! token_response=$(curl -fsS --max-time 30 \
    -d "client_id=${TAILSCALE_OAUTH_CLIENT_ID}" \
    -d "client_secret=${TAILSCALE_OAUTH_CLIENT_SECRET}" \
    "https://api.tailscale.com/api/v2/oauth/token" 2>/tmp/curl_stderr); then
    curl_err=$(cat /tmp/curl_stderr)
    err "Tailscale OAuth token exchange failed: ${token_response:-$curl_err}"
  fi

  local access_token
  access_token=$(printf '%s' "$token_response" | jq -r '.access_token // empty') \
    || err "Failed to parse OAuth token response"
  [[ -n "$access_token" ]] || err "OAuth token exchange returned empty token. Response: $token_response"

  # Build tags array: always include tag:kioskkit, add customer tag if set
  local tags_json
  tags_json=$(jq -n '["tag:kioskkit"]')
  if [[ -n "$CUSTOMER_TAG" ]]; then
    tags_json=$(printf '%s' "$tags_json" | jq --arg t "tag:$CUSTOMER_TAG" '. + [$t]')
  fi

  local description
  description="kioskkit-${DEVICE_ID}"

  local payload
  payload=$(jq -n \
    --argjson tags "$tags_json" \
    --arg desc "$description" \
    '{capabilities: {devices: {create: {reusable: false, ephemeral: false, tags: $tags}}}, description: $desc}')

  log "Requesting auth key with tags: $tags_json"
  local response
  response=$(curl -sS --max-time 30 \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "https://api.tailscale.com/api/v2/tailnet/${TAILSCALE_TAILNET}/keys" 2>&1) \
    || err "Tailscale API call failed (curl error): $response"

  # Check for API error message in response
  local api_err
  api_err=$(printf '%s' "$response" | jq -r '.message // empty' 2>/dev/null)
  [[ -z "$api_err" ]] || err "Tailscale API error: $api_err"

  TAILSCALE_KEY=$(printf '%s' "$response" | jq -r '.key // empty') \
    || err "Failed to parse Tailscale API response"
  [[ -n "$TAILSCALE_KEY" ]] || err "Tailscale API returned empty key. Response: $response"

  local key_id
  key_id=$(printf '%s' "$response" | jq -r '.id // "unknown"')
  log "Generated Tailscale auth key: id=$key_id description=\"$description\""
}

# --- SD image specific functions ---------------------------------------------

# write_inventory — create the Ansible inventory file used by both layers.
# Called once from main() so the inventory exists even when Layer 1 is cached.
write_inventory() {
  local inventory_file="$WORK_DIR/inventory.yml"
  cat > "$inventory_file" <<EOF
---
all:
  children:
    kiosks:
      hosts:
        qemu-pi:
          ansible_host: localhost
          ansible_port: $SSH_PORT
          ansible_user: pi
          ansible_ssh_pass: "raspberry"
          ansible_ssh_private_key_file: "$BUILD_SSH_KEY"
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "${DEVICE_ID}"
          kioskkit_customer_tag: "${CUSTOMER_TAG}"
EOF
}

# provision_base — run provision.yml skipping tailscale and app tags (Layer 1).
provision_base() {
  log "Running Ansible base provisioning (--skip-tags tailscale,app)..."

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$WORK_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale,app \
    -e "kioskkit_tailscale_auth_key=skip" \
    || err "Ansible base provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."
}

# deploy_app — sync pre-built app (from host) into VM, rebuild native arm64 addons.
#
# The host build runs before Docker re-exec (native x86 speed). By the time this
# function runs inside the container, the pre-built app is at $WORK_DIR/app-stage/.
deploy_app() {
  local stage_dir="$WORK_DIR/app-stage"
  [[ -d "$stage_dir" ]] || err "No pre-built app found at $stage_dir. Host build may have failed."

  local install_dir="/opt/kioskkit"

  # rsync the pre-built app into the VM (via temp dir, then move as root)
  log "Syncing pre-built application into VM..."
  ssh_pi "sudo mkdir -p /var/tmp/app-stage && sudo chown pi:pi /var/tmp/app-stage"
  local ssh_key_opt=""
  if [[ -n "${BUILD_SSH_KEY:-}" && -f "${BUILD_SSH_KEY:-}" ]]; then
    ssh_key_opt="-i $BUILD_SSH_KEY"
  fi
  # shellcheck disable=SC2086
  rsync -az --delete \
    -e "ssh ${ssh_key_opt:+$ssh_key_opt }-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $SSH_PORT" \
    "$stage_dir/" "pi@localhost:/var/tmp/app-stage/" \
    || err "rsync into VM failed"
  ssh_pi "sudo rsync -a --delete --exclude=data /var/tmp/app-stage/ $install_dir/ && sudo rm -rf /var/tmp/app-stage && sudo chown -R kiosk:kiosk $install_dir"

  # Rebuild native arm64 addons
  log "Rebuilding native arm64 addons (better-sqlite3)..."
  ssh_pi "sudo -u kiosk bash -lc 'cd $install_dir && npm rebuild better-sqlite3'" \
    || err "Native addon rebuild failed inside VM"

  # Deploy ancillary files (systemd service, sway config, display-sleep.py)
  log "Deploying system configuration..."
  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$WORK_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    --start-at-task="Create system config directory" \
    || err "Ansible post-deploy tasks failed"

  rm -rf "$stage_dir"
  log "Application deployed."
}

# customize_device_image — Layer 3 device customization via guestfish.
# Restores Pi boot state, injects Tailscale + first-boot services,
# stamps device config, generates SSH host keys, removes build SSH key.
customize_device_image() {
  local target_image="$1"
  log "Customizing device image (boot state, Tailscale, SSH keys)..."

  local stamp_dir="$WORK_DIR/stamp-files"
  rm -rf "$stamp_dir"
  mkdir -p "$stamp_dir"

  # --- Host-side prep (no guestfish) ---

  # Generate SSH host keys
  local ssh_dir="$stamp_dir/ssh-keys"
  mkdir -p "$ssh_dir"
  ssh-keygen -t rsa -b 4096 -f "$ssh_dir/ssh_host_rsa_key" -N "" -q
  ssh-keygen -t ecdsa -b 521 -f "$ssh_dir/ssh_host_ecdsa_key" -N "" -q
  ssh-keygen -t ed25519 -f "$ssh_dir/ssh_host_ed25519_key" -N "" -q

  # Write device config files
  cat > "$stamp_dir/tailscale-firstboot.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
TAILSCALE_AUTH_KEY=${TAILSCALE_KEY}
EOF

  cat > "$stamp_dir/device.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
EOF

  # Download Tailscale arm64 .deb (cached across device stamps)
  local ts_deb="$CACHE_DIR/tailscale-${TAILSCALE_VERSION}_arm64.deb"
  if [[ ! -f "$ts_deb" ]]; then
    log "Downloading Tailscale arm64 .deb..."
    mkdir -p "$CACHE_DIR"
    curl -fSL -o "$ts_deb" "$TAILSCALE_DEB_URL" \
      || err "Failed to download Tailscale .deb from $TAILSCALE_DEB_URL"
    echo "$TAILSCALE_DEB_CHECKSUM  $ts_deb" | sha256sum -c - \
      || err "Checksum mismatch for Tailscale .deb"
  fi

  # Extract Tailscale .deb on host
  local ts_root="$stamp_dir/tailscale-root"
  mkdir -p "$ts_root"
  dpkg-deb -x "$ts_deb" "$ts_root"

  # --- Guestfish session 1: read-only (extract PARTUUIDs + sshd_config) ---

  # --- Guestfish session 1: read-only (extract PARTUUIDs + sshd_config) ---

  log "Reading image metadata..."
  local read_cmd="$stamp_dir/read.cmd"
  local sshd_cfg="$stamp_dir/sshd_config"
  {
    echo "add $target_image"
    echo "run"
    echo "blkid /dev/sda1"
    echo "blkid /dev/sda2"
    echo "mount /dev/sda2 /"
    echo "download /etc/ssh/sshd_config $sshd_cfg"
    echo "umount /"
    echo "mount /dev/sda1 /"
    echo "download /cmdline.txt $stamp_dir/cmdline.txt"
  } > "$read_cmd"

  local blkid_lines
  blkid_lines=$(guestfish < "$read_cmd")

  local partuuid_p1 partuuid_p2
  partuuid_p1=$(echo "$blkid_lines" | awk '/PART_ENTRY_UUID:/{print $2; exit}')
  partuuid_p2=$(echo "$blkid_lines" | awk '/PART_ENTRY_UUID:/{uuid=$2} END{print uuid}')

  # Patch sshd_config to use host keys on data partition
  sed -i -E 's,^#?HostKey /etc/ssh/ssh_host_(rsa|ecdsa|ed25519)_key,HostKey /data/ssh/ssh_host_\1_key,' "$sshd_cfg"

  # Strip Pi OS first-boot init override from cmdline.txt
  sed -i 's| init=/usr/lib/raspberrypi-sys-mods/firstboot||' "$stamp_dir/cmdline.txt"

  # Build Pi-native fstab with PARTUUIDs
  cat > "$stamp_dir/fstab" <<FSTAB
proc                  /proc            proc  defaults          0  0
PARTUUID=${partuuid_p1}  /boot/firmware  vfat  defaults          0  2
PARTUUID=${partuuid_p2}  /               ext4  defaults,noatime  0  1
LABEL=kioskkit-data   /data            ext4  defaults,noatime  0  2
/data/kioskkit        /opt/kioskkit/data   none  bind          0  0
/data/tailscale       /var/lib/tailscale   none  bind          0  0
/data/wpa             /etc/wpa_supplicant  none  bind          0  0
/data/kioskkit-config /etc/kioskkit        none  bind          0  0
/data/journal         /var/log/journal     none  bind          0  0
tmpfs                 /tmp             tmpfs defaults,nosuid,nodev,size=64M 0 0
FSTAB

  # --- Guestfish session 2: read-write (all modifications in one pass) ---

  log "Writing all device customizations..."
  local virt_kver
  virt_kver=$(cat "$WORK_DIR/virt-kernel-version" 2>/dev/null || true)

  local write_cmd="$stamp_dir/write.cmd"
  {
    echo "add $target_image"
    echo "run"

    # === rootfs (p2) ===
    echo "mount /dev/sda2 /"

    # Restore Pi boot state: fstab, bind mount dirs, remove virt kernel
    echo "upload $stamp_dir/fstab /etc/fstab"
    echo "mkdir-p /data"
    echo "mkdir-p /opt/kioskkit/data"
    echo "mkdir-p /var/lib/tailscale"
    echo "mkdir-p /etc/wpa_supplicant"
    echo "mkdir-p /etc/kioskkit"
    echo "mkdir-p /var/log/journal"
    if [[ -n "$virt_kver" ]]; then
      echo "rm-rf /usr/lib/modules/$virt_kver"
    fi
    echo "glob rm /boot/vmlinuz-*"
    echo "glob rm /boot/config-*"
    echo "glob rm /boot/System.map-*"

    # First-boot services
    echo "upload $REPO_ROOT/deploy/pi/first-boot/kioskkit-tailscale-firstboot.service /etc/systemd/system/kioskkit-tailscale-firstboot.service"
    echo "mkdir-p /opt/kioskkit/system"
    echo "upload $REPO_ROOT/deploy/pi/first-boot/tailscale-firstboot.sh /opt/kioskkit/system/tailscale-firstboot.sh"
    echo "chmod 0755 /opt/kioskkit/system/tailscale-firstboot.sh"
    echo "upload $REPO_ROOT/deploy/pi/first-boot/kioskkit-expand-data.service /etc/systemd/system/kioskkit-expand-data.service"
    echo "upload $REPO_ROOT/deploy/pi/first-boot/expand-data-partition.sh /opt/kioskkit/system/expand-data-partition.sh"
    echo "chmod 0755 /opt/kioskkit/system/expand-data-partition.sh"
    echo "mkdir-p /etc/systemd/system/multi-user.target.wants"
    echo "ln-sf /etc/systemd/system/kioskkit-tailscale-firstboot.service /etc/systemd/system/multi-user.target.wants/kioskkit-tailscale-firstboot.service"
    echo "mkdir-p /etc/systemd/system/local-fs.target.wants"
    echo "ln-sf /etc/systemd/system/kioskkit-expand-data.service /etc/systemd/system/local-fs.target.wants/kioskkit-expand-data.service"

    # Tailscale binaries
    if [ -f "$ts_root/usr/bin/tailscale" ]; then
      echo "upload $ts_root/usr/bin/tailscale /usr/bin/tailscale"
      echo "chmod 0755 /usr/bin/tailscale"
    fi
    if [ -f "$ts_root/usr/sbin/tailscaled" ]; then
      echo "upload $ts_root/usr/sbin/tailscaled /usr/sbin/tailscaled"
      echo "chmod 0755 /usr/sbin/tailscaled"
    fi
    if [ -f "$ts_root/lib/systemd/system/tailscaled.service" ]; then
      echo "upload $ts_root/lib/systemd/system/tailscaled.service /usr/lib/systemd/system/tailscaled.service"
      echo "ln-sf /usr/lib/systemd/system/tailscaled.service /etc/systemd/system/multi-user.target.wants/tailscaled.service"
    fi
    if [ -f "$ts_root/etc/default/tailscaled" ]; then
      echo "mkdir-p /etc/default"
      echo "upload $ts_root/etc/default/tailscaled /etc/default/tailscaled"
    fi

    # Patched sshd_config
    echo "upload $sshd_cfg /etc/ssh/sshd_config"

    # Remove build SSH key
    echo "rm-f /home/pi/.ssh/authorized_keys"

    # === data partition (p4) ===
    echo "umount /"
    echo "mount /dev/sda4 /"

    # Device config
    echo "mkdir-p /kioskkit-config"
    echo "upload $stamp_dir/device.conf /kioskkit-config/device.conf"
    echo "chmod 0644 /kioskkit-config/device.conf"

    # Tailscale firstboot config
    echo "upload $stamp_dir/tailscale-firstboot.conf /kioskkit-config/tailscale-firstboot.conf"
    echo "chmod 0600 /kioskkit-config/tailscale-firstboot.conf"

    # OTA state
    echo "mkdir-p /ota"
    echo "mkdir-p /ota/pending"
    echo "write /ota/boot-slot \"A\""
    echo "write /ota/state.json \"{\\\"status\\\":\\\"idle\\\",\\\"slot\\\":\\\"A\\\"}\""

    # SSH host keys
    echo "mkdir-p /ssh"
    for keytype in rsa ecdsa ed25519; do
      echo "upload $ssh_dir/ssh_host_${keytype}_key /ssh/ssh_host_${keytype}_key"
      echo "chmod 0600 /ssh/ssh_host_${keytype}_key"
      echo "upload $ssh_dir/ssh_host_${keytype}_key.pub /ssh/ssh_host_${keytype}_key.pub"
      echo "chmod 0644 /ssh/ssh_host_${keytype}_key.pub"
    done

    # === boot partition (p1) ===
    echo "umount /"
    echo "mount /dev/sda1 /"
    echo "upload $stamp_dir/cmdline.txt /cmdline.txt"
  } > "$write_cmd"

  guestfish < "$write_cmd" || log "WARN: Some guestfish commands failed (may be OK if files didn't exist)"
  rm -rf "$stamp_dir"

  log "Device image customized."
}

convert_to_raw() {
  log "Converting qcow2 to raw image..."
  local raw_output="$WORK_DIR/kioskkit-${DEVICE_ID}.img"
  qemu-img convert -f qcow2 -O raw "$WORK_DIR/device-${DEVICE_ID}.qcow2" "$raw_output"
  FINAL_IMAGE="$raw_output"
  log "Raw image: $(du -h "$FINAL_IMAGE" | cut -f1)"
}

shrink_image() {
  log "Shrinking image..."

  # Shrink empty partitions (rootB + data) and truncate the image via guestfish.
  # No sudo or loop devices needed — guestfish runs its own appliance.

  # Shrink filesystems to minimum, then resize partitions to match
  local shrink_output
  shrink_output=$(guestfish --rw -a "$FINAL_IMAGE" <<'EOF'
run

# Shrink rootB (p3) — empty, minimize it
e2fsck-f /dev/sda3
resize2fs-M /dev/sda3

# Shrink data (p4) — nearly empty, minimize it
e2fsck-f /dev/sda4
resize2fs-M /dev/sda4

# Report the new filesystem sizes (in 1K blocks)
tune2fs-l /dev/sda3
tune2fs-l /dev/sda4
EOF
  ) || log "WARN: guestfish shrink had non-zero exit (may be OK)"

  # Extract the new block counts to calculate partition sizes
  local p3_blocks p3_blocksize p4_blocks p4_blocksize
  p3_blocks=$(echo "$shrink_output" | awk '/^Block count:/{print $3; exit}')
  p3_blocksize=$(echo "$shrink_output" | awk '/^Block size:/{print $3; exit}')
  p4_blocks=$(echo "$shrink_output" | awk '/^Block count:/{count=$3} END{print count}')
  p4_blocksize=$(echo "$shrink_output" | awk '/^Block size:/{size=$3} END{print size}')

  local p3_bytes=$(( p3_blocks * p3_blocksize ))
  local p4_bytes=$(( p4_blocks * p4_blocksize ))

  # Get partition start offsets and resize them to fit the shrunk filesystems
  local part_info
  part_info=$(guestfish --ro -a "$FINAL_IMAGE" <<'EOF'
run
part-list /dev/sda
EOF
  )

  # Parse p3 start offset from part-list output
  local p3_start
  p3_start=$(echo "$part_info" | awk '/\[2\]/{found=1} found && /part_start:/{print $2; exit}')

  # Calculate new partition sizes (add 1 MB margin for filesystem metadata)
  local margin=$((1024 * 1024))
  local p3_new_size=$(( p3_bytes + margin ))
  local p4_new_size=$(( p4_bytes + margin ))
  local p3_new_end_sector=$(( (p3_start + p3_new_size) / 512 ))
  local p4_new_start_sector=$(( p3_new_end_sector + 1 ))
  local p4_new_end_sector=$(( p4_new_start_sector + p4_new_size / 512 ))

  # Use sfdisk to rewrite partitions 3 and 4 (no confirmation prompts)
  # Dump current table, modify p3 and p4 sizes, apply
  local sfdisk_dump
  sfdisk_dump=$(sfdisk -d "$FINAL_IMAGE")

  # Replace p3 and p4 lines with new sizes
  local p3_start_sector=$(( p3_start / 512 ))
  local p3_sectors=$(( p3_new_size / 512 ))
  local p4_sectors=$(( p4_new_size / 512 ))
  sfdisk_dump=$(echo "$sfdisk_dump" | sed \
    -e "s|^\(${FINAL_IMAGE}3.*start= *\)[0-9]*\(.*size= *\)[0-9]*|\1${p3_start_sector}\2${p3_sectors}|" \
    -e "s|^\(${FINAL_IMAGE}4.*start= *\)[0-9]*\(.*size= *\)[0-9]*|\1${p4_new_start_sector}\2${p4_sectors}|")

  echo "$sfdisk_dump" | sfdisk --no-reread --force "$FINAL_IMAGE" >/dev/null 2>&1

  # Truncate the file to just past the last partition
  local truncate_bytes=$(( (p4_new_end_sector + 1) * 512 ))
  truncate -s "$truncate_bytes" "$FINAL_IMAGE"

  log "Image shrunk: $(du -h "$FINAL_IMAGE" | cut -f1)"
}

# stamp_device — Layer 3: all guestfish operations for per-device customization.
# No QEMU boot required — operates on a cold disk image.
stamp_device() {
  local source_image="$1"
  log "Stamping device image for device=$DEVICE_ID..."

  # Generate Tailscale auth key if not explicitly provided
  if [[ -z "$TAILSCALE_KEY" ]]; then
    generate_tailscale_key
  fi

  # Create a standalone copy (not overlay — we need raw conversion later)
  local device_image="$WORK_DIR/device-${DEVICE_ID}.qcow2"
  cp "$source_image" "$device_image"

  # All guestfish operations on the cold image
  customize_device_image "$device_image"
  convert_to_raw
  shrink_image

  # Move to output
  local output_file="$OUTPUT_DIR/kioskkit-${DEVICE_ID}.img"
  mv "$FINAL_IMAGE" "$output_file"

  local size
  size=$(du -h "$output_file" | cut -f1)
  log ""
  log "Image built successfully!"
  log "  Output: $output_file"
  log "  Size:   $size"
  log ""
  log "Flash with:"
  local sd_cards
  sd_cards=$(lsblk -d -n -o NAME,SIZE,TRAN,MODEL -b 2>/dev/null \
    | awk '$3 == "usb" && $2+0 >= 2147483648 && $2+0 <= 274877906944 {print $1, $2, $4}' \
    | while read -r name sz model; do
        label="blank"
        if lsblk -n -o FSTYPE "/dev/$name" 2>/dev/null | grep -q '[a-z]'; then
          label="has data"
        fi
        printf "/dev/%s (%.0fG, %s, %s)\n" "$name" "$(echo "$sz / 1073741824" | bc)" "$model" "$label"
      done)
  if [[ -n "$sd_cards" ]]; then
    while IFS= read -r card; do
      log "  sudo dd if=$output_file of=${card%% *} bs=4M status=progress  # ${card#* }"
    done <<< "$sd_cards"
  else
    log "  sudo dd if=$output_file of=/dev/sdX bs=4M status=progress"
  fi
  log "  # or use balenaEtcher"
}

# --- Main --------------------------------------------------------------------

main() {
  parse_args "$@"

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook dpkg-deb curl jq
  mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

  # Set BUILD_SSH_KEY path early so write_inventory can reference it.
  # The key itself is generated in create_pi_user() during Layer 1; on cached
  # runs the file already exists on disk.
  BUILD_SSH_KEY="$WORK_DIR/build-ssh-key"
  write_inventory

  # --- Layer 3 only: stamp device on existing app image ---
  if [[ $DEVICE_ONLY -eq 1 ]]; then
    [[ -f "$APP_IMAGE" ]] || err "No app image found at $APP_IMAGE. Run without --device-only first."
    stamp_device "$APP_IMAGE"
    return
  fi

  local base_hash app_hash
  # Base hash covers the provisioning role (minus app.yml/deploy.yml which are Layer 2).
  # Layer 1 runs provision.yml --skip-tags tailscale,app, so only role tasks
  # for packages, security, display, filesystem, etc. matter.
  base_hash=$(find "$REPO_ROOT/deploy/pi/ansible" -type f \
    -not -name 'deploy.yml' \
    -not -name 'app.yml' \
    -not -path "*/node_modules/*" \
    -not -path "*/dist/*" \
    -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
  # App hash covers deploy.yml, app.yml, application code, and lockfile.
  app_hash=$(compute_layer_hash \
    "$REPO_ROOT/deploy/pi/ansible/playbooks/deploy.yml" \
    "$REPO_ROOT/deploy/pi/ansible/roles/kioskkit/tasks/app.yml" \
    "$REPO_ROOT/packages" \
    "$REPO_ROOT/pnpm-lock.yaml" \
    "$REPO_ROOT/turbo.json")

  # --- Layer 1: Base system ---------------------------------------------------
  local base_changed=0
  if [[ $APP_ONLY -eq 1 ]]; then
    [[ -f "$BASE_IMAGE" ]] || err "No base image found at $BASE_IMAGE. Run without --app-only first."
    [[ -f "$KERNEL" ]] || err "No virt kernel found at $KERNEL. Run without --app-only first."
    log "Skipping base layer (--app-only)."
  elif [[ -f "$BASE_IMAGE" ]] && [[ "$(cat "$WORK_DIR/base-hash" 2>/dev/null)" == "$base_hash" ]] && [[ $FORCE -eq 0 ]]; then
    log "Base system cached (Ansible unchanged). Skipping to app deployment."
  else
    base_changed=1
    log "Building base system layer..."
    download_pios
    prepare_disk
    patch_image_for_virt
    boot_qemu
    provision_base
    wait_for_reboot
    shutdown_qemu
    cp "$DISK_IMAGE" "$BASE_IMAGE"
    echo "$base_hash" > "$WORK_DIR/base-hash"
    log "Base system layer cached."
  fi

  # --- Layer 2: App deployment ------------------------------------------------
  if [[ -f "$APP_IMAGE" ]] && [[ "$(cat "$WORK_DIR/app-hash" 2>/dev/null)" == "$app_hash" ]] && [[ $base_changed -eq 0 ]] && [[ $FORCE -eq 0 ]]; then
    log "App layer cached. Skipping to device stamping."
  else
    log "Building app deployment layer..."
    create_cow_overlay "$BASE_IMAGE" "$DISK_IMAGE"
    boot_qemu
    deploy_app
    shutdown_qemu
    flatten_overlay "$DISK_IMAGE" "$APP_IMAGE"
    echo "$app_hash" > "$WORK_DIR/app-hash"
    log "App layer cached."
  fi

  # --- Layer 3: Device customization (guestfish only, no QEMU) ----------------
  stamp_device "$APP_IMAGE"
}

main "$@"
