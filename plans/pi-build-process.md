# Pi SD Image Build Process — Complete Reference

## Overview

The build produces a flashable SD card image with a 4-partition A/B layout. It uses a
three-layer caching system so that per-device stamping is fast (~30s) once the base and
app layers are cached.

**Partition layout:**

| Partition | Label | Size | Contents |
|-----------|-------|------|----------|
| p1 | bootfs | 512 MB | FAT32 boot partition (firmware, cmdline.txt, config.txt) |
| p2 | rootfs | 8 GB | ext4 root filesystem (slot A — active) |
| p3 | kioskkit-rootB | 8 GB | ext4 root filesystem (slot B — OTA target, empty) |
| p4 | kioskkit-data | ~remainder | ext4 persistent data (starts at ~1.5 GB, expanded on first boot) |

**Data partition subdirectories** (created by `prepare_disk` in pi-image-common.sh):
- `/kioskkit` → bind-mounted to `/opt/kioskkit/data`
- `/tailscale` → bind-mounted to `/var/lib/tailscale`
- `/wpa` → bind-mounted to `/etc/wpa_supplicant`
- `/kioskkit-config` → bind-mounted to `/etc/kioskkit`
- `/journal` → bind-mounted to `/var/log/journal`
- `/ssh` → SSH host keys (referenced by sshd_config `HostKey` directives)
- `/ota`, `/ota/pending` → OTA update state

---

## Layer 1: Base System (~25 min, cached)

**Entry point:** `main()` → `download_pios` → `prepare_disk` → `patch_image_for_virt` → `boot_qemu` → `provision_base`

**Cache key:** SHA-256 of all files under `deploy/pi/ansible/` excluding `deploy.yml` and `app.yml`.

### Step 1.1 — Download Pi OS

Downloads Raspberry Pi OS Lite arm64 (Bookworm, 2024-11-19), verifies SHA-256, decompresses.

### Step 1.2 — Prepare Disk (`prepare_disk`)

1. Converts raw Pi OS image to qcow2, resizes to 18 GB.
2. Reads p2 start offset from existing partition table.
3. Resizes p2 to exactly 8 GB (+ e2fsck + resize2fs).
4. Adds p3 (8 GB, ext4, labeled `kioskkit-rootB`).
5. Adds p4 (remainder, ext4, labeled `kioskkit-data`).
6. Creates data partition directory structure (kioskkit, tailscale, wpa, etc.).

### Step 1.3 — Patch for QEMU Virt (`patch_image_for_virt`)

The Pi OS kernel doesn't support QEMU's `virt` machine type, so a Debian arm64 kernel
is downloaded and installed temporarily:

1. Downloads Debian Bookworm arm64 kernel .deb + busybox-static .deb.
2. Writes a QEMU-specific fstab (`/dev/vda*` instead of PARTUUIDs).
3. Installs kernel modules into `/usr/lib/modules/`.
4. Installs boot files (`vmlinuz`, `config`, `System.map`) into `/boot/`.
5. Creates `pi` user with SSH key for build access.
6. Builds a minimal initrd with virtio drivers + A/B slot selection logic.

**Key:** The virt kernel version is saved to `$WORK_DIR/virt-kernel-version` for cleanup in Layer 3.

### Step 1.4 — Boot QEMU and Provision (`boot_qemu` → `provision_base`)

Boots the patched image in QEMU virt (cortex-a72, aarch64), waits for SSH, then runs
Ansible `provision.yml` with `--skip-tags tailscale,app`:

1. **packages.yml** — NodeSource repo, apt install: sway, swayidle, chromium, nftables,
   nodejs, python3-evdev, cloud-guest-utils, rsync, wpasupplicant. Enables corepack/pnpm.
   Disables bluetooth, cups, lightdm. Sets default target to `multi-user.target`.
2. **user.yml** — Creates `kiosk` system user (groups: video, input, render, password-locked).
   Deploys `.bash_profile` that waits for the app server then exec's sway.
