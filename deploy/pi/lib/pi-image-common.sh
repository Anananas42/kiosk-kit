#!/usr/bin/env bash
# pi-image-common.sh — Shared functions for Pi image building (emulator + SD card).
#
# Source this file after setting configuration variables. All functions use
# variables defined here with sensible defaults that consumers can override
# BEFORE sourcing.
#
# Required host tools: qemu-system-aarch64, qemu-img, guestfish, sshpass, curl, xz

# Guard against double-sourcing
[[ -n "${_PI_IMAGE_COMMON_LOADED:-}" ]] && return 0
_PI_IMAGE_COMMON_LOADED=1

# --- Default configuration (override before sourcing) ------------------------

: "${WORK_DIR:=.work}"
: "${CACHE_DIR:=$WORK_DIR/cache}"
: "${BOOT_DIR:=$WORK_DIR/boot}"
: "${BUILD_DIR:=$WORK_DIR/build}"
: "${RUN_DIR:=$WORK_DIR/run}"
: "${DISK_IMAGE:=$BUILD_DIR/disk.qcow2}"
: "${KERNEL:=$BOOT_DIR/vmlinuz}"
: "${INITRD:=$BOOT_DIR/initrd.img}"
: "${RAW_IMAGE:=$CACHE_DIR/raspios.img}"

: "${SSH_PORT:=2222}"
: "${QEMU_RAM:=6G}"
: "${QEMU_CPUS:=$(( $(nproc) / 2 ))}"

: "${PI_SSH_PASS:=raspberry}"

: "${PIOS_URL:=https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz}"
: "${PIOS_CHECKSUM:=6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4}"

# --- Utilities ---------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || err "Required command not found: $cmd"
  done
}

# Suppress GUI SSH password prompts and use sshpass for all SSH connections
export SSH_ASKPASS=""
export SSH_ASKPASS_REQUIRE=never
PI_SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

ssh_pi() {
  if [[ -n "${BUILD_SSH_KEY:-}" && -f "${BUILD_SSH_KEY:-}" ]]; then
    ssh -i "$BUILD_SSH_KEY" "${PI_SSH_OPTS[@]}" -p "$SSH_PORT" pi@localhost "$@"
  else
    sshpass -p "$PI_SSH_PASS" ssh "${PI_SSH_OPTS[@]}" -p "$SSH_PORT" pi@localhost "$@"
  fi
}

# --- QEMU PID tracking for wait_for_ssh death detection ----------------------

QEMU_PID=""

# --- Download & prepare Pi OS ------------------------------------------------

download_pios() {
  [[ -f "$RAW_IMAGE" ]] && return 0
  mkdir -p "$(dirname "$RAW_IMAGE")"
  log "Downloading Raspberry Pi OS Lite..."
  local local_xz="${RAW_IMAGE}.xz"
  curl -fL -o "$local_xz" "$PIOS_URL"
  log "Verifying checksum..."
  echo "$PIOS_CHECKSUM  $local_xz" | sha256sum -c - || err "Checksum mismatch for downloaded image"
  log "Decompressing..."
  xz -d "$local_xz"
}

prepare_disk() {
  log "Converting to qcow2 and resizing to 6G..."
  qemu-img convert -f raw -O qcow2 "$RAW_IMAGE" "$DISK_IMAGE"
  qemu-img resize "$DISK_IMAGE" 6G

  # Grow partition 2 to fill the disk, then resize the filesystem
  guestfish --rw -a "$DISK_IMAGE" <<'GROW_SCRIPT'
run
list-partitions
part-resize /dev/sda 2 -1
e2fsck-f /dev/sda2
resize2fs /dev/sda2
GROW_SCRIPT
}

# --- Kernel download & extraction --------------------------------------------

