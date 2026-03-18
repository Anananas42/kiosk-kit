# Zahumny Kiosk

Touchscreen kiosk app for recording shared-resource consumption in an apartment building. Residents tap their apartment number, select an item, and the record is logged to a Google Sheet.

Built with React (client), Hono (server), and SQLite (local cache/queue). Designed to run locked-down on a Raspberry Pi with a touchscreen.

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

The server caches catalog data from Google Sheets in SQLite and queues write operations for resilience against network outages. The client works offline using a local submit queue that flushes when connectivity returns.

## Google Spreadsheet

The app reads/writes a Google Spreadsheet configured via `SPREADSHEET_ID` in `.env`. To inspect the current sheet structure (names, headers, sample data):

```bash
pnpm --filter @zahumny/server inspect-sheets      # 3 sample rows (default)
pnpm --filter @zahumny/server inspect-sheets -- 10 # 10 sample rows
```

The app uses **header-based column lookup** — columns are matched by header name, not position. Adding, reordering, or removing unused columns won't break the API.

**Row limits**: The default grid size shown in Google Sheets (e.g. 1000 rows) is just a display allocation, not a data cap. The API returns only populated rows regardless of grid size, and `values.append` auto-expands the grid when writing past it.

### Sheets used by the app

| Sheet | Purpose | Key columns |
|-------|---------|-------------|
| **[Apartment config]** | Apartment list | ID, Label |
| **[Katalog]** | Product catalog | Kategorie, Typ, Název, množství, cena, Sazba DPH |
| **[Evidence]** | Transaction ledger (append-only) | Čas, Kupující, Operace, Kategorie, Položka, Množství, Cena, Sazba DPH |
| **[Přehled pečiva]** | Pastry order overview (auto-generated) | Dynamic: items × delivery dates |
| **[Pečivo config]** | Pastry ordering/delivery schedule | Den, Objednávky, Doručení |
| **Výdej pečiva D.M.** | Per-day pastry distribution sheet (auto-generated, one per delivery date) | Položka, \<apartments\>, Celkem |

App-managed sheet tabs are prefixed with `[brackets]` to distinguish them from manual/reporting sheets.

Both the **[Katalog]** and **[Apartment config]** sheets are validated on load. If any row has a missing, malformed (non-integer or ≤ 0), or duplicate ID, the app returns a 503 error with details and blocks usage until the sheet is fixed.

### Category types (Typ column)

The `Typ` column in the Katalog sheet controls how a category behaves in the UI. Set `Typ` to `pečivo` for pastry categories — these get a quantity picker (1–10), delivery date calculation, and a dedicated orders overview. All other categories (empty `Typ`) use the standard single-item add/remove flow.

To add a new pastry category, just add rows to the Katalog sheet with `Typ` set to `pečivo`. No code changes needed.

### Pastry ordering schedule ([Pečivo config])

The `[Pečivo config]` sheet controls when pastry ordering and delivery are available, per weekday:

| Den | Objednávky | Doručení |
|-----|-----------|----------|
| Pondělí | ano | ano |
| Úterý | ano | ano |
| ... | ... | ... |
| Sobota | ne | ne |
| Neděle | ne | ne |

- **Objednávky** (`ano`/`ne`): Whether residents can place pastry orders on that day. When set to `ne`, the app shows an info banner instead of the category tiles.
- **Doručení** (`ano`/`ne`): Whether pastries are delivered on that day. When set to `ne`, the delivery date calculation skips that day. For example, if Saturday and Sunday are `ne`, an order placed Friday evening will show Monday as the delivery date.

Changes take effect within 5 minutes (catalog reload interval). To create the sheet on a fresh spreadsheet:

```bash
pnpm --filter @zahumny/server create-pastry-config
```

### Per-day pastry distribution sheets

When pastry orders are synced, the app auto-generates one sheet per upcoming delivery date, named e.g. `Výdej pečiva 15.3.`. These are designed for printing — rows are pastry items, columns are apartments that placed orders, and the last column is a total. Only today's and future delivery dates get sheets; past dates are skipped. The owners can delete old sheets manually after distribution.

### Data model

Each transaction record carries a signed `count` field — positive for additions, negative for removals. For regular items, count is always `+1`/`-1`. For pastries, it reflects the quantity picker (e.g., `+3` for ordering 3 pastries). The `quantity` field (e.g., "0.5l", "250g") is purely a display label and has no logical meaning in the backend.

