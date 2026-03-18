# KioskKit

Touchscreen kiosk platform for honor-system self-service tracking. Buyers (apartment residents, hotel guests, office workers, etc.) use a locked-down Raspberry Pi touchscreen to record consumption; managers use a web dashboard to configure catalogs, view reports, and manage payments. Supports multiple languages and currencies via i18n.

## Architecture

```
                    ┌─────────────────────────────┐
                    │         web-server           │
                    │   Hono + Postgres + S3       │
                    │   Auth, tenants, billing     │
                    └──────┬──────────────┬────────┘
                           │              │
                      Tailscale      HTTPS (public)
                           │              │
              ┌────────────▼──┐    ┌──────▼───────┐
              │  Raspberry Pi │    │  web-client   │
              │  (per-site)   │    │  (dashboard)  │
              │               │    └──────────────-┘
              │  kiosk-server │
              │  kiosk-client │
              │  SQLite       │
              └───────────────┘
```

**The Pi never initiates outbound connections.** It sits on a Tailscale tailnet reachable only by the web-server. All management — catalog changes, buyer config, settings, backups, reports — is driven by the web-server reading from and writing to the Pi's local API over Tailscale. The Pi's only job is serving the touchscreen UI and recording transactions into SQLite.

If the internet or web-server goes down, the kiosk keeps working. Managers lose remote access until connectivity returns, but no guest-facing functionality is affected.

## Monorepo Structure

```
packages/
├── shared/          # Types, constants, price/preorder utils
├── kiosk-client/    # Pi touchscreen SPA — React + Vite
├── kiosk-server/    # Pi backend — Hono + SQLite (port 3001)
├── web-client/      # Manager dashboard — React + Vite (port 5174)
├── web-server/      # Cloud backend — Hono + Postgres (port 3002)
└── landing/         # Marketing site + interactive demo — Astro (port 4321)

system/              # Raspberry Pi OS-level kiosk config (configs, services)
ansible/             # Ansible playbooks for Pi provisioning and deploys
```

**Tooling**: pnpm workspaces, Turborepo, TypeScript strict mode, Vitest, Biome (lint + format), Docker Compose (local Postgres), Drizzle ORM, GitHub Actions CI.

## Packages

### shared

Types and utilities shared across packages: `Buyer`, `CatalogCategory`, `RecordEntry`, `KioskSettings`, `PreorderConfig`. Locale-aware price parsing/formatting (`Intl.NumberFormat`), preorder delivery date calculation, record validation.

### kiosk-client

React SPA for the Pi touchscreen. Offline-first — records queue locally and flush when the server is reachable. Screens: buyer select → category select → item select → confirm. Preorder categories get quantity pickers and delivery date display. Dims after 15s idle, resets to home after 60s. All UI strings are i18n-ready (Czech and English included).

### kiosk-server

Hono API + SQLite running locally on the Pi. Serves the kiosk-client static build to the touchscreen and exposes a local API. This API is consumed by the touchscreen UI directly and by the web-server over Tailscale for remote management.

**Touchscreen endpoints** (used by kiosk-client):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/catalog` | GET | Product catalog |
| `/api/buyers` | GET | Buyer list |
| `/api/health` | GET | Health check |
| `/api/record` | POST | Submit a consumption record |
| `/api/overview` | GET | All records |
| `/api/item-count` | GET | Balance for buyer+item |
| `/api/preorder-config` | GET | Ordering/delivery schedule |
| `/api/settings` | GET | Kiosk settings |

**Management endpoints** (called by web-server over Tailscale):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/buyers` | POST/PUT/DELETE | CRUD buyers |
| `/api/admin/catalog` | POST/PUT/DELETE | CRUD categories and items |
| `/api/admin/settings` | PUT | Update settings |
| `/api/admin/preorder-config` | PUT | Update preorder config |
| `/api/reports/consumption` | GET | Aggregated consumption report |
| `/api/reports/preorders` | GET | Preorders by delivery date |

### web-server

Cloud backend. Owns the customer-facing concerns: Google SSO auth, tenant accounts, device registry, subscriptions, payment processing. Stores its own data in Postgres (accounts, devices, billing) and S3 (Pi backup snapshots).