# Downloads the Debian arm64 kernel .deb, verifies checksum, extracts it.
# Sets: KERNEL_ROOT, PACKAGES_FILE (used by build_initrd)
download_and_extract_kernel() {
  local patch_dir="$1"
  local kernel_dir="$patch_dir/kernel"
  mkdir -p "$kernel_dir"

  log "Downloading Debian arm64 kernel package..."

  # Fetch the Packages index to find the current kernel version
  local packages_url="https://deb.debian.org/debian/dists/bookworm/main/binary-arm64/Packages.xz"
  PACKAGES_FILE="$kernel_dir/Packages"
  curl -fsSL "$packages_url" | xz -d > "$PACKAGES_FILE" \
    || err "Failed to fetch Debian arm64 package index"

  # Find the linux-image-arm64 meta-package and its dependency
  local real_kernel
  real_kernel=$(awk '/^Package: linux-image-arm64$/{found=1} found && /^Depends:/{print; exit}' "$PACKAGES_FILE" \
    | grep -oP 'linux-image-\d[^ ,]+') \
    || err "Could not determine kernel package name from Debian index"

  # Extract path and checksum for the actual kernel .deb
  local kernel_meta
  kernel_meta=$(awk "/^Package: ${real_kernel}\$/,/^\$/" "$PACKAGES_FILE")

  local kernel_path kernel_sha256
  kernel_path=$(echo "$kernel_meta" | awk '/^Filename:/{print $2; exit}') \
    || err "Could not find kernel .deb path in Debian index"
  kernel_sha256=$(echo "$kernel_meta" | awk '/^SHA256:/{print $2; exit}') \
    || err "Could not find kernel .deb checksum in Debian index"

  curl -fSL -o "$kernel_dir/kernel.deb" "https://deb.debian.org/debian/$kernel_path" \
    || err "Failed to download kernel package: $kernel_path"

  log "Verifying kernel package checksum..."
  echo "$kernel_sha256  $kernel_dir/kernel.deb" | sha256sum -c - \
    || err "Checksum mismatch for kernel package"

  # Extract kernel .deb on the host
  log "Extracting kernel package..."
  KERNEL_ROOT="$patch_dir/kernel-root"
  mkdir -p "$KERNEL_ROOT"
  dpkg-deb -x "$kernel_dir/kernel.deb" "$KERNEL_ROOT"
}

# --- Patch image for QEMU virt machine ---------------------------------------