### API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/catalog` | GET | Product catalog (categories + items) |
| `/api/apartments` | GET | Apartment list |
| `/api/health` | GET | Server health + queue depth |
| `/api/record` | POST | Submit a consumption record |
| `/api/overview` | GET | All evidence records |
| `/api/item-count` | GET | Balance for a specific buyer+item |
| `/api/pastry-config` | GET | Pastry ordering/delivery day schedule |

## Development

```bash
pnpm install
cp .env.example .env   # fill in SPREADSHEET_ID
# place service-account.json in credentials/
pnpm dev               # starts server + client with hot reload
```

## Testing

```bash
pnpm test     # runs all tests (vitest)
```

Tests are co-located with source files (`*.test.ts`). Coverage includes price parsing, catalog validation, apartment validation, delivery date calculation (with skip-day logic), balance computation, and header-based column mapping.

## Building

```bash
pnpm build    # builds shared → server → client
pnpm start    # runs production server on port 3001
```

## Environment

| Variable | Description |
|----------|------------|
| `SPREADSHEET_ID` | Google Sheets spreadsheet ID |
| `PORT` | Server port (default: 3001) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON key (default: `./credentials/service-account.json`) |

---

## Raspberry Pi Kiosk Deployment

The `system/` directory contains everything needed to turn a Raspberry Pi into a locked-down kiosk. The setup is idempotent — run it on a fresh Raspberry Pi OS install and reboot.

### Prerequisites

- Raspberry Pi (tested on Pi 4/5) with Raspberry Pi OS (Debian trixie)
- HDMI touchscreen display
- SSH access with key-based auth already configured
- `.env` and `credentials/service-account.json` in the repo root

### Initial Setup

```bash
# On the Pi (or via SSH):
git clone git@github.com:Anananas42/zahumny-kiosk.git /tmp/zahumny-kiosk

# Copy secrets (not in git)
cp /path/to/.env /tmp/zahumny-kiosk/.env
cp /path/to/service-account.json /tmp/zahumny-kiosk/credentials/

# Run setup
sudo bash /tmp/zahumny-kiosk/system/setup.sh
sudo reboot
```

### What setup.sh does

1. **Installs packages**: Node.js 20, pnpm, sway, chromium, nftables, emoji fonts
2. **Creates `kiosk` user**: locked password, groups `video,input,render`, no sudo
3. **Deploys app** to `/opt/zahumny-kiosk` with `pnpm install && pnpm build`
4. **Copies secrets** (`.env`, `credentials/`) with 600 permissions
5. **Installs systemd service** (`zahumny-kiosk.service`) for the Node.js app
6. **Configures autologin** on tty1 via getty drop-in
7. **Writes kiosk `.bash_profile`**: waits for server → launches sway → chromium fullscreen
8. **Writes sway config**: hidden cursor, no window decorations
9. **Installs Chromium policies**: URL whitelist (localhost:3001 only), no devtools/downloads
10. **Applies security hardening**: USB storage block, SysRq disable, nftables firewall, SSH key-only auth
11. **Configures hardware watchdog**: `bcm2835_wdt` with 15s timeout for auto-reboot on hang
12. **Filesystem tuning**: tmpfs on `/tmp`, noatime on root
13. **Disables unnecessary services**: bluetooth, cups, lightdm; sets `multi-user.target`
14. **Sets up auto-deploy**: clones repo to `/opt/zahumny-kiosk-repo`, installs deploy key, enables daily timer

### Boot Sequence

```
power on → systemd starts
  ├── zahumny-kiosk.service → node (port 3001)
  ├── getty@tty1 → autologin kiosk
  │     └── .bash_profile → polls localhost:3001 → exec sway
  │           └── chromium --kiosk http://localhost:3001
  └── hardware watchdog (bcm2835_wdt, 15s timeout)
```

If chromium or sway crash, getty respawns and the cycle repeats. If the Node.js app crashes, systemd restarts it (`Restart=always`). If the system hangs, the hardware watchdog reboots it.

### Auto-Deploy

A systemd timer (`zahumny-kiosk-deploy.timer`) runs daily at 04:00. It pulls from `origin/main` using a read-only deploy key committed to the repo (`system/config/deploy-key`). If there are changes, it rebuilds and restarts the app.

