# Pi Emulator (QEMU)

QEMU-based Raspberry Pi emulator for pre-release validation. Boots a real Pi OS
image, provisions it with the production Ansible playbook, and runs smoke tests
against the result.

Replaces the previous `dev/kiosk-sim/` mock approach with higher-fidelity
emulation using real systemd services, wpa_supplicant, and (optionally)
mac80211_hwsim for WiFi testing.

## Prerequisites

Install on your host machine:

```bash
# Ubuntu/Debian
sudo apt install qemu-system-arm qemu-utils qemu-efi-aarch64 libguestfs-tools

# macOS (Homebrew)
brew install qemu
# Note: libguestfs is not available via Homebrew. Use Docker or a Linux VM
# to run build-image.sh, then use run.sh/test.sh on macOS.
```

You also need Ansible installed (for provisioning):

```bash
pip install ansible
```

## Quick start

```bash
# 1. Build the golden image (downloads Pi OS, provisions with Ansible, ~15-20 min)
./build-image.sh

# 2. Boot the emulator
./run.sh

# 3. SSH into it (in another terminal)
ssh -p 2222 pi@localhost

# 4. Run smoke tests (boots a fresh overlay and tests automatically)
./test.sh
```

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
forwarding — everything needed for Ansible provisioning and testing.

The trade-off is needing the Debian arm64 kernel (which has virtio drivers)
instead of the stock Pi kernel. This is installed into the image during
`build-image.sh` via guestfish.

## Scripts

### `build-image.sh`

Downloads Pi OS Lite, patches it for QEMU virt (installs Debian arm64 kernel,
fixes fstab, enables SSH), boots it, runs the Ansible provisioning playbook,
then snapshots the disk as `golden.qcow2`.

```bash
./build-image.sh           # Build (skips if golden.qcow2 exists)
./build-image.sh --force   # Force rebuild
```

The golden image only needs rebuilding when `deploy/pi/ansible/` changes.

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
- `PI_EMU_RAM` — Guest RAM (default: 2G)
- `PI_EMU_CPUS` — Guest CPUs (default: 4)

### `test.sh`

Boots a fresh overlay and runs a smoke test suite covering:

- SSH connectivity and OS identification
- Kiosk user and app directory exist
- Node.js and pnpm available
- kioskkit.service enabled
- wpa_supplicant installed, WiFi scripts deployed
- mac80211_hwsim WiFi simulation (if available)
- Firewall rules active
- SSH hardening applied

```bash
./test.sh              # Full run (boot + test + shutdown)
./test.sh --skip-boot  # Skip boot (QEMU already running)
```

## WiFi testing with mac80211_hwsim

The build script attempts to load `mac80211_hwsim` (a kernel module that
creates virtual WiFi interfaces). When available, this enables testing real
`wpa_supplicant` interactions without physical hardware.

The Debian arm64 kernel typically includes this module. If it's not available
in a particular kernel version, the tests gracefully skip WiFi-specific checks.

When loaded with `radios=2`, it creates two virtual WiFi interfaces (wlan0,
wlan1) that can communicate with each other — useful for testing scan, connect,
and forget operations against real `wpa_supplicant`.

## Golden image management

- `golden.qcow2` is gitignored (too large to commit)
- Rebuild when Ansible playbook changes: `./build-image.sh --force`
- The `.work/` directory contains intermediate files (downloaded image, UEFI
  firmware) and is also gitignored

## File structure

```
dev/pi-emulator/
├── build-image.sh     # Build the golden image
├── run.sh             # Boot for interactive use
├── test.sh            # Run smoke tests
├── README.md          # This file
├── golden.qcow2       # Golden image (gitignored, built locally)
└── .work/             # Intermediate files (gitignored)
    ├── raspios.img    # Downloaded Pi OS image
    ├── disk.qcow2     # Working disk during build
    ├── QEMU_EFI.fd    # UEFI firmware
    └── efivars.fd     # UEFI variable store
```