3. **systemd.yml** — Deploys `kioskkit.service` (node server), enables it.
4. **display.yml** — Deploys sway config (kiosk Chromium), getty autologin override
   (auto-logins `kiosk` on tty1), Chromium managed policies, empty cursor theme.
5. **security.yml** — USB storage blacklist, sysctl hardening, nftables firewall
   (egress: DNS/DHCP/HTTPS/WireGuard only), disables SSH password auth + root login,
   adds `ssh.service` drop-in requiring `data.mount`.
6. **watchdog.yml** — Loads `bcm2835_wdt`, sets `RuntimeWatchdogSec=15`.
7. **filesystem.yml** — Creates `/data` mount point, data partition subdirs, bind mount
   entries in fstab, tmpfs on `/tmp`, adds `noatime` to root.
8. **wifi.yml** — WiFi scripts, sudoers, enables `wpa_supplicant@wlan0`.
9. **ota.yml** — OTA scripts, sudoers, boot-confirm service.

After provisioning: masks `wpa_supplicant@wlan0.service` (no wlan0 in QEMU), reboots VM,
waits for SSH, shuts down. Copies disk as `provisioned-base.qcow2`.

---

## Layer 2: App Deployment (~1 min, cached)

**Entry point:** `main()` → `create_cow_overlay` → `boot_qemu` → `deploy_app`

**Cache key:** SHA-256 of `deploy.yml`, `app.yml`, `packages/`, `pnpm-lock.yaml`, `turbo.json`.

### Step 2.0 — Host-Side App Build (runs BEFORE Docker re-exec)

1. rsync repo to staging dir (excludes web-client, web-server, landing, etc.).
2. Strips devDependencies from root package.json.
3. `pnpm install` + `pnpm build` (shared, ui, kiosk-server, kiosk-client, kiosk-admin).
4. `pnpm install --prod` to prune devDependencies.
5. Cross-compiles `better-sqlite3` for arm64 in a Bookworm container.
6. Verifies GLIBC compatibility (must be ≤2.36 for Pi OS Bookworm).

The staged app is at `deploy/pi/.work/app-stage/`.

### Step 2.1 — Deploy into VM (`deploy_app`)

