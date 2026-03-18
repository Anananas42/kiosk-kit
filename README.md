# KioskKit

Touchscreen kiosk app for recording shared-resource consumption in an apartment building. Residents tap their apartment number, select an item, and the record is stored locally in SQLite.

Built with React (client), Hono (server), and SQLite (data store). Designed to run locked-down on a Raspberry Pi with a touchscreen.

## Architecture

```
packages/
├── client/     # React SPA (Vite)
├── server/     # Hono + better-sqlite3 (port 3001)
└── shared/     # Types, constants, price utils

system/         # Raspberry Pi OS-level kiosk configuration
├── setup.sh
├── deploy.sh
├── services/   # systemd units
└── config/     # nftables, chromium policies, udev rules, etc.
```

All data lives in SQLite. The client works offline using a local submit queue that flushes when connectivity returns.

### Data model

Each transaction record carries a signed `count` field — positive for additions, negative for removals. For regular items, count is always `+1`/`-1`. For pastries, it reflects the quantity picker (e.g., `+3` for ordering 3 pastries). The `quantity` field (e.g., "0.5l", "250g") is purely a display label and has no logical meaning in the backend.

### API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/catalog` | GET | Product catalog (categories + items) |
| `/api/apartments` | GET | Apartment list |
| `/api/health` | GET | Server health |
| `/api/record` | POST | Submit a consumption record |
| `/api/overview` | GET | All evidence records |
| `/api/item-count` | GET | Balance for a specific buyer+item |
| `/api/pastry-config` | GET | Pastry ordering/delivery day schedule |
| `/api/settings` | GET | Kiosk settings |
| `/api/admin/apartments` | POST/PUT/DELETE | CRUD apartments |
| `/api/admin/catalog` | POST/PUT/DELETE | CRUD categories and items |
| `/api/admin/settings` | PUT | Update settings |
| `/api/admin/pastry-config` | PUT | Update pastry config |
| `/api/reports/consumption` | GET | Consumption report (aggregated) |
| `/api/reports/pastry` | GET | Pastry orders by delivery date |

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev               # starts server + client with hot reload
```

## Testing

```bash
pnpm test     # runs all tests (vitest)
```

## Building

```bash
pnpm build    # builds shared → server → client
pnpm start    # runs production server on port 3001
```

## Environment

| Variable | Description |
|----------|------------|
| `PORT` | Server port (default: 3001) |

---

## Raspberry Pi Kiosk Deployment

The `system/` directory contains everything needed to turn a Raspberry Pi into a locked-down kiosk. The setup is idempotent — run it on a fresh Raspberry Pi OS install and reboot.

### Prerequisites

- Raspberry Pi (tested on Pi 4/5) with Raspberry Pi OS (Debian trixie)
- HDMI touchscreen display
- SSH access with key-based auth already configured

### Initial Setup

```bash
# On the Pi (or via SSH):
git clone git@github.com:Anananas42/kiosk-kit.git /tmp/kiosk-kit

# Copy secrets (not in git)
cp /path/to/.env /tmp/kiosk-kit/.env

# Run setup
sudo bash /tmp/kiosk-kit/system/setup.sh
sudo reboot
```

### What setup.sh does

1. **Installs packages**: Node.js 20, pnpm, sway, chromium, nftables, emoji fonts
2. **Creates `kiosk` user**: locked password, groups `video,input,render`, no sudo
3. **Deploys app** to `/opt/kioskkit` with `pnpm install && pnpm build`
4. **Copies secrets** (`.env`) with 600 permissions
5. **Installs systemd service** (`kioskkit.service`) for the Node.js app
6. **Configures autologin** on tty1 via getty drop-in
7. **Writes kiosk `.bash_profile`**: waits for server → launches sway → chromium fullscreen
8. **Writes sway config**: hidden cursor, no window decorations
9. **Installs Chromium policies**: URL whitelist (localhost:3001 only), no devtools/downloads
10. **Applies security hardening**: USB storage block, SysRq disable, nftables firewall, SSH key-only auth
11. **Configures hardware watchdog**: `bcm2835_wdt` with 15s timeout for auto-reboot on hang
12. **Filesystem tuning**: tmpfs on `/tmp`, noatime on root
13. **Disables unnecessary services**: bluetooth, cups, lightdm; sets `multi-user.target`
14. **Sets up auto-deploy**: clones repo to `/opt/kioskkit-repo`, installs deploy key, enables daily timer

### Boot Sequence

```
power on → systemd starts
  ├── kioskkit.service → node (port 3001)
  ├── getty@tty1 → autologin kiosk
  │     └── .bash_profile → polls localhost:3001 → exec sway
  │           └── chromium --kiosk http://localhost:3001
  └── hardware watchdog (bcm2835_wdt, 15s timeout)
