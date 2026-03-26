# Pi Emulator (QEMU)

QEMU-based Raspberry Pi emulator for pre-release validation. Boots a real Pi OS
image, provisions it with the production Ansible playbook, and runs smoke tests
against the result.

Uses shared image-building functions from `deploy/pi/lib/pi-image-common.sh`.

## Prerequisites

```bash
# Ubuntu/Debian
sudo apt install qemu-system-arm qemu-utils libguestfs-tools sshpass
sudo chmod 644 /boot/vmlinuz-*  # libguestfs needs to read the host kernel

# Ansible
pip install ansible
```

## Quick start

```bash
# 1. Build the golden image (~30 min first time, ARM emulation is slow)
./build-image.sh

# 2. Boot the emulator
./run.sh

# 3. Access the kiosk UI
open http://localhost:3001

# 4. SSH into it (in another terminal)
ssh -i .work/build/build-ssh-key -p 2222 pi@localhost

# 5. Run smoke tests (boots a fresh overlay and tests automatically)
./test.sh
```

## How it works

1. Downloads Raspberry Pi OS Lite (arm64, Bookworm) with checksum verification
2. Converts to qcow2, grows partition and filesystem via guestfish
3. Downloads Debian arm64 kernel (has virtio drivers) from Debian repos
4. Patches image: fstab for virtio, kernel modules to `/usr/lib/modules/`, pi user via passwd/shadow/group edits
5. Builds a minimal initrd with virtio + ext4 modules and ARM64 busybox
6. Boots in QEMU with direct kernel boot (`-kernel`/`-initrd`, no UEFI)
7. Runs Ansible `provision.yml` over SSH (skips tailscale — not needed for emulator)
8. Reboots, configures mac80211_hwsim for WiFi simulation, snapshots as `golden.qcow2`

## Architecture

```
                     build-image.sh
                          │
    ┌─────────────┐       │       ┌──────────────────┐
    │ Pi OS Lite   │──────►├──────►│ QEMU virt machine│
    │ (download)   │       │       │ + Ansible provn. │
    └─────────────┘       │       └────────┬─────────┘
                          │                │
                          │       ┌────────▼─────────┐
                          └──────►│  golden.qcow2    │  (gitignored)
                                  └────────┬─────────┘
                                           │
                    ┌──────────────────────┤
                    │                      │
              run.sh (COW overlay)   test.sh (COW overlay)
                    │                      │
              Interactive use        Smoke test suite
```

**Why `virt` machine instead of `raspi3b`/`raspi4b`?**

The QEMU `raspi3b` machine has USB-based networking (slow, fragile) and
`raspi4b` support is new and buggy. The generic `aarch64 virt` machine provides
stable virtio networking, configurable RAM/CPU, and reliable SSH port
forwarding.

The trade-off: the Debian arm64 kernel is used instead of the stock Pi kernel
(needed for virtio drivers). A custom initrd loads virtio and ext4 modules
before mounting root. The stock Pi kernel and boot partition are untouched.

## Scripts

### `build-image.sh`

Sources `deploy/pi/lib/pi-image-common.sh` for shared functions. Adds
emulator-specific provisioning (wifi simulation) and snapshots the golden image.

```bash
./build-image.sh           # Build (skips if golden.qcow2 exists)
./build-image.sh --force   # Force rebuild
```

Rebuild when `deploy/pi/ansible/` or application source code changes.

Environment variables:
- `PI_EMU_RAM` — Guest RAM (default: 6G)
- `PI_EMU_CPUS` — Guest CPUs (default: half of host cores)

### `run.sh`

Boots from a copy-on-write overlay on top of the golden image. The golden image
is never modified.

```bash
./run.sh              # Interactive (Ctrl-A X to quit)
./run.sh --bg         # Background (daemonize)
./run.sh --persist    # Keep overlay changes after shutdown
```

Environment variables:
- `PI_EMU_SSH_PORT` — SSH port on host (default: 2222)
- `PI_EMU_KIOSK_PORT` — Kiosk server port on host (default: 3001)
- `PI_EMU_RAM` — Guest RAM (default: 6G)
- `PI_EMU_CPUS` — Guest CPUs (default: half of host cores)

### `test.sh`

Boots a fresh overlay and runs smoke tests covering:

- SSH connectivity and OS identification
- Kiosk user and app directory
- Node.js and pnpm
- kioskkit.service enabled and healthy on port 3001
- Kiosk UI serves HTML
- wpa_supplicant installed, WiFi scripts deployed
- mac80211_hwsim WiFi simulation (skips if unavailable)
- nftables firewall active
- SSH password authentication disabled

```bash
./test.sh              # Full run (boot + test + shutdown)
./test.sh --skip-boot  # Skip boot (QEMU already running)
```

## SSH access

Build-time SSH uses an ephemeral ed25519 keypair generated during image build
and stored at `.work/build/build-ssh-key`. Password authentication is disabled by
the security hardening tasks — only key auth works.

```bash
ssh -i .work/build/build-ssh-key -p 2222 pi@localhost
```

## Golden image management

- `.output/golden.qcow2` is gitignored (~5G, built locally)
- `.work/` contains intermediate and runtime files — also gitignored
- Rebuild trigger: Ansible playbook changes, application code changes
- The golden image includes the fully provisioned system with security hardening, firewall, and the built kiosk application

## File structure

```
dev/pi-emulator/
├── build-image.sh          # Build the golden image (sources shared library)
├── run.sh                  # Boot for interactive use
├── test.sh                 # Run smoke tests
├── README.md               # This file
├── .output/                # Build output (gitignored)
│   └── golden.qcow2       # Golden image (~5G)
└── .work/                  # Intermediate files (gitignored)
    ├── cache/              # Downloaded assets and layer caches
    │   ├── raspios.img     # Downloaded Pi OS image
    │   ├── provisioned-base.qcow2  # Layer 1 base image cache
    │   ├── base-hash       # Cache invalidation hash (Ansible)
    │   └── app-hash        # Cache invalidation hash (app code)
    ├── boot/               # Kernel and initrd for direct boot
    │   ├── vmlinuz         # Debian arm64 virt kernel
    │   ├── initrd.img      # Custom initrd with virtio modules
    │   └── virt-kernel-version  # Saved for restore_pi_boot_state
    ├── build/              # Ephemeral build artifacts
    │   ├── disk.qcow2      # Working disk (temporary)
    │   ├── build-ssh-key   # Ephemeral SSH key
    │   ├── build-ssh-key.pub
    │   ├── inventory.yml   # Ansible inventory
    │   ├── qemu.pid        # Build-time QEMU PID file
    │   └── qemu-console.log  # Serial console output
    └── run/                # Runtime overlay and state
        ├── overlay.qcow2   # COW overlay from run.sh (temporary)
        └── qemu.pid        # Runtime QEMU PID file
```
