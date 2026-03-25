# SD Card Image Builder

Build flashable SD card images for KioskKit Pi devices using QEMU system emulation — no sudo, no chroot, no binfmt_misc required. Only Docker is needed on the host.

## Prerequisites

- Docker (that's it — everything else is inside the container)

For running **without Docker** (e.g. in CI or on a Debian build host):

```bash
sudo apt-get install qemu-system-arm qemu-utils libguestfs-tools \
  linux-image-amd64 ansible sshpass curl xz-utils dpkg-dev python3 openssh-client
```

## Usage

### Production build

```bash
./deploy/pi/build-sd-image.sh \
  --device-id 042 \
  --customer-tag acme \
  --tailscale-key tskey-auth-XXXX
```

The script auto-detects if it's running outside a container and re-execs inside Docker. No `sudo` needed.

### Dev build

Set environment variables and use `--dev`:

```bash
export PI_DEV_DEVICE_ID=dev-001
export PI_DEV_CUSTOMER_TAG=dev
export PI_DEV_TAILSCALE_KEY=tskey-auth-XXXX
./deploy/pi/build-sd-image.sh --dev
```

### Output

```
deploy/pi/.output/kioskkit-<device-id>.img
```

Flash to an SD card:

```bash
sudo dd if=deploy/pi/.output/kioskkit-042.img of=/dev/sdX bs=4M status=progress
```

Or use [balenaEtcher](https://etcher.balena.io/).

## How it works

Uses the same QEMU system emulation approach as the Pi emulator (`dev/pi-emulator/build-image.sh`), with shared code in `deploy/pi/lib/pi-image-common.sh`:

1. Downloads and caches Raspberry Pi OS Lite (arm64, Bookworm)
2. Converts to qcow2, resizes partition and filesystem
3. Saves original Pi boot state (fstab, boot firmware listing)
4. Patches image for QEMU virt machine (Debian arm64 kernel, virtio modules, initrd)
5. Creates pi user via passwd/shadow/group file edits
6. Boots the image in QEMU with direct kernel boot (`-kernel`/`-initrd`)
7. Runs `ansible-playbook provision.yml` over SSH (skips tailscale, security, watchdog tags)
8. Waits for Ansible reboot, then shuts down QEMU cleanly
9. Restores native Pi boot state (original fstab, removes virt kernel artifacts)
10. Injects Tailscale first-boot service and arm64 .deb (offline install)
11. Converts qcow2 → raw .img and shrinks with virt-sparsify or PiShrink

## What the image contains

The build runs the full Ansible provisioning playbook (`deploy/pi/ansible/playbooks/provision.yml`) inside a booted VM, which configures:

- **OS packages**: Node.js, sway, Chromium, nftables, wpa_supplicant, etc.
- **Kiosk user**: locked system user with autologin
- **Application**: full pnpm install + build of the kiosk client
- **Systemd services**: kioskkit.service, nftables, wpa_supplicant
- **Display**: sway config, Chromium policies, getty autologin
- **Filesystem**: tmpfs on /tmp, noatime, performance governor
- **WiFi**: management scripts with sudoers rules
- **Tailscale**: arm64 .deb pre-installed, first-boot authentication service

## First-boot behavior

Tailscale cannot authenticate during the offline image build. Instead, the image includes a one-shot systemd service (`kioskkit-tailscale-firstboot.service`) that:

1. Waits for network and tailscaled to be ready
2. Reads device credentials from `/etc/kioskkit/tailscale-firstboot.conf`
3. Runs `tailscale up` with the auth key, hostname, and tags
4. On success: removes the config file and disables itself
5. On failure: exits non-zero so systemd retries on next boot

The auth key is embedded in the image — use a single-use or short-lived key for production.

## Docker image

The `Dockerfile` at `deploy/pi/Dockerfile` provides all build dependencies:

```bash
# Build the Docker image manually (normally done automatically)
docker build -t kioskkit-sd-builder deploy/pi/

# Run directly
docker run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$PWD/deploy/pi/.output:/output" \
  kioskkit-sd-builder --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
```

## Shared library

The QEMU image-building logic is shared between the SD card builder and the Pi emulator via `deploy/pi/lib/pi-image-common.sh`. This library provides:

- Pi OS download with checksum verification
- Disk preparation (qcow2 conversion, partition/filesystem resize)
- Debian arm64 kernel download, extraction, and image patching
- Pi user creation via passwd/shadow/group file edits
- Initrd building with virtio modules and ARM64 busybox
- QEMU boot, SSH wait (with death detection), reboot wait, shutdown
- Utility functions (log, err, require_cmd, ssh_pi)

## Troubleshooting

### "Docker is required when running outside a container"

Install Docker, or install the native prerequisites listed above.

### QEMU boot fails / SSH timeout

Check `$WORK_DIR/qemu-console.log` for kernel panic messages. Common causes:
- Insufficient RAM (increase `SD_BUILD_RAM`, default 4G)
- Kernel/initrd mismatch (delete `.work/` and rebuild)

### Ansible provisioning fails

The VM is left running on port 2222 for debugging. SSH in with:
```bash
sshpass -p raspberry ssh -o StrictHostKeyChecking=no -p 2222 pi@localhost
```

## Maintainability

| Change | What to update |
|--------|---------------|
| **New Pi OS release** | `PIOS_URL` and `PIOS_CHECKSUM` in both `build-sd-image.sh` and `lib/pi-image-common.sh` |
| **Ansible playbook changes** | Nothing — the build runs `provision.yml` directly |
| **Tailscale version** | `TAILSCALE_VERSION` and `TAILSCALE_DEB_URL` in `build-sd-image.sh` |
| **Shared build logic** | Edit `deploy/pi/lib/pi-image-common.sh` (used by both emulator and SD builder) |
| **First-boot service** | Edit `first-boot/tailscale-firstboot.sh` and/or the `.service` file |

## File structure

```
deploy/pi/
  build-sd-image.sh             # Main build script (QEMU system emulation)
  Dockerfile                    # Container with all build dependencies
  lib/
    pi-image-common.sh          # Shared functions (emulator + SD builder)
  first-boot/
    kioskkit-tailscale-firstboot.service  # Systemd one-shot unit
    tailscale-firstboot.sh               # First-boot auth script
  ansible/                      # Existing Ansible playbooks and roles
  .output/                      # Built images (gitignored)
  .work/                        # Build cache (gitignored)
```