For kiosk management, the web-server acts as a proxy — it receives authenticated requests from the web-client, looks up the target device's Tailscale IP, and forwards the request to the Pi's kiosk-server API. No data duplication; the Pi's SQLite is the source of truth for all kiosk data.

Periodically reads each Pi's SQLite database over Tailscale for backup snapshots. Restore = push a snapshot back to the Pi.

### web-client

Manager dashboard SPA. Login via Google SSO. Shows a device grid (online/offline, last backup). Click a device to manage: edit catalog, configure buyers, view consumption reports, download/restore backups. All management requests go through the web-server, which proxies to the Pi.

### landing

Static marketing site with an interactive kiosk demo. Astro with React islands for the demo component.

## Development

```bash
pnpm install
docker compose up -d  # start local Postgres
pnpm dev              # starts all packages with hot reload (turbo)
pnpm build            # production build (turbo, cached)
pnpm typecheck        # type-check all packages
pnpm test             # vitest
pnpm lint             # biome check
pnpm lint:fix         # biome auto-fix
```

Run a single package:

```bash
pnpm --filter @kioskkit/kiosk-server dev
pnpm --filter @kioskkit/landing dev
```

### Database

web-server uses Postgres via Drizzle ORM. Local dev uses Docker Compose:

```bash
docker compose up -d                          # start Postgres
pnpm --filter web-server run db:push          # apply schema
pnpm --filter web-server run db:generate      # generate migrations
pnpm --filter web-server run db:migrate       # run migrations
```

## Environment

| Variable | Used by | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | kiosk-server | `3001` | Kiosk API port |
| `KIOSK_TZ` | shared | `Europe/Prague` | Timezone for delivery date calculations |
| `DATABASE_URL` | web-server | — | Postgres connection string |
| `GOOGLE_CLIENT_ID` | web-server | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | web-server | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | web-server | `http://localhost:3002/api/auth/google/callback` | OAuth redirect URI |

## Pi Deployment

Pi provisioning and deploys are managed with **Ansible** from a control machine over Tailscale SSH. There is no git clone, deploy key, or auto-pull on the Pi itself.

```bash
cd ansible/

# Full initial provisioning (fresh Raspberry Pi OS → locked-down kiosk)
ansible-playbook playbooks/provision.yml -l <host>

# Push code update + rebuild
ansible-playbook playbooks/deploy.yml -l <host>

# Config-only update (no rebuild)
ansible-playbook playbooks/configure.yml -l <host>
```

Per-device variables (`kioskkit_tailscale_auth_key`, `kioskkit_device_id`, `kioskkit_customer_tag`) are set in the inventory. See `ansible/README.md` for details.

### Network model

The Pi's nftables firewall drops all outbound traffic except Tailscale (UDP 41641) and DHCP. No DNS, no HTTP, no outbound anything. The device is reachable by the web-server via Tailscale but cannot initiate connections to the internet. Even with code execution on the Pi, an attacker couldn't exfiltrate data or download payloads — the only reachable destination is the web-server.

### Boot sequence

```
systemd
├── kioskkit.service → node kiosk-server (port 3001)
├── getty@tty1 → autologin kiosk → .bash_profile → poll 3001 → exec sway
│     └── chromium --kiosk http://localhost:3001
└── bcm2835_wdt (15s hardware watchdog)
```

Chromium/sway crash → getty respawns. Node crash → systemd restarts. System hang → watchdog reboots.

### Security layers

sway (no VT switch) · `exec` in .bash_profile (no shell escape) · viewport meta + CSS touch-action (no pinch zoom) · chromium --kiosk (no address bar) · chromium policies (no devtools/downloads/external URLs) · nftables (Tailscale-only outbound) · udev USB block · SysRq disable · locked kiosk user (no sudo) · systemd sandboxing (writes to `data/` only) · SSH key-only + no root login

### Useful commands

```bash
sudo systemctl status kioskkit          # app status
sudo journalctl -u kioskkit -f          # app logs
sudo systemctl restart kioskkit         # restart app
sudo nft list ruleset                   # firewall rules
```
