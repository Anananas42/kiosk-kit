#!/usr/bin/env bash
# build-sd-image.sh — Build a flashable SD card image for KioskKit Pi devices.
#
# Uses a three-layer cache so that per-device stamping takes ~30s (no QEMU boot):
#
#   Layer 1 (base system, ~25 min):  Pi OS + QEMU patches + Ansible provision (--skip-tags tailscale,app)
#   Layer 2 (app deploy, ~5 min):    Boot base overlay, run deploy.yml, snapshot app image
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
QEMU_RAM="${SD_BUILD_RAM:-4G}"
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

  [[ -n "$DEVICE_ID" ]]     || err "Missing --device-id (or set PI_DEV_DEVICE_ID with --dev)"
  [[ -n "$CUSTOMER_TAG" ]]  || err "Missing --customer-tag (or set PI_DEV_CUSTOMER_TAG with --dev)"
  # If no explicit key provided, auto-generate one via Tailscale API
  if [[ -z "$TAILSCALE_KEY" ]]; then
    generate_tailscale_key
  fi

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
  description="kioskkit-${DEVICE_ID} build $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local payload
  payload=$(jq -n \
    --argjson tags "$tags_json" \
    --arg desc "$description" \
    '{capabilities: {devices: {create: {reusable: false, ephemeral: false, tags: $tags}}}, description: $desc}')

  local response curl_err
  if ! response=$(curl -fsS --max-time 30 \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "https://api.tailscale.com/api/v2/tailnet/${TAILSCALE_TAILNET}/keys" 2>/tmp/curl_stderr); then
    curl_err=$(cat /tmp/curl_stderr)
    err "Tailscale API call failed: ${response:-$curl_err}"
  fi

  TAILSCALE_KEY=$(printf '%s' "$response" | jq -r '.key // empty') \
    || err "Failed to parse Tailscale API response"
  [[ -n "$TAILSCALE_KEY" ]] || err "Tailscale API returned empty key. Response: $response"

  local key_id
  key_id=$(printf '%s' "$response" | jq -r '.id // "unknown"')
  log "Generated Tailscale auth key: id=$key_id description=\"$description\""
}

# --- SD image specific functions ---------------------------------------------

save_original_boot_state() {
  log "Saving original Pi boot state for later restoration..."
  local orig_dir="$WORK_DIR/original-boot"
  mkdir -p "$orig_dir"

  # Save original fstab and list boot firmware contents.
  # At this point the image still has the original 2-partition Pi OS layout;
  # prepare_disk() has not yet expanded it to 4 partitions.
  guestfish --ro -a "$DISK_IMAGE" <<EOF
run
mount /dev/sda2 /
mount /dev/sda1 /boot/firmware
download /etc/fstab $orig_dir/fstab
# List boot firmware files so we know what belongs to Pi vs. virt kernel
ls /boot/firmware
EOF
  # Also save the partition info for reference
  guestfish --ro -a "$DISK_IMAGE" <<'EOF' > "$orig_dir/boot-files.txt"
run
mount /dev/sda1 /
ls /
EOF
  log "Original boot state saved to $orig_dir"
}

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

# deploy_app — run deploy.yml to sync code and build the application (Layer 2).
deploy_app() {
  log "Deploying kiosk application into the VM..."

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$WORK_DIR/inventory.yml" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || err "Ansible deploy failed. QEMU VM is still running on port $SSH_PORT for debugging."
}

restore_pi_boot_state() {
  local target_image="$1"
  log "Restoring native Pi boot state..."
  local orig_dir="$WORK_DIR/original-boot"

  # Build a Pi-native fstab with PARTUUID references and data partition bind mounts.
  # We read the PARTUUIDs from the image and construct the fstab.
  local fstab_dir="$WORK_DIR/pi-fstab"
  mkdir -p "$fstab_dir"

  # Get PARTUUIDs from the image
  local partuuid_p1 partuuid_p2
  partuuid_p1=$(guestfish --ro -a "$target_image" <<'EOF'
run
blkid /dev/sda1
EOF
  )
  partuuid_p1=$(echo "$partuuid_p1" | grep -oP 'PARTUUID=\K[^ "]+' || true)

  partuuid_p2=$(guestfish --ro -a "$target_image" <<'EOF'
run
blkid /dev/sda2
EOF
  )
  partuuid_p2=$(echo "$partuuid_p2" | grep -oP 'PARTUUID=\K[^ "]+' || true)

  # Build fstab — use original PARTUUIDs for boot+root, LABEL for data
  cat > "$fstab_dir/fstab" <<FSTAB
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

  # Restore fstab and remove virt kernel files.
  local virt_kver
  virt_kver=$(cat "$WORK_DIR/virt-kernel-version" 2>/dev/null || true)

  local gf_cmds="$WORK_DIR/restore-boot.cmd"
  {
    echo "add $target_image"
    echo "run"
    echo "mount /dev/sda2 /"
    echo "upload $fstab_dir/fstab /etc/fstab"
    # Create bind mount target directories
    echo "mkdir-p /data"
    echo "mkdir-p /opt/kioskkit/data"
    echo "mkdir-p /var/lib/tailscale"
    echo "mkdir-p /etc/wpa_supplicant"
    echo "mkdir-p /etc/kioskkit"
    echo "mkdir-p /var/log/journal"
    # Remove virt kernel modules if we know the version
    if [[ -n "$virt_kver" ]]; then
      echo "rm-rf /usr/lib/modules/$virt_kver"
    fi
    # Remove virt boot files (vmlinuz-*, config-*, System.map-* from Debian kernel)
    echo "glob rm /boot/vmlinuz-*"
    echo "glob rm /boot/config-*"
    echo "glob rm /boot/System.map-*"
  } > "$gf_cmds"

  guestfish < "$gf_cmds" || log "WARN: Some restore commands failed (may be OK if files didn't exist)"
  rm -f "$gf_cmds"
  rm -rf "$fstab_dir"

  log "Pi boot state restored."
}

