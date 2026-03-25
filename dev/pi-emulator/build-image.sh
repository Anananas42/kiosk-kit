#!/usr/bin/env bash
# build-image.sh — Download Pi OS, boot in QEMU, provision with Ansible, snapshot golden image.
#
# Prerequisites: qemu-system-aarch64, qemu-img, guestfish (libguestfs-tools)
#
# Usage: ./build-image.sh [--force]
#   --force   Rebuild the golden image even if it already exists.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Configuration -----------------------------------------------------------

# Raspberry Pi OS Lite (64-bit, Bookworm) — update URL when new releases ship.
PIOS_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
PIOS_CHECKSUM="6ac3a10a1f144c7e9d1f8e568d75ca809288280a593eb6ca053e49b539f465a4"

SSH_PORT=2222
QEMU_RAM="${PI_EMU_RAM:-6G}"
QEMU_CPUS="${PI_EMU_CPUS:-$(( $(nproc) / 2 ))}"

WORK_DIR="$SCRIPT_DIR/.work"
GOLDEN_IMAGE="$SCRIPT_DIR/golden.qcow2"
KERNEL="$WORK_DIR/vmlinuz"
INITRD="$WORK_DIR/initrd.img"
RAW_IMAGE="$WORK_DIR/raspios.img"
DISK_IMAGE="$WORK_DIR/disk.qcow2"
ANSIBLE_DIR="$REPO_ROOT/deploy/pi/ansible"

# --- Utilities ---------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Suppress GUI SSH password prompts and use sshpass for all SSH connections
export SSH_ASKPASS=""
export SSH_ASKPASS_REQUIRE=never
PI_SSH_PASS="raspberry"
PI_SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password -o PubkeyAuthentication=no)

ssh_pi() {
  sshpass -p "$PI_SSH_PASS" ssh "${PI_SSH_OPTS[@]}" -p "$SSH_PORT" pi@localhost "$@"
}

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || err "Required command not found: $cmd"
  done
}

wait_for_ssh() {
  local port=$1 timeout=${2:-120}
  log "Waiting up to ${timeout}s for SSH on port $port..."
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    # Bail early if QEMU died (kernel panic, etc.)
    if [[ -n "${QEMU_PID:-}" ]] && ! kill -0 "$QEMU_PID" 2>/dev/null; then
      log "QEMU process exited unexpectedly. Console log:"
      tail -15 "$WORK_DIR/qemu-console.log" 2>/dev/null
      err "QEMU died before SSH became available"
    fi
    if sshpass -p "$PI_SSH_PASS" ssh "${PI_SSH_OPTS[@]}" -o ConnectTimeout=2 \
         -p "$port" pi@localhost true 2>/dev/null; then
      log "SSH is up."
      return 0
    fi
    sleep 3
  done
  log "SSH timeout. Console log:"
  tail -15 "$WORK_DIR/qemu-console.log" 2>/dev/null
  err "SSH did not become available within ${timeout}s"
}

cleanup_qemu() {
  if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
    log "Shutting down QEMU (PID $QEMU_PID)..."
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
}
trap cleanup_qemu EXIT

# --- Domain functions --------------------------------------------------------

download_pios() {
  [[ -f "$RAW_IMAGE" ]] && return 0
  log "Downloading Raspberry Pi OS Lite..."
  local local_xz="$WORK_DIR/raspios.img.xz"
  curl -fL -o "$local_xz" "$PIOS_URL"
  log "Verifying checksum..."
  echo "$PIOS_CHECKSUM  $local_xz" | sha256sum -c - || err "Checksum mismatch for downloaded image"
  log "Decompressing..."
  xz -d "$local_xz"
}

prepare_disk() {
  log "Converting to qcow2 and resizing to 16G..."
  qemu-img convert -f raw -O qcow2 "$RAW_IMAGE" "$DISK_IMAGE"
  qemu-img resize "$DISK_IMAGE" 16G

  # Grow partition 2 to fill the disk, then resize the filesystem
  guestfish --rw -a "$DISK_IMAGE" <<'GROW_SCRIPT'
run
list-partitions
part-resize /dev/sda 2 -1
e2fsck-f /dev/sda2
resize2fs /dev/sda2
GROW_SCRIPT
}

