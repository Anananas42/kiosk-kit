# SD Card Image Builder

Build flashable SD card images for KioskKit Pi devices — entirely on a local machine, no Pi hardware needed, no sudo required.

Uses QEMU system emulation (aarch64 virt machine) to boot Raspberry Pi OS, run Ansible provisioning over SSH, then finalizes the image for real Pi hardware.

## Prerequisites

Install on the build host (Debian/Ubuntu):

```bash
sudo apt-get install qemu-system-arm qemu-utils libguestfs-tools ansible sshpass curl xz-utils parted
```

Or skip local setup entirely and use Docker (see below).

## Usage

### Production build

```bash
./deploy/pi/build-sd-image.sh \
  --device-id 042 \
  --customer-tag acme \
  --tailscale-key tskey-auth-XXXX
```

### Dev build

Set environment variables and use `--dev`:

```bash
export PI_DEV_DEVICE_ID=dev-001
export PI_DEV_CUSTOMER_TAG=dev
export PI_DEV_TAILSCALE_KEY=tskey-auth-XXXX
./deploy/pi/build-sd-image.sh --dev
```

### Docker build (recommended)

No local dependencies needed beyond Docker:

```bash
./deploy/pi/build-sd-image.sh --docker \
  --device-id 042 \
  --customer-tag acme \
  --tailscale-key tskey-auth-XXXX
```

The `--docker` flag builds a container image with all prerequisites and runs the build inside it. The output `.img` file is bind-mounted back to `.output/`.

### Output

```
deploy/pi/.output/kioskkit-<device-id>.img
```

Flash to an SD card:

```bash
sudo dd if=deploy/pi/.output/kioskkit-042.img of=/dev/sdX bs=4M status=progress
```

Or use [balenaEtcher](https://etcher.balena.io/).

## What the image contains

The build runs the full Ansible provisioning playbook (`deploy/pi/ansible/playbooks/provision.yml`) and deploy playbook inside a QEMU VM, which configures:

- **OS packages**: Node.js, sway, Chromium, nftables, wpa_supplicant, etc.
- **Kiosk user**: locked system user with autologin
- **Application**: full pnpm install + build of the kiosk client
- **Systemd services**: kioskkit.service, nftables, wpa_supplicant
- **Display**: sway config, Chromium policies, getty autologin
- **Security**: USB storage blocked, sysctl hardening, firewall, SSH hardened
- **Watchdog**: bcm2835_wdt configured
- **Filesystem**: tmpfs on /tmp, noatime, performance governor
- **WiFi**: management scripts with sudoers rules
- **Tailscale**: package installed, first-boot authentication service

## First-boot behavior

Tailscale cannot authenticate during the offline image build. Instead, the image includes a one-shot systemd service (`kioskkit-tailscale-firstboot.service`) that:

1. Waits for network and tailscaled to be ready
2. Reads device credentials from `/etc/kioskkit/tailscale-firstboot.conf`
3. Runs `tailscale up` with the auth key, hostname, and tags
4. On success: removes the config file and disables itself
5. On failure: exits non-zero so systemd retries on next boot

The auth key is embedded in the image — use a single-use or short-lived key for production.

## How it works

1. Downloads and caches Raspberry Pi OS Lite (arm64, Bookworm)
2. Saves the original Pi OS fstab (with PARTUUIDs for real hardware)
3. Converts to qcow2, resizes to 16GB, grows the root partition
4. Patches the image for QEMU virt: installs Debian arm64 kernel, builds initrd, sets virt fstab
5. Creates the `pi` user with SSH access
6. Boots QEMU aarch64 virt machine with the patched image
7. Runs `ansible-playbook provision.yml` over SSH (handles the post-provisioning reboot)
8. Runs `ansible-playbook deploy.yml` over SSH (deploys the kiosk app)
9. Installs the Tailscale package via SSH (apt-get inside the running VM)
10. Shuts down QEMU cleanly
11. Post-processing via guestfish: restores original Pi fstab, removes virt kernel, injects first-boot Tailscale service and device credentials
12. Converts qcow2 back to raw .img and truncates to actual partition end

## Troubleshooting

### "Required command not found"

Install the missing prerequisite, or use `--docker` to run inside a container with everything pre-installed.

### QEMU boot fails / SSH timeout

Check `deploy/pi/.work/qemu-console.log` for kernel panic or boot errors. Common causes:
- Not enough RAM (set `PI_EMU_RAM=8G`)
- Missing kernel modules in initrd

### Ansible fails

The QEMU VM stays running on port 2222 for debugging. SSH in with:

```bash
sshpass -p raspberry ssh -o StrictHostKeyChecking=no -p 2222 pi@localhost
```

## Maintainability

What to update when things change:

| Change | What to update |
|--------|---------------|
| **New Pi OS release** | `PIOS_URL` and `PIOS_CHECKSUM` in `lib/common.sh`. Delete `.work/raspios.img` to force re-download. |
| **Ansible playbook changes** | Nothing — the build runs playbooks directly, so changes are picked up automatically. |
| **Tailscale install method changes** | Update `install_tailscale_via_ssh()` in `build-sd-image.sh`. |
| **First-boot service changes** | Edit `first-boot/tailscale-firstboot.sh` and/or `first-boot/kioskkit-tailscale-firstboot.service`. |
| **New device credentials or flags** | Add to `parse_args()` in `build-sd-image.sh` and to the config file written in `finalize_image()`. |
| **Docker image issues** | Update `deploy/pi/Dockerfile`. The image is based on `debian:bookworm-slim`. |

## File structure

```
deploy/pi/
  build-sd-image.sh           # Main build script (also wraps into Docker with --docker)
  Dockerfile                   # Container image for self-contained builds
  lib/
    common.sh                  # Shared QEMU/guestfish library (also used by pi-emulator)
  first-boot/
    kioskkit-tailscale-firstboot.service  # Systemd one-shot unit
    tailscale-firstboot.sh               # First-boot auth script
  ansible/                     # Existing Ansible playbooks and roles
  .output/                     # Built images (gitignored)
  .work/                       # Build cache (gitignored)
```
