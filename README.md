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
              │               │    └───────────────┘
              │  kiosk-server │         │
              │  kiosk-client │    embeds kiosk-admin
              │  kiosk-admin  │    via iframe through
              │  SQLite       │    web-server proxy
              └───────────────┘
```

**The Pi never initiates outbound connections.** It sits on a Tailscale tailnet reachable only by the web-server. The Pi serves both the touchscreen UI (kiosk-client) and its own admin UI (kiosk-admin). The web-client embeds the kiosk-admin SPA in an iframe, proxied through the web-server over Tailscale. This means the admin UI always matches the kiosk-server version on the device — no version coupling between the cloud and the Pi.

If the internet or web-server goes down, the kiosk keeps working. Managers lose remote access until connectivity returns, but no guest-facing functionality is affected.

## Monorepo Structure

```
packages/
├── shared/          # Types, constants, price/preorder utils
├── kiosk-client/    # Pi touchscreen SPA — React + Vite
├── kiosk-admin/     # Pi admin SPA — React + Vite (served at /admin/)
├── kiosk-server/    # Pi backend — Hono + SQLite (port 3001)
├── web-client/      # Manager dashboard — React + Vite (port 5174)
├── web-server/      # Cloud backend — Hono + Postgres (port 3002)
├── web-admin/       # Platform admin panel — React-Admin (admin.* subdomain)
└── landing/         # Marketing site + interactive demo — Astro (port 4321)

deploy/
├── cloud/           # Fly.io deployment (Dockerfile, fly.toml)
└── pi/
    ├── ansible/     # Ansible playbooks for Pi provisioning and deploys
    └── system/      # Raspberry Pi OS-level kiosk config (configs, services)

dev/
├── agents/          # Agent container, scripts, and skills
└── docker-compose.yml  # Local dev Postgres
```

**Tooling**: pnpm workspaces, Turborepo, TypeScript strict mode, Vitest, Biome (lint + format), Docker Compose (local Postgres), Drizzle ORM, GitHub Actions CI.

## Packages

### shared

Types and utilities shared across packages: Zod schemas, derived TypeScript types, locale-aware price parsing/formatting (`Intl.NumberFormat`), preorder delivery date calculation, record validation, timing constants.

### kiosk-client

React SPA for the Pi touchscreen. Offline-first — records queue locally and flush when the server is reachable. Screens: buyer select → category select → item select → confirm. Preorder categories get quantity pickers and delivery date display. Dims after 15s idle, resets to home after 60s. All UI strings are i18n-ready (Czech and English included).

### kiosk-admin

React SPA for remote kiosk management, served by kiosk-server at `/admin/`. Provides catalog CRUD, buyer management, consumption reports, settings, and preorder configuration. This UI ships on the Pi itself, so it always matches the kiosk-server version. The web-client embeds it in an iframe via the web-server's Tailscale proxy — managers interact with it through the dashboard without knowing it's served from the device.

### kiosk-server

Hono API + SQLite running locally on the Pi. Serves both the kiosk-client (touchscreen SPA at `/`) and kiosk-admin (management SPA at `/admin/`). Exposes a tRPC API consumed by both SPAs and by the web-server over Tailscale.

**tRPC procedures** (used by kiosk-client and kiosk-admin):

| Namespace | Procedures | Purpose |
|-----------|-----------|---------|
| `catalog` | `list` | Product catalog |
| `buyers` | `list` | Buyer list |
| `records` | `submit`, `list`, `itemCount` | Record consumption |
| `settings` | `get` | Kiosk settings |
| `preorderConfig` | `get` | Ordering/delivery schedule |
| `reports` | `consumption`, `preorders` | Aggregated reports |
| `admin.buyers` | `create`, `update`, `delete` | Buyer management |
| `admin.catalog` | `createCategory`, `updateCategory`, `deleteCategory`, `createItem`, `updateItem`, `deleteItem` | Catalog management |
| `admin.settings` | `get`, `update` | Settings management |
| `admin.preorderConfig` | `update` | Preorder config |

### web-server

Cloud backend. Owns the customer-facing concerns: Google SSO auth, tenant accounts, device registry, subscriptions, payment processing. Stores its own data in Postgres (accounts, devices, billing) and S3 (Pi backup snapshots).

For kiosk management, the web-server acts as a transparent proxy — it receives authenticated requests from the web-client (including iframe requests from the embedded kiosk-admin), looks up the target device's Tailscale IP, and forwards them to the Pi's kiosk-server. No data duplication; the Pi's SQLite is the source of truth for all kiosk data.

Periodically reads each Pi's SQLite database over Tailscale for backup snapshots. Restore = push a snapshot back to the Pi.

### web-client

Manager dashboard SPA. Login via Google SSO. Shows a device grid (online/offline, last backup). Click a device to open its management view, which embeds the device's own kiosk-admin SPA in an iframe (proxied through the web-server over Tailscale). The web-client is a thin orchestration shell — auth, device list, status monitoring — while all kiosk management UI lives on the device itself. This eliminates version coupling between the cloud and kiosk software.

### web-admin

Platform admin panel (react-admin) served at the `admin.*` subdomain. For platform operators only — manage all users and devices across the system. Distinct from kiosk-admin which is per-device management for customers.

### landing

Static marketing site with an interactive kiosk demo. Astro with React islands for the demo component.

## Development

```bash
pnpm install
docker compose -f dev/docker-compose.yml up -d  # start local Postgres
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
docker compose -f dev/docker-compose.yml up -d  # start Postgres
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
cd deploy/pi/ansible/

# Full initial provisioning (fresh Raspberry Pi OS → locked-down kiosk)
ansible-playbook playbooks/provision.yml -l <host>

# Push code update + rebuild
ansible-playbook playbooks/deploy.yml -l <host>

# Config-only update (no rebuild)
ansible-playbook playbooks/configure.yml -l <host>
```

Per-device variables (`kioskkit_tailscale_auth_key`, `kioskkit_device_id`, `kioskkit_customer_tag`) are set in the inventory. See `deploy/pi/ansible/README.md` for details.

### Network model

The Pi's nftables firewall drops all outbound traffic except Tailscale (UDP 41641) and DHCP. No DNS, no HTTP, no outbound anything. The device is reachable by the web-server via Tailscale but cannot initiate connections to the internet. Even with code execution on the Pi, an attacker couldn't exfiltrate data or download payloads — the only reachable destination is the web-server.

### Boot sequence

```
systemd
├── kioskkit.service → node kiosk-server (port 3001)
├── getty@tty1 → autologin kiosk → .bash_profile → poll 3001 → exec labwc
│     └── chromium --kiosk http://localhost:3001
└── bcm2835_wdt (15s hardware watchdog)
```

Chromium/labwc crash → getty respawns. Node crash → systemd restarts. System hang → watchdog reboots.

### Security layers

labwc (no VT switch) · `exec` in .bash_profile (no shell escape) · viewport meta + CSS touch-action (no pinch zoom) · chromium --kiosk (no address bar) · chromium policies (no devtools/downloads/external URLs) · nftables (Tailscale-only outbound) · udev USB block · SysRq disable · locked kiosk user (no sudo) · systemd sandboxing (writes to `data/` only) · SSH key-only + no root login

### Useful commands

```bash
sudo systemctl status kioskkit          # app status
sudo journalctl -u kioskkit -f          # app logs
sudo systemctl restart kioskkit         # restart app
sudo nft list ruleset                   # firewall rules
```