create_pi_user() {
  log "Creating pi user in image..."

  local user_dir="$WORK_DIR/user-setup"
  mkdir -p "$user_dir"

  # Password hash for "raspberry": openssl passwd -6 raspberry
  local pass_hash='$6$rpi$bNU6H3//23Q69yt.29cRueoCEWuRY.XhpIClqSja6.FjhrGQgzD4RQp7YFBcMosjt9zRf60WsqRMRVvj7Z2gN1'

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

  guestfish --rw -a "$DISK_IMAGE" -m /dev/sda2 <<EOF
upload $user_dir/passwd /etc/passwd
upload $user_dir/shadow /etc/shadow
upload $user_dir/group /etc/group

mkdir-p /home/pi
chown 1000 1000 /home/pi

# Enable SSH
ln-sf /usr/lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service

# Disable userconfig.service (we set up the user directly)
ln-sf /dev/null /etc/systemd/system/userconfig.service

# Remove SSH banner that blocks login
upload $user_dir/sshd_config.d/rename_user.conf /etc/ssh/sshd_config.d/rename_user.conf
EOF

  rm -rf "$user_dir"
}

patch_image_for_virt() {
  log "Patching image for QEMU virt machine (this takes a few minutes)..."

  # Write files to temp dir for upload into the image via guestfish.
  # This avoids quoting issues with special characters in guestfish's write command.
  local patch_dir="$WORK_DIR/patch-files"
  mkdir -p "$patch_dir"

  # fstab for virtio-blk (/dev/vda* instead of PARTUUIDs).
  # Boot partition omitted — kernel is loaded directly by QEMU, and pi user/SSH
  # are set up in the image directly (no need for boot partition userconf/ssh flag).
  cat > "$patch_dir/fstab" <<'FSTAB'
/dev/vda2  /  ext4  defaults,noatime  0  1
FSTAB

  # Download the Debian arm64 kernel .deb directly from Debian's repo.
  # We can't run apt-get inside guestfish (no binfmt_misc for ARM), and can't
  # boot QEMU until the kernel with virtio drivers is installed (chicken-and-egg).
  # We also can't use `apt-get download` on an x86 host for arm64 packages.
  log "Downloading Debian arm64 kernel package..."
  local kernel_dir="$patch_dir/kernel"
  mkdir -p "$kernel_dir"

  # Fetch the Packages index to find the current kernel version
  local packages_url="https://deb.debian.org/debian/dists/bookworm/main/binary-arm64/Packages.xz"
  local packages_file="$kernel_dir/Packages"
  curl -fsSL "$packages_url" | xz -d > "$packages_file" \
    || err "Failed to fetch Debian arm64 package index"

  # Find the linux-image-arm64 meta-package and its dependency
  local real_kernel
  real_kernel=$(awk '/^Package: linux-image-arm64$/{found=1} found && /^Depends:/{print; exit}' "$packages_file" \
    | grep -oP 'linux-image-\d[^ ,]+') \
    || err "Could not determine kernel package name from Debian index"

  # Extract path and checksum for the actual kernel .deb
  local kernel_meta
  kernel_meta=$(awk "/^Package: ${real_kernel}\$/,/^\$/" "$packages_file")

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

  # Extract kernel .deb on the host, then do everything in one guestfish session
  log "Extracting kernel package..."
  local kernel_root="$patch_dir/kernel-root"
  mkdir -p "$kernel_root"
  dpkg-deb -x "$kernel_dir/kernel.deb" "$kernel_root"

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
    for moddir in "$kernel_root"/lib/modules/*/; do
      echo "copy-in $moddir /usr/lib/modules"
    done
    # Copy boot files (vmlinuz, config, System.map) — these go into /boot
    for bootfile in "$kernel_root"/boot/*; do
      [ -f "$bootfile" ] && echo "upload $bootfile /boot/$(basename "$bootfile")"
    done
  } > "$gf_cmds"

  guestfish < "$gf_cmds"

  # Create pi user via file-level edits (separate guestfish session for clarity).
  # Can't use useradd/chpasswd — ARM binaries, guestfish appliance is x86.
  create_pi_user

  # Save kernel to WORK_DIR for direct boot (used by run.sh too)
  cp "$kernel_root"/boot/vmlinuz-* "$KERNEL"

  # Build a minimal initrd with virtio modules so the kernel can mount /dev/vda2.
  # The Debian arm64 kernel has virtio as modules, not built-in.
  build_initrd "$kernel_root" "$packages_file"

  rm -rf "$patch_dir"
}

build_initrd() {
  local kernel_root="$1"
  local packages_file="$2"
  log "Building minimal initrd with virtio modules..."

  local initrd_dir="$WORK_DIR/initrd-build"
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

boot_qemu_for_provisioning() {
  log "Booting QEMU for Ansible provisioning..."
  [[ -f "$KERNEL" ]] || err "Kernel not found at $KERNEL — patch_image_for_virt failed?"

  local -a qemu_args=(
    -M virt -cpu cortex-a72 -m "$QEMU_RAM" -smp "$QEMU_CPUS"
    -kernel "$KERNEL"
    -initrd "$INITRD"
    -append "root=/dev/vda2 rw console=ttyAMA0 earlycon=pl011,0x09000000 panic=-1"
    -drive "if=virtio,file=$DISK_IMAGE,format=qcow2"
    -nic "user,model=virtio,hostfwd=tcp::${SSH_PORT}-:22"
    -display none -serial "file:$WORK_DIR/qemu-console.log"
    -no-reboot -daemonize -pidfile "$WORK_DIR/qemu.pid"
  )
  qemu-system-aarch64 "${qemu_args[@]}"

  QEMU_PID=$(cat "$WORK_DIR/qemu.pid")
  log "QEMU started (PID $QEMU_PID)"
  wait_for_ssh "$SSH_PORT" 300
}

provision_with_ansible() {
  log "Running Ansible provisioning..."

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
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password -o PubkeyAuthentication=no"
          # Tailscale is skipped in the emulator — use dummy values
          kioskkit_tailscale_auth_key: "skip"
          kioskkit_device_id: "emu-001"
          kioskkit_customer_tag: "emulator"
EOF

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/provision.yml" \
    --skip-tags tailscale \
    -e "kioskkit_tailscale_auth_key=skip" \
    || { err "Ansible provisioning failed. QEMU VM is still running on port $SSH_PORT for debugging."; }
}

setup_wifi_simulation() {
  log "Setting up mac80211_hwsim for WiFi testing..."
  ssh_pi "sudo modprobe mac80211_hwsim radios=2 2>/dev/null && echo 'mac80211_hwsim loaded' || echo 'WARN: mac80211_hwsim not available — WiFi simulation will be limited'"

  ssh_pi "echo 'mac80211_hwsim' | sudo tee /etc/modules-load.d/hwsim.conf >/dev/null; echo 'options mac80211_hwsim radios=2' | sudo tee /etc/modprobe.d/hwsim.conf >/dev/null"
}

deploy_kiosk_app() {
  log "Deploying kiosk application into the VM..."

  local inventory_file="$WORK_DIR/inventory.yml"

  ANSIBLE_CONFIG="$ANSIBLE_DIR/ansible.cfg" ansible-playbook \
    -i "$inventory_file" \
    "$ANSIBLE_DIR/playbooks/deploy.yml" \
    || { err "Ansible deploy failed. QEMU VM is still running on port $SSH_PORT for debugging."; }

  log "Waiting for kioskkit.service to start..."
  sleep 5

  local retries=12
  for (( i=1; i<=retries; i++ )); do
    if ssh_pi "curl -sf -o /dev/null http://localhost:3001/api/health" 2>/dev/null; then
      log "Kiosk server is healthy (port 3001)."
      return 0
    fi
    log "Health check attempt $i/$retries — waiting 5s..."
    sleep 5
  done

  err "Kiosk server health check failed after $retries attempts"
}

shutdown_and_snapshot() {
  log "Shutting down VM for snapshotting..."
  ssh_pi "sudo shutdown -h now" 2>/dev/null || true

  sleep 5
  if kill -0 "$QEMU_PID" 2>/dev/null; then
    kill "$QEMU_PID" 2>/dev/null || true
    wait "$QEMU_PID" 2>/dev/null || true
  fi
  unset QEMU_PID

  log "Creating golden image..."
  cp "$DISK_IMAGE" "$GOLDEN_IMAGE"

  log "Golden image created at: $GOLDEN_IMAGE"
  log "Size: $(du -h "$GOLDEN_IMAGE" | cut -f1)"
  log ""
  log "Next steps:"
  log "  ./run.sh          — Boot the golden image"
  log "  ./test.sh         — Run smoke tests"
}

# --- Main --------------------------------------------------------------------

main() {
  local force=0
  [[ "${1:-}" == "--force" ]] && force=1

  if [[ -f "$GOLDEN_IMAGE" && $force -eq 0 ]]; then
    log "Golden image already exists at $GOLDEN_IMAGE"
    log "Use --force to rebuild."
    exit 0
  fi

  require_cmd qemu-system-aarch64 qemu-img guestfish ssh sshpass ansible-playbook
  mkdir -p "$WORK_DIR"

  download_pios
  prepare_disk
  patch_image_for_virt
  boot_qemu_for_provisioning
  provision_with_ansible
  setup_wifi_simulation
  deploy_kiosk_app
  shutdown_and_snapshot
}

main "$@"