1. Creates a COW overlay on top of the base image (writes don't touch base cache).
2. Boots QEMU.
3. rsync's pre-built app into VM at `/opt/kioskkit/`.
4. Runs Ansible `deploy.yml` starting at "Create system config directory" task:
   - Deploys `display-sleep.py`, sway config, systemd service, clears Chromium cache.
5. Shuts down, flattens overlay to `app-image.qcow2`.

---

## Layer 3: Device Stamp (~30s, always runs)

**Entry point:** `main()` → `stamp_device` → `customize_device_image` → `convert_to_raw`

No QEMU boot — all operations via guestfish on the cold qcow2 image.

### Step 3.0 — Prep

1. Auto-generates Tailscale auth key via OAuth API (single-use, preauthorized, tagged).
2. Copies `app-image.qcow2` to per-stamp working directory.

### Step 3.1 — Guestfish Session 1: Read-Only

1. Reads PARTUUIDs of p1 and p2 via `blkid`.
2. Downloads `sshd_config` from rootfs.
3. Downloads `cmdline.txt` from boot partition.
4. Patches `sshd_config` to use `/data/ssh/ssh_host_*` keys.
5. Strips `init=/usr/lib/raspberrypi-sys-mods/firstboot` and `quiet` from cmdline.txt.
6. Builds Pi-native fstab with PARTUUIDs (replacing QEMU's `/dev/vda*` fstab).

### Step 3.2 — Guestfish Session 2: Read-Write

**On rootfs (p2):**

1. Uploads Pi-native fstab.
2. Creates bind mount target dirs (`/data`, `/opt/kioskkit/data`, `/var/lib/tailscale`, etc.).
3. Removes virt kernel modules + boot files (vmlinuz, config, System.map).
4. Uploads first-boot services:
   - `kioskkit-expand-data.service` + `expand-data-partition.sh`
   - `kioskkit-tailscale-firstboot.service` + `tailscale-firstboot.sh`
5. Creates systemd enable symlinks:
   - `multi-user.target.wants/kioskkit-tailscale-firstboot.service`
   - `data.mount.wants/kioskkit-expand-data.service`
   - `multi-user.target.wants/tailscaled.service`
6. Uploads Tailscale binaries (`tailscale`, `tailscaled`) + systemd unit + defaults file.
7. Uploads patched `sshd_config`.
8. Unmasks `wpa_supplicant@wlan0.service` (removes the mask symlink).
9. Removes build SSH key from `/home/pi/.ssh/authorized_keys`.
10. Creates marker file `/etc/.expand-data-needed`.

**On data partition (p4):**

11. Clears QEMU build journal files (glob rm journal files, keeps dir structure).
12. Uploads device config (`/kioskkit-config/device.conf`).
13. Uploads Tailscale firstboot config (`/kioskkit-config/tailscale-firstboot.conf`).
14. Writes OTA state (`boot-slot = "A"`, `state.json`).
15. Uploads SSH host keys to `/ssh/`.

**On boot partition (p1):**

16. Uploads patched `cmdline.txt`.

### Step 3.3 — Convert and Output

1. `qemu-img convert` qcow2 → raw.
2. Moves to output directory with timestamped name.

---

## First Boot Sequence (on real Pi hardware)

### Boot loader → Kernel

Pi firmware reads `cmdline.txt` from boot partition (p1), boots the Pi's native kernel
from the boot partition (NOT the virt kernel — that was removed in Layer 3).

The Pi kernel mounts rootfs (p2) using the PARTUUID in cmdline.txt.

**Note:** There is no custom initrd on real hardware. The A/B slot selection initrd is
only used by QEMU. On real hardware, it always boots slot A (p2) directly.

### systemd Boot

systemd reads `/etc/fstab` and generates mount units. Key mount chain:

1. `data.mount` — mounts `LABEL=kioskkit-data` at `/data`
2. Before `data.mount`: `kioskkit-expand-data.service` (if `/etc/.expand-data-needed` exists)
3. After `data.mount`: bind mounts (`opt-kioskkit-data.mount`, `var-lib-tailscale.mount`, etc.)
4. `local-fs.target` — all filesystems mounted
5. `tmp.mount` — tmpfs on `/tmp` (64 MB)
6. `network-pre.target` → `NetworkManager.service` → `network-online.target`
7. `multi-user.target`:
   - `tailscaled.service` — Tailscale daemon
   - `kioskkit-tailscale-firstboot.service` — one-shot auth (Requires=tailscaled.service)
   - `kioskkit.service` — Node.js app server
   - `nftables.service` — firewall
   - `ssh.service` (with drop-in: Requires=data.mount)
   - `getty@tty1.service` — autologins `kiosk` user

### Display Chain

1. `getty@tty1` auto-logins `kiosk` user via override (`--autologin kiosk`).
2. `kiosk`'s `.bash_profile` polls `curl http://localhost:3001` until the app server responds.
3. Once server is up, exports `XDG_RUNTIME_DIR=/tmp/kiosk-xdg` and exec's `sway --unsupported-gpu`.
4. Sway config launches `swayidle` (display sleep after 2700s) and `chromium --kiosk` pointing at `http://localhost:3001`.

### Tailscale Chain

1. `tailscaled.service` starts (After=network-pre.target, NetworkManager.service).
2. `kioskkit-tailscale-firstboot.service` starts (After=tailscaled.service, Requires=tailscaled.service).
3. Reads `/etc/kioskkit/tailscale-firstboot.conf` (bind-mounted from `/data/kioskkit-config/`).
4. Runs `tailscale up --authkey=... --hostname=kioskkit-<id> --ssh`.
5. On success: removes conf file, disables itself.

### Partition Expansion Chain

1. `kioskkit-expand-data.service` starts Before=data.mount (ConditionPathExists=/etc/.expand-data-needed).
2. Runs `expand-data-partition.sh`:
   - `growpart /dev/mmcblk0 4` (TMPDIR=/run to avoid tmp.mount race)
   - `partx --update --nr 4 /dev/mmcblk0`
   - `e2fsck -fy /dev/mmcblk0p4`
   - `resize2fs /dev/mmcblk0p4`
3. Removes `/etc/.expand-data-needed` marker.
4. `data.mount` proceeds to mount the now-expanded partition.

---

## Layer 3 Tailscale: Two Sources, Potential Conflict

**Layer 1 (Ansible)** installs Tailscale via the official install script (`tailscale.yml`):
- Downloads and runs `https://tailscale.com/install.sh`
- This adds the Tailscale apt repo AND installs the package
- Creates `/usr/bin/tailscale`, `/usr/sbin/tailscaled`, systemd unit, etc.

**Layer 3 (guestfish)** ALSO installs Tailscale binaries from a .deb:
- Extracts `tailscale_1.96.2_arm64.deb` and uploads binaries + systemd unit
- Overwrites whatever Layer 1 installed

**Potential issue:** Layer 1's `tailscale.yml` is NOT skipped — it runs during base
provisioning. Wait — checking the tags: `provision.yml` runs with `--skip-tags tailscale,app`.
The `tailscale.yml` task file has `tags: [tailscale]`, so it IS skipped. Good.

But `packages.yml` does NOT install tailscale (no apt package), and the tailscale tag
skipping means no Tailscale is installed during QEMU provisioning at all. Layer 3 is the
sole source of Tailscale binaries. This is correct.

---

## Firewall Implications

nftables egress policy is **drop** with allowlist:
- DNS (UDP 53)
- DHCP (UDP 67, 68)
- HTTPS (TCP 443) — for Tailscale control plane
- WireGuard (UDP 41641) — for Tailscale tunnel

This means: if Tailscale needs any other ports (e.g. DERP relay on different ports),
connections will be dropped.

---

## Known Gotchas and Risks

### fstab Duplication
The fstab is written THREE times:
1. `patch_image_for_virt` — QEMU fstab with `/dev/vda*` (Layer 1 prep)
2. `filesystem.yml` — Ansible adds bind mount entries and tmpfs (Layer 1)
3. `customize_device_image` — Pi-native fstab with PARTUUIDs (Layer 3)

Layer 3's fstab **completely replaces** whatever Ansible wrote. This means if Ansible
adds a new fstab entry, it must ALSO be added to the Layer 3 fstab template in
`build-sd-image.sh:478-489`. These can drift.

### systemd Enable Symlinks
Layer 3 manually creates symlinks in `.wants/` directories instead of using
`systemctl enable`. This means:
- The symlink target path must exactly match the unit file location
- If a unit's `[Install]` section changes, the symlink must be updated manually

### Tailscale Version Pinning
Layer 3 pins Tailscale to 1.96.2 with a hardcoded checksum. If Layer 1's install script
ran (it doesn't currently due to tag skipping), there would be a version mismatch.

### ssh.service Dependency on data.mount
`security.yml` creates a drop-in for `ssh.service` requiring `data.mount`. If data.mount
fails (e.g. expand-data fails and corrupts the partition), SSH will not start either.

### Boot Partition cmdline.txt
Layer 3 downloads cmdline.txt, strips `init=firstboot` and `quiet`, re-uploads.
The Pi's native kernel is NOT in the image boot partition at build time — it's in the
firmware. The kernel is determined by `config.txt` which is NOT modified by the build.

### Journal Persistence
Journal is bind-mounted from `/data/journal` to `/var/log/journal`. If the data partition
isn't mounted (expand fails, mount fails), journal falls back to volatile (tmpfs) and is
lost on reboot — making debugging much harder.
