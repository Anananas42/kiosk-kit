# SD Card Image Builder

Build flashable SD card images for KioskKit Pi 4/5 devices. Uses QEMU system
emulation — no sudo, no chroot, no binfmt_misc. Only Docker is needed on the
host.

Each image is device-specific with a baked-in Tailscale identity. The device is
fully operational after first boot: plug in power + ethernet, Tailscale
authenticates, kiosk app starts.

## Prerequisites

- Docker (everything else is inside the container)

For running without Docker (e.g. in CI):

```bash
sudo apt install qemu-system-arm qemu-utils libguestfs-tools \
  ansible sshpass curl xz-utils openssh-client
sudo chmod 644 /boot/vmlinuz-*  # libguestfs needs to read the host kernel
```

## Usage

### Production build

```bash
./deploy/pi/build-sd-image.sh \
  --device-id 042 \
  --customer-tag acme \
  --tailscale-key tskey-auth-XXXX
```

Auto-detects if running outside a container and re-execs inside Docker. No sudo needed.

### Dev build

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

Flash to SD card:

```bash
sudo dd if=deploy/pi/.output/kioskkit-042.img of=/dev/sdX bs=4M status=progress
# or use balenaEtcher
```

## How it works

Uses the same QEMU system emulation approach as the Pi emulator, with shared
code in `deploy/pi/lib/pi-image-common.sh`:

1. Downloads Raspberry Pi OS Lite (arm64, Bookworm) with checksum verification
2. Converts to qcow2, grows partition and filesystem via guestfish
3. Saves original Pi boot state (fstab, boot partition listing)
4. Patches image for QEMU virt (Debian arm64 kernel, virtio initrd, temporary fstab)
5. Creates pi user with ephemeral SSH key for build-time access
6. Boots in QEMU with direct kernel boot
7. Runs `ansible-playbook provision.yml` over SSH (skips tailscale only — security and watchdog are included)
8. Reboots (Ansible reconnects via SSH key since password auth is now disabled)
9. Shuts down QEMU
10. Restores native Pi boot state (original PARTUUID fstab, removes virt kernel)
11. Injects Tailscale: arm64 .deb (offline install) + first-boot auth service with device credentials
12. Removes ephemeral SSH key from the image
13. Converts qcow2 to raw .img and shrinks with virt-sparsify or PiShrink

## What the image contains

The full Ansible provisioning playbook runs inside the VM:

| Component | Details |
|-----------|---------|
| **OS packages** | Node.js 24, sway, Chromium, nftables, wpa_supplicant |
| **Kiosk user** | Locked system user, autologin on tty1, no SSH password access |
| **Application** | Full pnpm install + build of kiosk-server, kiosk-client, kiosk-admin |
| **Systemd services** | kioskkit.service, nftables, wpa_supplicant |
| **Security** | nftables firewall (drop-all except Tailscale/DHCP), SSH password auth disabled, USB storage blocked, sysctl hardening |
| **Display** | Sway compositor, Chromium kiosk mode, hidden cursor |
| **Watchdog** | bcm2835_wdt configured (activates on real Pi hardware) |
| **Filesystem** | tmpfs on /tmp, noatime, performance CPU governor |
| **WiFi** | Management scripts (scan/connect/forget/status) with sudoers |
| **Tailscale** | arm64 binary pre-installed, first-boot auth service |

## First-boot behavior

On first power-on with ethernet connected:

1. Pi boots with its native kernel and boot chain (fully restored)
2. `kioskkit.service` starts the kiosk app on localhost:3001
3. `kioskkit-tailscale-firstboot.service` runs:
   - Reads device credentials from `/etc/kioskkit/tailscale-firstboot.conf`
   - Runs `tailscale up --authkey` with hostname and tags
   - On success: deletes config file and disables itself
   - On failure: exits non-zero, retries on next boot (safe to reboot without ethernet)
4. Device appears in Tailscale admin console, accessible remotely

The Tailscale auth key is embedded in the image between flash and first successful boot. Use single-use or short-lived keys for production.

## SSH access

The build process uses an ephemeral ed25519 keypair for SSH during QEMU
provisioning. This key is removed from the final SD card image — the production
device has no SSH password access and no authorized keys. Remote access is
exclusively via Tailscale.

## Docker image

The `Dockerfile` provides all build dependencies:

```bash
# Normally automatic, but can be built manually
docker build -t kioskkit-sd-builder deploy/pi/

docker run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$PWD/deploy/pi/.output:/output" \
  kioskkit-sd-builder --device-id 042 --customer-tag acme --tailscale-key tskey-auth-XXXX
```

Environment variables for tuning:
- `SD_BUILD_RAM` — QEMU guest RAM (default: 4G)
- `SD_BUILD_CPUS` — QEMU guest CPUs (default: half of host cores)

## Shared library

The QEMU image-building logic is shared between the SD card builder and the Pi
emulator (`dev/pi-emulator/`) via `deploy/pi/lib/pi-image-common.sh`:

- Pi OS download with checksum verification
- Disk preparation (qcow2 conversion, partition/filesystem resize via guestfish)
- Debian arm64 kernel download and extraction from Debian repos
- Image patching for QEMU virt (kernel modules to `/usr/lib/modules/`, fstab)
- Pi user creation via passwd/shadow/group file edits + ephemeral SSH key
- Initrd building with virtio + ext4 modules and ARM64 busybox-static
- QEMU boot with direct kernel, SSH wait with death detection, shutdown

## Troubleshooting

### SSH timeout during build

Check `$WORK_DIR/qemu-console.log` for kernel panics. Common causes:
- Insufficient RAM (increase `SD_BUILD_RAM`)
- Kernel/initrd mismatch (delete `.work/` and rebuild)

### Ansible provisioning fails

The VM is left running for debugging:
```bash
ssh -i $WORK_DIR/build-ssh-key -p 2222 pi@localhost
```

### Image doesn't boot on Pi

Verify `restore_pi_boot_state` ran successfully — check that the original fstab (PARTUUID-based) was restored and virt kernel files were removed from `/boot/`.

## Maintainability

| Change | What to update |
|--------|---------------|
| New Pi OS release | `PIOS_URL` + `PIOS_CHECKSUM` in `lib/pi-image-common.sh` |
| Ansible playbook changes | Nothing — the build runs `provision.yml` directly |
| Tailscale version | `TAILSCALE_VERSION`, `TAILSCALE_DEB_URL`, `TAILSCALE_DEB_CHECKSUM` in `build-sd-image.sh` |
| Shared build logic | Edit `lib/pi-image-common.sh` (used by both emulator and SD builder) |
| First-boot service | Edit `first-boot/tailscale-firstboot.sh` and/or the `.service` file |

## File structure

```
deploy/pi/
  build-sd-image.sh             # Main build script
  Dockerfile                    # Container with all build dependencies
  README.md                     # This file
  lib/
    pi-image-common.sh          # Shared functions (emulator + SD builder)
  first-boot/
    kioskkit-tailscale-firstboot.service  # Systemd one-shot unit
    tailscale-firstboot.sh               # First-boot auth script
  ansible/                      # Ansible playbooks and roles
  .output/                      # Built images (gitignored)
  .work/                        # Build cache (gitignored)
```
