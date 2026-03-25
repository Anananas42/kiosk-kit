# SD Card Image Builder

Build flashable SD card images for KioskKit Pi devices — entirely on a local machine, no Pi hardware needed.

Uses `qemu-user-static` chroot to run the existing Ansible provisioning playbook inside a stock Raspberry Pi OS image, producing a device-specific `.img` file ready for `dd` or balenaEtcher.

## Prerequisites

Install on the build host (Debian/Ubuntu):

```bash
sudo apt-get install qemu-user-static binfmt-support kpartx parted ansible
```

Verify binfmt is registered:

```bash
ls /proc/sys/fs/binfmt_misc/qemu-aarch64
```

## Usage

### Production build

```bash
sudo ./deploy/pi/build-sd-image.sh \
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
sudo ./deploy/pi/build-sd-image.sh --dev
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

## What the image contains

The build runs the full Ansible provisioning playbook (`deploy/pi/ansible/playbooks/provision.yml`) inside the image via chroot, which configures:

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
2. Copies and expands the image to 6GB
3. Loop-mounts both partitions (boot + root) via `kpartx`
4. Sets up a chroot with bind mounts, DNS, and `qemu-aarch64-static`
5. Installs a fake `systemctl` wrapper (standard pi-gen pattern) for chroot compatibility
6. Runs `ansible-playbook provision.yml` with `ansible_connection: chroot`
7. Installs the Tailscale package via apt
8. Injects the first-boot Tailscale authentication service
9. Cleans up the chroot (removes wrapper, caches, qemu binary)
10. Unmounts everything and detaches loop devices
11. Shrinks the image with PiShrink (auto-expands on first boot)

## Troubleshooting

### "Required command not found"

Install the missing prerequisite. The script checks for: `qemu-aarch64-static`, `ansible-playbook`, `kpartx`, `parted`, `e2fsck`, `resize2fs`, `curl`, `chroot`.

### Stale mounts after a failed build

If the script crashes without cleanup:

```bash
sudo umount -R deploy/pi/.work/mnt
sudo kpartx -dv deploy/pi/.work/kioskkit-*.img
```

### Ansible fails in chroot

Check that binfmt_misc is properly registered for aarch64. The chroot runs ARM binaries through `qemu-aarch64-static` transparently.

## File structure

```
deploy/pi/
  build-sd-image.sh           # Main build script
  chroot-bin/
    fake-systemctl             # systemctl wrapper for chroot (not shipped in image)
  first-boot/
    kioskkit-tailscale-firstboot.service  # Systemd one-shot unit
    tailscale-firstboot.sh               # First-boot auth script
  ansible/                     # Existing Ansible playbooks and roles
  .output/                     # Built images (gitignored)
  .work/                       # Build cache (gitignored)
```
