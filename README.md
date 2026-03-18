# KioskKit

Touchscreen kiosk platform for shared-resource tracking in apartment buildings. Residents use a locked-down Pi touchscreen to record consumption; building managers use the web app to configure catalogs, view reports, and manage payments.

## Monorepo Structure

```
packages/
├── shared/          # Types, constants, price/pastry utils
├── kiosk-client/    # Pi touchscreen SPA — React + Vite
├── kiosk-server/    # Pi backend — Hono + SQLite (port 3001)
├── web-client/      # Tenant web app — React + Vite (port 5174)
├── web-server/      # Web backend — Hono + Postgres (port 3002)
└── landing/         # Marketing site + interactive demo — Astro (port 4321)

system/              # Raspberry Pi OS-level kiosk config
```

**Tooling**: pnpm workspaces, Turborepo, TypeScript strict mode, Vitest.

## Development

```bash
pnpm install
pnpm dev          # starts all packages with hot reload (turbo)
pnpm build        # production build (turbo, cached)
pnpm typecheck    # type-check all packages
pnpm test         # vitest
```

Run a single package:

```bash
pnpm --filter @kioskkit/kiosk-server dev
pnpm --filter @kioskkit/landing dev
```

## Packages

### shared

Types and utilities shared across all packages: `Apartment`, `CatalogCategory`, `RecordEntry`, `KioskSettings`, `PastryConfig`. Price parsing/formatting (Czech Kč), pastry delivery date calculation, record validation.

### kiosk-client

React SPA for the Pi touchscreen. Offline-first — records queue locally and flush when the server is reachable. Screens: apartment select → category select → item select → confirm. Pastry categories get quantity pickers and delivery date display. Dims after 15s idle, resets to home after 60s.

### kiosk-server

Hono API + SQLite on the Pi. Serves the kiosk-client static build and exposes:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/catalog` | Product catalog (categories + items) |
| `GET /api/apartments` | Apartment list |
| `GET /api/health` | `{ online: true, queued: 0 }` |
| `POST /api/record` | Submit a consumption record |
| `GET /api/overview` | All records |
| `GET /api/item-count` | Balance for buyer+item |
| `GET /api/pastry-config` | Ordering/delivery day schedule |
| `GET /api/settings` | Kiosk settings (dim timeout, maintenance mode) |
| `POST/PUT/DELETE /api/admin/apartments` | CRUD apartments |
| `POST/PUT/DELETE /api/admin/catalog` | CRUD categories and items |
| `PUT /api/admin/settings` | Update settings |
| `PUT /api/admin/pastry-config` | Update pastry config |
| `GET /api/reports/consumption` | Aggregated consumption by item+apartment |
| `GET /api/reports/pastry` | Pastry orders by delivery date |

### web-client

Tenant-facing web app for building managers — login, catalog/apartment management, reports, payments. (Scaffold — in progress.)

### web-server

Backend for the web app — auth, multi-tenant data, Tailscale coordination with Pis, payment processing. Hono + Postgres. (Scaffold — in progress.)

### landing

Static marketing site with an interactive kiosk demo. Astro with React islands for the demo component.

## Environment

| Variable | Used by | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | kiosk-server | `3001` | Kiosk API port |

## Pi Deployment

The `system/` directory turns a Raspberry Pi into a locked-down kiosk. Run `setup.sh` on a fresh Raspberry Pi OS install and reboot.

```bash
git clone git@github.com:Anananas42/kiosk-kit.git /tmp/kiosk-kit
cp /path/to/.env /tmp/kiosk-kit/.env
sudo bash /tmp/kiosk-kit/system/setup.sh
sudo reboot
```

### What setup.sh does

Installs Node.js 20 + pnpm + sway + chromium + nftables. Creates a locked `kiosk` user. Deploys to `/opt/kioskkit`. Configures: systemd service, tty1 autologin, sway compositor (hidden cursor, fullscreen chromium), Chromium policies (localhost-only allowlist, no devtools), nftables firewall, USB storage block, SysRq disable, SSH key-only auth, hardware watchdog (bcm2835_wdt, 15s), daily auto-deploy timer (04:00).

### Boot sequence

```
systemd
├── kioskkit.service → node kiosk-server (port 3001)
├── getty@tty1 → autologin kiosk → .bash_profile → poll 3001 → exec sway
│     └── chromium --kiosk http://localhost:3001
└── bcm2835_wdt (15s hardware watchdog)
```

Chromium/sway crash → getty respawns. Node crash → systemd restarts. System hang → watchdog reboots.

### Auto-deploy

Daily at 04:00 via `kioskkit-deploy.timer`. Pulls `origin/main`, rebuilds, restarts. Preserves `data/` and `.env`.

```bash
sudo systemctl start kioskkit-deploy.service   # trigger manually
sudo journalctl -u kioskkit-deploy -f           # watch logs
```

### Display behavior

15s idle → dim overlay. 45min idle → DPMS off. First touch when off wakes display (consumed by evdev grab). Cursor hidden.

### Security layers

sway (no VT switch) · `exec` in .bash_profile (no shell escape) · viewport meta + CSS touch-action (no pinch zoom) · chromium --kiosk (no address bar) · chromium policies (no devtools/downloads/external URLs) · nftables (allowlist) · udev USB block · SysRq disable · locked kiosk user (no sudo) · systemd sandboxing (writes to `data/` only) · SSH key-only + no root login · Tailscale for remote access

### Useful commands

```bash
sudo systemctl status kioskkit          # app status
sudo journalctl -u kioskkit -f          # app logs
sudo systemctl restart kioskkit         # restart app
sudo nft list ruleset                   # firewall rules
sudo tailscale up --ssh                 # enable remote access (first time)
```