inject_tailscale_firstboot() {
  local target_image="$1"
  log "Injecting Tailscale first-boot service..."

  local inject_dir="$WORK_DIR/inject-files"
  mkdir -p "$inject_dir/etc/kioskkit"

  # Write config file with device-specific values
  cat > "$inject_dir/tailscale-firstboot.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
TAILSCALE_AUTH_KEY=${TAILSCALE_KEY}
EOF

  # Write device config for the data partition (persists across OTA updates)
  cat > "$inject_dir/device.conf" <<EOF
DEVICE_ID=${DEVICE_ID}
CUSTOMER_TAG=${CUSTOMER_TAG}
EOF

  # Download Tailscale arm64 .deb for offline installation
  log "Downloading Tailscale arm64 .deb..."
  local ts_deb="$inject_dir/tailscale.deb"
  curl -fSL -o "$ts_deb" "$TAILSCALE_DEB_URL" \
    || err "Failed to download Tailscale .deb from $TAILSCALE_DEB_URL"
  echo "$TAILSCALE_DEB_CHECKSUM  $ts_deb" | sha256sum -c - \
    || err "Checksum mismatch for Tailscale .deb"

  # Inject first-boot service into rootfs (p2)
  guestfish --rw -a "$target_image" -m /dev/sda2 <<EOF
# First-boot service and script
upload $REPO_ROOT/deploy/pi/first-boot/kioskkit-tailscale-firstboot.service /etc/systemd/system/kioskkit-tailscale-firstboot.service
mkdir-p /opt/kioskkit/system
upload $REPO_ROOT/deploy/pi/first-boot/tailscale-firstboot.sh /opt/kioskkit/system/tailscale-firstboot.sh
chmod 0755 /opt/kioskkit/system/tailscale-firstboot.sh

# Enable the first-boot service
mkdir-p /etc/systemd/system/multi-user.target.wants
ln-sf /etc/systemd/system/kioskkit-tailscale-firstboot.service /etc/systemd/system/multi-user.target.wants/kioskkit-tailscale-firstboot.service
EOF

  # Stamp device config and Tailscale firstboot config onto data partition (p4)
  guestfish --rw -a "$target_image" -m /dev/sda4 <<EOF
# Device config on data partition
mkdir-p /kioskkit-config
upload $inject_dir/device.conf /kioskkit-config/device.conf
chmod 0644 /kioskkit-config/device.conf

# Tailscale firstboot config on data partition
upload $inject_dir/tailscale-firstboot.conf /kioskkit-config/tailscale-firstboot.conf
chmod 0600 /kioskkit-config/tailscale-firstboot.conf

# Initialize OTA state
mkdir-p /ota
mkdir-p /ota/pending
write /ota/boot-slot "A"
write /ota/state.json "{\"status\":\"idle\",\"slot\":\"A\"}"
EOF

  # Generate SSH host keys on the data partition
  log "Generating SSH host keys on data partition..."
  local ssh_dir="$inject_dir/ssh-keys"
  mkdir -p "$ssh_dir"
  ssh-keygen -t rsa -b 4096 -f "$ssh_dir/ssh_host_rsa_key" -N "" -q
  ssh-keygen -t ecdsa -b 521 -f "$ssh_dir/ssh_host_ecdsa_key" -N "" -q
  ssh-keygen -t ed25519 -f "$ssh_dir/ssh_host_ed25519_key" -N "" -q

  local gf_ssh="$inject_dir/guestfish-ssh.cmd"
  {
    echo "add $target_image"
    echo "run"
    echo "mount /dev/sda4 /"
    echo "mkdir-p /ssh"
    for keytype in rsa ecdsa ed25519; do
      echo "upload $ssh_dir/ssh_host_${keytype}_key /ssh/ssh_host_${keytype}_key"
      echo "chmod 0600 /ssh/ssh_host_${keytype}_key"
      echo "upload $ssh_dir/ssh_host_${keytype}_key.pub /ssh/ssh_host_${keytype}_key.pub"
      echo "chmod 0644 /ssh/ssh_host_${keytype}_key.pub"
    done
  } > "$gf_ssh"
  guestfish < "$gf_ssh"

  # Extract Tailscale .deb on the host and copy files into the rootfs image
  local ts_root="$inject_dir/tailscale-root"
  mkdir -p "$ts_root"
  dpkg-deb -x "$ts_deb" "$ts_root"

  # Build a guestfish command file to copy Tailscale files
  local gf_cmds="$inject_dir/guestfish-ts.cmd"
  {
    echo "add $target_image"
    echo "run"
    echo "mount /dev/sda2 /"
    # Copy binaries
    if [ -f "$ts_root/usr/bin/tailscale" ]; then
      echo "upload $ts_root/usr/bin/tailscale /usr/bin/tailscale"
      echo "chmod 0755 /usr/bin/tailscale"
    fi
    if [ -f "$ts_root/usr/sbin/tailscaled" ]; then
      echo "upload $ts_root/usr/sbin/tailscaled /usr/sbin/tailscaled"
      echo "chmod 0755 /usr/sbin/tailscaled"
    fi
    # Copy systemd service
    if [ -f "$ts_root/lib/systemd/system/tailscaled.service" ]; then
      echo "upload $ts_root/lib/systemd/system/tailscaled.service /usr/lib/systemd/system/tailscaled.service"
      echo "mkdir-p /etc/systemd/system/multi-user.target.wants"
      echo "ln-sf /usr/lib/systemd/system/tailscaled.service /etc/systemd/system/multi-user.target.wants/tailscaled.service"
    fi
    # Copy defaults file if present
    if [ -f "$ts_root/etc/default/tailscaled" ]; then
      echo "mkdir-p /etc/default"
      echo "upload $ts_root/etc/default/tailscaled /etc/default/tailscaled"
    fi
  } > "$gf_cmds"

  guestfish < "$gf_cmds"
  rm -rf "$inject_dir"

  log "Tailscale first-boot service injected."
}

