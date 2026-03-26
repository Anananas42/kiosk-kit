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
  ansible sshpass curl jq xz-utils openssh-client
sudo chmod 644 /boot/vmlinuz-*  # libguestfs needs to read the host kernel
```

## Usage

### Production build (explicit key)

```bash
./deploy/pi/build-sd-image.sh \
  --device-id 042 \
  --customer-tag acme \
  --tailscale-key tskey-auth-XXXX
```

### Production build (auto-generate key via API)

If `--tailscale-key` is omitted, the script generates a single-use auth key via the
Tailscale API. Set the required credentials in `.env` or as environment variables:

```bash
# .env (or export these)
TAILSCALE_OAUTH_CLIENT_ID=your-client-id
TAILSCALE_OAUTH_CLIENT_SECRET=tskey-client-XXXX
TAILSCALE_TAILNET=your-tailnet.ts.net

./deploy/pi/build-sd-image.sh \
  --device-id 042 \
  --customer-tag acme
```

The generated key is single-use, non-reusable, non-ephemeral, and tagged with
`tag:kioskkit` (plus `tag:<customer-tag>` when set).

Auto-detects if running outside a container and re-execs inside Docker. No sudo needed.

### Dev build

```bash
export PI_DEV_DEVICE_ID=dev-001
export PI_DEV_CUSTOMER_TAG=dev
export PI_DEV_TAILSCALE_KEY=tskey-auth-XXXX   # optional — falls back to API generation
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

**Layer 1 — Base system (~25 min, cached):**

1. Downloads Raspberry Pi OS Lite (arm64, Bookworm) with checksum verification
2. Converts to qcow2, creates 4-partition A/B layout (boot + rootA + rootB + data) via guestfish
3. Patches image for QEMU virt (Debian arm64 kernel, virtio initrd, temporary fstab)
4. Creates pi user with ephemeral SSH key for build-time access
5. Boots in QEMU with direct kernel boot
6. Runs `ansible-playbook provision.yml --skip-tags tailscale,app` over SSH
7. Reboots (reconnects via SSH key since password auth is now disabled)
8. Shuts down, snapshots as `provisioned-base.qcow2`

**Layer 2 — App deployment (~5 min, cached):**

9. Creates COW overlay on base image, boots QEMU
10. Runs `ansible-playbook deploy.yml`:
    - Remounts `/tmp` to 512M (default 64M tmpfs is too small for node-gyp)
    - Syncs only kiosk packages (kiosk-client, kiosk-server, kiosk-admin, shared, ui)
    - Strips root devDependencies from `package.json` (turbo, biome, playwright, etc. not needed on Pi)
    - Runs filtered `pnpm install` and `pnpm build`
11. Shuts down, flattens overlay to `app-image.qcow2`

**Layer 3 — Device stamp (~30 sec, per device):**

12. Copies app image, customizes via guestfish (no QEMU boot):
    - Restores native Pi boot state (PARTUUID fstab, removes virt kernel)
    - Injects Tailscale arm64 binary + first-boot auth service with device credentials
    - Generates unique SSH host keys on data partition
    - Removes ephemeral build SSH key
13. Converts qcow2 to raw .img and shrinks with virt-sparsify or PiShrink

## What the image contains

The full Ansible provisioning playbook runs inside the VM:

| Component | Details |
|-----------|---------|
| **OS packages** | Node.js 24, sway, Chromium, nftables, wpa_supplicant |
| **Kiosk user** | Locked system user, autologin on tty1, no SSH password access |
| **Application** | kiosk-server, kiosk-client, kiosk-admin, shared, ui (other packages excluded) |
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

The Tailscale auth key is embedded in the image between flash and first successful boot. When no explicit key is provided, the script auto-generates a single-use key via the Tailscale API (requires `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`, and `TAILSCALE_TAILNET`).

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

Environment variables for Tailscale auth key auto-generation (when `--tailscale-key` is omitted):
- `TAILSCALE_OAUTH_CLIENT_ID` — Tailscale OAuth client ID (or set in `.env`)
- `TAILSCALE_OAUTH_CLIENT_SECRET` — Tailscale OAuth client secret (or set in `.env`)
- `TAILSCALE_TAILNET` — Tailscale tailnet name (or set in `.env`)

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

Verify the Layer 3 device stamp ran successfully — check that the fstab uses PARTUUIDs (not `/dev/vda*`) and that virt kernel files were removed from `/boot/`.

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
    kioskkit-tailscale-firstboot.service  # Tailscale auth one-shot unit
    tailscale-firstboot.sh               # Tailscale first-boot auth script
    kioskkit-expand-data.service          # Data partition expansion one-shot unit
    expand-data-partition.sh             # Expands data partition to fill SD card
  ansible/                      # Ansible playbooks and roles
  .output/                      # Built images (gitignored)
  .work/                        # Build cache (gitignored)
```