```

If chromium or sway crash, getty respawns and the cycle repeats. If the Node.js app crashes, systemd restarts it (`Restart=always`). If the system hangs, the hardware watchdog reboots it.

### Auto-Deploy

A systemd timer (`kioskkit-deploy.timer`) runs daily at 04:00. It pulls from `origin/main` using a read-only deploy key committed to the repo (`system/config/deploy-key`). If there are changes, it rebuilds and restarts the app.

```bash
# Check timer status
systemctl list-timers kioskkit-deploy.timer --all

# Trigger manual deploy
sudo systemctl start kioskkit-deploy.service

# Or run the script directly
sudo bash /opt/kioskkit-repo/system/deploy.sh
```

The deploy script (`system/deploy.sh`) preserves `data/` and `.env` — only app code is updated. After rebuilding, it clears the Chromium cache and restarts sway to ensure the browser loads fresh frontend assets.

### Display Behavior

- **15s idle**: app dims (70% dark overlay, fades in over 1s)
- **45min idle**: display turns off via DPMS (`swayidle`)
- **Touch when off**: first touch wakes the display but is consumed (evdev grab prevents it from reaching the app)
- **Touch when dimmed**: dismisses dim overlay
- **Cursor**: hidden (sway `hide_cursor 1` — invisible on touchscreen)

### Security Layers

| Layer | Prevents |
|-------|----------|
| sway (Wayland compositor) | VT switching, window management escape |
| `exec` in .bash_profile | Shell access after sway exits |
| Viewport meta + CSS `touch-action` | Pinch-to-zoom gesture |
| Chromium `--kiosk` | Address bar, keyboard shortcuts |
| Chromium managed policies | DevTools, downloads, file:// URLs, non-localhost navigation |
| nftables firewall | Network access beyond SSH/Tailscale in + HTTP/HTTPS/DNS/NTP/DHCP/WireGuard out |
| USB storage block (udev) | Mounting USB drives |
| SysRq disable | Alt+SysRq kernel shortcuts |
| kiosk user (no sudo) | Privilege escalation |
| systemd sandboxing | App writes restricted to `data/` only |
| SSH hardening | Password auth disabled, root login disabled |

### File Reference

```
system/
├── setup.sh                       # Idempotent setup (run as root)
├── deploy.sh                      # Git pull + rebuild + restart
├── services/
│   ├── kioskkit.service           # Node.js app systemd unit
│   ├── kioskkit-deploy.service    # Deploy oneshot service
│   └── kioskkit-deploy.timer      # Daily deploy timer (04:00)
└── config/
    ├── chromium-policies.json     # Browser lockdown policies
    ├── deploy-key                 # Read-only GitHub deploy key (private)
    ├── deploy-key.pub             # Deploy key (public)
    ├── display-sleep.py           # DPMS off + evdev grab (touch-safe display sleep)
    ├── sway-config                # Sway compositor config (cursor, swayidle, chromium)
    ├── getty-autologin.conf       # tty1 autologin drop-in
    ├── make-empty-cursor.py       # Generates transparent cursor theme
    ├── nftables.conf              # Firewall rules
    ├── sysctl-kiosk.conf          # SysRq disable
    └── udev-usb-storage.rules     # Block USB mass storage
```

### Key Paths on the Pi

| Path | Contents |
|------|----------|
| `/opt/kioskkit/` | Deployed app (node_modules, dist, .env, data) |
| `/opt/kioskkit/data/` | SQLite database (only writable path) |
| `/opt/kioskkit-repo/` | Git clone for deploy pulls |
| `/home/kiosk/.bash_profile` | Kiosk launch script |
| `/home/kiosk/.config/sway/config` | Sway compositor config |
| `/etc/chromium/policies/managed/` | Chromium policy JSON |
| `/etc/nftables.conf` | Firewall rules |

### Remote Access (Tailscale)

The Pi runs [Tailscale](https://tailscale.com/) for remote access from anywhere, without port forwarding or knowing the Pi's local IP.

Tailscale is installed by `setup.sh`. After installation, authenticate once:

```bash
sudo tailscale up --ssh
```

### Useful Commands

```bash
# App service
sudo systemctl status kioskkit
sudo systemctl restart kioskkit
sudo journalctl -u kioskkit -f

# Trigger deploy
sudo systemctl start kioskkit-deploy.service
sudo journalctl -u kioskkit-deploy -f

# Firewall
sudo nft list ruleset

# Full reboot
sudo reboot
```