remove_build_ssh_key() {
  local target_image="$1"
  log "Removing build SSH key from image..."
  guestfish --rw -a "$target_image" -m /dev/sda2 <<'EOF'
rm-f /home/pi/.ssh/authorized_keys
EOF
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

  # Use virt-sparsify if available, otherwise try PiShrink
  if command -v virt-sparsify >/dev/null 2>&1; then
    log "Using virt-sparsify..."
    local sparse_output="$WORK_DIR/kioskkit-${DEVICE_ID}-sparse.img"
    virt-sparsify "$FINAL_IMAGE" "$sparse_output"
    mv "$sparse_output" "$FINAL_IMAGE"
  else
    log "Downloading PiShrink..."
    local pishrink="$WORK_DIR/pishrink.sh"
    curl -fL -o "$pishrink" "https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh"
    chmod +x "$pishrink"
    bash "$pishrink" "$FINAL_IMAGE"
  fi

  log "Image shrunk: $(du -h "$FINAL_IMAGE" | cut -f1)"
}

# stamp_device — Layer 3: all guestfish operations for per-device customization.
# No QEMU boot required — operates on a cold disk image.
stamp_device() {
  local source_image="$1"
  log "Stamping device image for device=$DEVICE_ID..."

  # Create a standalone copy (not overlay — we need raw conversion later)
  local device_image="$WORK_DIR/device-${DEVICE_ID}.qcow2"
  cp "$source_image" "$device_image"

  # All operations on the cold image via guestfish
  restore_pi_boot_state "$device_image"
  inject_tailscale_firstboot "$device_image"
  remove_build_ssh_key "$device_image"
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
  log "  sudo dd if=$output_file of=/dev/sdX bs=4M status=progress"
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

  local ansible_hash app_hash
  ansible_hash=$(compute_layer_hash "$REPO_ROOT/deploy/pi/ansible")
  app_hash=$(compute_layer_hash "$REPO_ROOT/packages" "$REPO_ROOT/pnpm-lock.yaml" "$REPO_ROOT/turbo.json")

  # --- Layer 1: Base system ---------------------------------------------------
  local base_changed=0
  if [[ $APP_ONLY -eq 1 ]]; then
    [[ -f "$BASE_IMAGE" ]] || err "No base image found at $BASE_IMAGE. Run without --app-only first."
    [[ -f "$KERNEL" ]] || err "No virt kernel found at $KERNEL. Run without --app-only first."
    log "Skipping base layer (--app-only)."
  elif [[ -f "$BASE_IMAGE" ]] && [[ "$(cat "$WORK_DIR/base-hash" 2>/dev/null)" == "$ansible_hash" ]] && [[ $FORCE -eq 0 ]]; then
    log "Base system cached (Ansible unchanged). Skipping to app deployment."
  else
    base_changed=1
    log "Building base system layer..."
    download_pios
    prepare_disk
    save_original_boot_state
    patch_image_for_virt
    boot_qemu
    provision_base
    wait_for_reboot
    shutdown_qemu
    cp "$DISK_IMAGE" "$BASE_IMAGE"
    echo "$ansible_hash" > "$WORK_DIR/base-hash"
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