patch_image_for_virt() {
  log "Patching image for QEMU virt machine (this takes a few minutes)..."

  mkdir -p "$BOOT_DIR" "$BUILD_DIR"
  local patch_dir="$BUILD_DIR/patch-files"
  mkdir -p "$patch_dir"

  # fstab for virtio-blk (/dev/vda* instead of PARTUUIDs).
  # Boot partition omitted — kernel is loaded directly by QEMU, and pi user/SSH
  # are set up in the image directly (no need for boot partition userconf/ssh flag).
  cat > "$patch_dir/fstab" <<'FSTAB'
/dev/vda2  /  ext4  defaults,noatime  0  1
FSTAB

  # Download and extract the Debian arm64 kernel
  download_and_extract_kernel "$patch_dir"

  # Build a single guestfish command file: patch files + install kernel
  log "Writing patches and kernel into image..."
  local gf_cmds="$patch_dir/guestfish.cmd"
  {
    echo "add $DISK_IMAGE"
    echo "run"
    echo "list-partitions"
    echo "mount /dev/sda2 /"
    echo "upload $patch_dir/fstab /etc/fstab"
    # Copy kernel modules to /usr/lib/modules/ (not /lib/ which is a symlink on Pi OS).
    # copy-in of /lib/ would replace the symlink with a directory, breaking the OS.
    echo "mkdir-p /usr/lib/modules"
    for moddir in "$KERNEL_ROOT"/lib/modules/*/; do
      echo "copy-in $moddir /usr/lib/modules"
    done
    # Copy boot files (vmlinuz, config, System.map) — these go into /boot
    for bootfile in "$KERNEL_ROOT"/boot/*; do
      [ -f "$bootfile" ] && echo "upload $bootfile /boot/$(basename "$bootfile")"
    done
  } > "$gf_cmds"

  guestfish < "$gf_cmds"

  # Create pi user via file-level edits (separate guestfish session for clarity).
  # Can't use useradd/chpasswd — ARM binaries, guestfish appliance is x86.
  create_pi_user

  # Save kernel to WORK_DIR for direct boot (used by run.sh too)
  cp "$KERNEL_ROOT"/boot/vmlinuz-* "$KERNEL"

  # Save the virt kernel version for later cleanup (used by restore_pi_boot_state)
  ls "$KERNEL_ROOT/lib/modules/" | head -1 > "$BOOT_DIR/virt-kernel-version"

  # Build a minimal initrd with virtio modules so the kernel can mount /dev/vda2.
  # The Debian arm64 kernel has virtio as modules, not built-in.
  build_initrd "$KERNEL_ROOT" "$PACKAGES_FILE"

  rm -rf "$patch_dir"
}

# --- Create pi user in image ------------------------------------------------

create_pi_user() {
  log "Creating pi user in image..."

  local user_dir="$BUILD_DIR/user-setup"
  mkdir -p "$user_dir"

  # Password hash for "raspberry": openssl passwd -6 -salt rpi raspberry
  local pass_hash='$6$rpi$bNU6H3//23Q69yt.29cRueoCEWuRY.XhpIClqSja6.FjhrGQgzD4RQp7YFBcMosjt9zRf60WsqRMRVvj7Z2gN1'

  # Generate an ephemeral SSH keypair for build-time access.
  # Password auth is disabled by the security tasks after reboot,
  # so post-reboot SSH (wait_for_reboot, wifi setup, etc.) needs key auth.
  : "${BUILD_SSH_KEY:=$BUILD_DIR/build-ssh-key}"
  rm -f "$BUILD_SSH_KEY" "${BUILD_SSH_KEY}.pub"
  ssh-keygen -t ed25519 -f "$BUILD_SSH_KEY" -N "" -q

  # Download files from image, edit on host, upload back
  guestfish --ro -a "$DISK_IMAGE" -m /dev/sda2 <<EOF
download /etc/passwd $user_dir/passwd
download /etc/shadow $user_dir/shadow
download /etc/group $user_dir/group
EOF

  # Remove any existing pi user (stock image may have a placeholder)
  sed -i '/^pi:/d' "$user_dir/passwd" "$user_dir/shadow"
  grep -q '^pi:' "$user_dir/group" || printf 'pi:x:1000:\n' >> "$user_dir/group"

  # Add pi user with password
  printf 'pi:x:1000:1000::/home/pi:/bin/bash\n' >> "$user_dir/passwd"
  printf 'pi:%s::0:99999:7:::\n' "$pass_hash" >> "$user_dir/shadow"

  # Add pi to sudo group (append to member list after the last colon)
  sed -i '/^sudo:/ { /pi/!s/$/pi/ }' "$user_dir/group"

  # Remove Pi OS SSH banner that blocks login until userconfig runs
  mkdir -p "$user_dir/sshd_config.d"
  : > "$user_dir/sshd_config.d/rename_user.conf"

  # Prepare authorized_keys with the ephemeral build key
  mkdir -p "$user_dir/ssh"
  cp "${BUILD_SSH_KEY}.pub" "$user_dir/ssh/authorized_keys"

  guestfish --rw -a "$DISK_IMAGE" -m /dev/sda2 <<EOF
upload $user_dir/passwd /etc/passwd
upload $user_dir/shadow /etc/shadow
upload $user_dir/group /etc/group

mkdir-p /home/pi
chown 1000 1000 /home/pi

# SSH key for build-time access
mkdir-p /home/pi/.ssh
upload $user_dir/ssh/authorized_keys /home/pi/.ssh/authorized_keys
chmod 0700 /home/pi/.ssh
chmod 0600 /home/pi/.ssh/authorized_keys
chown 1000 1000 /home/pi/.ssh
chown 1000 1000 /home/pi/.ssh/authorized_keys

# Enable SSH
ln-sf /usr/lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service

# Disable userconfig.service (we set up the user directly)
ln-sf /dev/null /etc/systemd/system/userconfig.service

# Remove SSH banner that blocks login
upload $user_dir/sshd_config.d/rename_user.conf /etc/ssh/sshd_config.d/rename_user.conf
EOF

  rm -rf "$user_dir"
}

# --- Build initrd with virtio modules ---------------------------------------

build_initrd() {
  local kernel_root="$1"
  local packages_file="$2"
  log "Building minimal initrd with virtio modules..."

  local initrd_dir="$BUILD_DIR/initrd-build"
  rm -rf "$initrd_dir"
  mkdir -p "$initrd_dir"/{bin,sbin,proc,sys,dev,lib/modules,etc,newroot}

  # Find the kernel version from the modules directory
  local kver
  kver=$(ls "$kernel_root/lib/modules/" | head -1)

  # Copy all virtio-related modules plus their PCI dependencies
  local mod_src="$kernel_root/lib/modules/$kver"
  local mod_dst="$initrd_dir/lib/modules"
  mkdir -p "$mod_dst"
  find "$mod_src" \( -name 'virtio*.ko*' -o -name 'vp_*.ko*' -o -name 'net_failover*.ko*' -o -name 'failover*.ko*' -o -name 'ext4.ko*' -o -name 'jbd2.ko*' -o -name 'mbcache.ko*' -o -name 'crc16.ko*' -o -name 'crc32c_generic.ko*' \) -type f -exec cp {} "$mod_dst/" \;

  # Download ARM64 busybox-static from Debian (host busybox is x86)
  log "Downloading ARM64 busybox-static..."
  local bb_meta bb_path
  bb_meta=$(awk '/^Package: busybox-static$/,/^$/' "$packages_file")
  bb_path=$(echo "$bb_meta" | awk '/^Filename:/{print $2; exit}')
  local bb_sha256
  bb_sha256=$(echo "$bb_meta" | awk '/^SHA256:/{print $2; exit}')
  local bb_deb="$initrd_dir/busybox-static.deb"
  curl -fsSL -o "$bb_deb" "https://deb.debian.org/debian/$bb_path" \
    || err "Failed to download busybox-static arm64"
  echo "$bb_sha256  $bb_deb" | sha256sum -c - \
    || err "Checksum mismatch for busybox-static arm64"
  local bb_extract="$initrd_dir/bb-extract"
  mkdir -p "$bb_extract"
  dpkg-deb -x "$bb_deb" "$bb_extract"
  cp "$bb_extract/bin/busybox" "$initrd_dir/bin/busybox"
  rm -rf "$bb_extract" "$bb_deb"
  # Create minimal symlinks
  for cmd in sh mount umount insmod mkdir switch_root; do
    ln -s busybox "$initrd_dir/bin/$cmd"
  done

  # Create init script
  cat > "$initrd_dir/init" <<'INIT_SCRIPT'
#!/bin/sh
/bin/mount -t proc proc /proc
/bin/mount -t sysfs sysfs /sys
/bin/mount -t devtmpfs devtmpfs /dev

# Load virtio modules in dependency order.
# Some may fail (already built-in or missing deps) — that's OK as long as
# virtio_blk loads so we can mount root.
for name in virtio virtio_ring vp_modern vp_legacy virtio_pci_modern_dev virtio_pci_legacy_dev virtio_pci virtio_mmio virtio_blk failover net_failover virtio_net crc16 crc32c_generic mbcache jbd2 ext4; do
  for mod in /lib/modules/${name}.ko*; do
    [ -f "$mod" ] && /bin/insmod "$mod" 2>/dev/null
  done
done

# Wait for /dev/vda2 to appear
n=0
while [ ! -b /dev/vda2 ] && [ $n -lt 50 ]; do
  sleep 0.1
  n=$((n+1))
done

if [ ! -b /dev/vda2 ]; then
  echo "FATAL: /dev/vda2 not found after loading virtio modules"
  echo "Available block devices:"
  ls -la /dev/vd* 2>/dev/null || echo "  (none)"
  echo "Loaded modules:"
  cat /proc/modules
  exec /bin/sh
fi

/bin/mount -t ext4 -o rw /dev/vda2 /newroot || {
  echo "FATAL: failed to mount /dev/vda2"
  ls -la /dev/vda* 2>/dev/null
  cat /proc/filesystems
  exec /bin/sh
}

# Verify root looks sane before switch
if [ ! -x /newroot/sbin/init ] && [ ! -L /newroot/sbin/init ]; then
  echo "WARN: /sbin/init not found, trying /lib/systemd/systemd"
  if [ -x /newroot/lib/systemd/systemd ]; then
    exec /bin/switch_root /newroot /lib/systemd/systemd
  fi
  echo "FATAL: no init found on root filesystem"
  ls -la /newroot/sbin/ 2>/dev/null
  exec /bin/sh
fi

exec /bin/switch_root /newroot /sbin/init
INIT_SCRIPT
  chmod +x "$initrd_dir/init"

  # Pack as cpio+gzip
  (cd "$initrd_dir" && find . | cpio -o -H newc --quiet | gzip -1) > "$INITRD"
  rm -rf "$initrd_dir"
  log "Initrd built: $(du -h "$INITRD" | cut -f1)"
}

# --- QEMU boot & lifecycle --------------------------------------------------

boot_qemu() {
  log "Booting QEMU for Ansible provisioning..."
  mkdir -p "$BUILD_DIR"
  [[ -f "$KERNEL" ]] || err "Kernel not found at $KERNEL — patch_image_for_virt failed?"

  local -a qemu_args=(
    -M virt -cpu cortex-a72 -m "$QEMU_RAM" -smp "$QEMU_CPUS"
    -kernel "$KERNEL"
    -initrd "$INITRD"
    -append "root=/dev/vda2 rw console=ttyAMA0 earlycon=pl011,0x09000000 panic=-1"
    -drive "if=virtio,file=$DISK_IMAGE,format=qcow2"
    -nic "user,model=virtio,hostfwd=tcp::${SSH_PORT}-:22"
    -display none -serial "file:$BUILD_DIR/qemu-console.log"
    -daemonize -pidfile "$BUILD_DIR/qemu.pid"
  )
  qemu-system-aarch64 "${qemu_args[@]}"

  QEMU_PID=$(cat "$BUILD_DIR/qemu.pid")
  log "QEMU started (PID $QEMU_PID)"
  wait_for_ssh "$SSH_PORT" 300
}

wait_for_ssh() {
  local port=$1 timeout=${2:-120}
  log "Waiting up to ${timeout}s for SSH on port $port..."
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    # Bail early if QEMU died (kernel panic, etc.)
    if [[ -n "${QEMU_PID:-}" ]] && ! kill -0 "$QEMU_PID" 2>/dev/null; then
      log "QEMU process exited unexpectedly. Console log:"
      tail -15 "$BUILD_DIR/qemu-console.log" 2>/dev/null
      err "QEMU died before SSH became available"
    fi
    if ssh_pi true 2>/dev/null; then
      log "SSH is up."
      return 0
    fi
    sleep 3
  done
  log "SSH timeout. Console log:"
  tail -15 "$WORK_DIR/qemu-console.log" 2>/dev/null
  err "SSH did not become available within ${timeout}s"
}

wait_for_reboot() {
  log "Waiting for VM to come back after reboot..."
  # After Ansible reboot, SSH will drop. Wait for it to return.
  sleep 10
  wait_for_ssh "$SSH_PORT" 300
}

shutdown_qemu() {
  log "Shutting down VM..."
  ssh_pi "sudo shutdown -h now" 2>/dev/null || true

  # Wait for QEMU to exit after guest shutdown
  local pid
  pid=$(cat "$BUILD_DIR/qemu.pid" 2>/dev/null || echo "")
  if [[ -n "$pid" ]]; then
    local wait_secs=0
    while kill -0 "$pid" 2>/dev/null && (( wait_secs < 60 )); do
      sleep 2
      ((wait_secs += 2))
    done
    kill "$pid" 2>/dev/null || true
  fi
  QEMU_PID=""
}

cleanup_qemu() {
  if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
    log "Shutting down QEMU (PID $QEMU_PID)..."
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
}

# --- Layer caching helpers --------------------------------------------------

# compute_layer_hash paths... — deterministic hash of all files under given paths.
# Works with both files and directories. Returns a single SHA-256 hex string.
compute_layer_hash() {
  find "$@" -type f \
    -not -path "*/node_modules/*" \
    -not -path "*/dist/*" \
    -not -path "*/.turbo/*" \
    -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

# create_cow_overlay base_image overlay_path — create a qcow2 overlay backed by base_image.
# QEMU can boot the overlay and all writes go to the overlay file, leaving the base untouched.
create_cow_overlay() {
  local base_image="$1"
  local overlay_path="$2"
  [[ -f "$base_image" ]] || err "Base image not found: $base_image"
  qemu-img create -f qcow2 -b "$base_image" -F qcow2 "$overlay_path"
}

# flatten_overlay overlay_path output_path — collapse a COW overlay into a standalone qcow2.
flatten_overlay() {
  local overlay_path="$1"
  local output_path="$2"
  qemu-img convert -f qcow2 -O qcow2 "$overlay_path" "$output_path"
}