```bash
# Check timer status
systemctl list-timers zahumny-kiosk-deploy.timer --all

# Trigger manual deploy
sudo systemctl start zahumny-kiosk-deploy.service

# Or run the script directly
sudo bash /opt/zahumny-kiosk-repo/system/deploy.sh
```

The deploy script (`system/deploy.sh`) preserves `data/`, `.env`, and `credentials/` — only app code is updated. After rebuilding, it clears the Chromium cache and restarts sway to ensure the browser loads fresh frontend assets.

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
├── setup.sh                          # Idempotent setup (run as root)
├── deploy.sh                         # Git pull + rebuild + restart
├── services/
│   ├── zahumny-kiosk.service         # Node.js app systemd unit
│   ├── zahumny-kiosk-deploy.service  # Deploy oneshot service
│   └── zahumny-kiosk-deploy.timer    # Daily deploy timer (04:00)
└── config/
    ├── chromium-policies.json        # Browser lockdown policies
    ├── deploy-key                    # Read-only GitHub deploy key (private)
    ├── deploy-key.pub                # Deploy key (public)
    ├── display-sleep.py              # DPMS off + evdev grab (touch-safe display sleep)
    ├── sway-config                   # Sway compositor config (cursor, swayidle, chromium)
    ├── getty-autologin.conf          # tty1 autologin drop-in
    ├── make-empty-cursor.py          # Generates transparent cursor theme
    ├── nftables.conf                 # Firewall rules
    ├── sysctl-kiosk.conf             # SysRq disable
    └── udev-usb-storage.rules        # Block USB mass storage
```

### Key Paths on the Pi

| Path | Contents |
|------|----------|
| `/opt/zahumny-kiosk/` | Deployed app (node_modules, dist, .env, credentials, data) |
| `/opt/zahumny-kiosk/data/` | SQLite database (only writable path) |
| `/opt/zahumny-kiosk-repo/` | Git clone for deploy pulls |
| `/home/kiosk/.bash_profile` | Kiosk launch script |
| `/home/kiosk/.config/sway/config` | Sway compositor config |
| `/etc/chromium/policies/managed/` | Chromium policy JSON |
| `/etc/nftables.conf` | Firewall rules |

### Remote Access (Tailscale)

The Pi runs [Tailscale](https://tailscale.com/) for remote access from anywhere, without port forwarding or knowing the Pi's local IP. This is critical since the Pi is deployed ~200km away.

Tailscale is installed by `setup.sh`. After installation, authenticate once:

```bash
sudo tailscale up --ssh
# opens a URL to authenticate in your Tailscale account
```

Once authenticated, you can SSH from any device on your tailnet:

```bash
ssh zahumny@raspberrypi    # Tailscale hostname
ssh zahumny@100.x.y.z      # Tailscale IP
```

The `--ssh` flag enables Tailscale SSH, which works independently of OpenSSH.

**ACL policy**: Tailscale ACLs are configured at https://login.tailscale.com/admin/acls to be one-directional — admin devices can reach the Pi, but the Pi cannot initiate connections to anything on the tailnet. The current policy:

```jsonc
{
  // Only admin devices (your desktop) can reach the Pi.
  "grants": [
    {"src": ["autogroup:admin"], "dst": ["100.97.224.3"], "ip": ["*"]}
  ],
  "ssh": [
    {"action": "check", "src": ["autogroup:member"], "dst": ["autogroup:self"], "users": ["autogroup:nonroot", "root"]}
  ]
}
```

**Firewall**: nftables allows outbound UDP 41641 (WireGuard) and accepts all traffic on the `tailscale0` interface.

### Connecting to Remote WiFi

Before shipping the Pi to its destination, configure the target WiFi:

```bash
sudo nmcli dev wifi connect "SSID" password "password"
```

The Pi will auto-connect when it sees the configured network.

### Useful Commands

```bash
# App service
sudo systemctl status zahumny-kiosk
sudo systemctl restart zahumny-kiosk
sudo journalctl -u zahumny-kiosk -f

# Trigger deploy
sudo systemctl start zahumny-kiosk-deploy.service
sudo journalctl -u zahumny-kiosk-deploy -f

# Firewall
sudo nft list ruleset

# Full reboot
sudo reboot
```
