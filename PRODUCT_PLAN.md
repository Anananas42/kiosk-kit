# KioskKit — Product Plan

## What It Is

A self-service kiosk for small pensions and guesthouses. Touchscreen tablet (Raspberry Pi + screen) mounted in a common area near a fridge or self-service shelf. Guests walk up, grab a drink, tap it on the screen. Owner sees everything logged. No staff needed.

Also supports **advance ordering** — in the current deployment, guests order fresh pastries in the evening, the owner sends the order to a local bakery, pastries arrive next morning with per-day distribution sheets generated automatically for printing. This is a concrete instance of a generic pre-ordering capability (configurable schedules, quantity pickers, aggregated order views) that could be generalized for other use cases.

**Honor-based system.** No payment terminal, no vending machine. Fits the trust-based culture of small pensions with 10–20 guests.

Replaces: a whiteboard. That's the pitch. Photo of whiteboard → photo of kiosk. Every pension owner gets it instantly.

---

## What Exists Today

Working production deployment at a family pension. Full source in `zahumny-kiosk` repo.

### Current Stack
- **Client:** React SPA (Vite), works offline with local submit queue
- **Server:** Hono + better-sqlite3 on port 3001
- **Data:** Google Sheets as primary store, SQLite as local cache/queue
- **Hardware:** Raspberry Pi 4B (4GB), HDMI touchscreen
- **Networking:** Tailscale for remote access (device is ~200km away)
- **Display:** Sway (Wayland) + Chromium in kiosk mode

### What's Already Solid
- **Resilience:** Offline queue, SQLite cache, auto-reconnect, hardware watchdog (15s), getty respawn on crash, systemd restart on app crash. Survives power outages, WiFi drops, process crashes.
- **Security:** USB storage blocked, nftables firewall, Chromium policy lockdown (no devtools/downloads/navigation), SysRq disabled, kiosk user (no sudo), systemd sandboxing, SSH key-only.
- **Kiosk UX:** 15s idle → dim, 30min idle → screen off via DPMS, first touch wakes display without triggering UI, hidden cursor.
- **Auto-deploy:** Daily git pull at 04:00 via systemd timer, rebuild + restart if changes detected.
- **Setup:** Idempotent `setup.sh` — run on fresh Raspberry Pi OS, reboot, done.

### Current Limitations
- Hardcoded to one pension's Google Sheet
- Requires Google service account + API key (non-starter for non-technical users)
- Sheets API 300/min quota (fine for one pension, but unnecessary dependency)
- Auto-deploy from single git repo (doesn't scale to multiple customers)
- No multi-tenant anything

---

## Product Version — Architecture

### Core Principle
**The Pi is the source of truth for all kiosk data.** Your backend is the middle layer that connects customers to their devices.

### On the Device
- Local **SQLite** database replaces Google Sheets entirely — all kiosk data (products, prices, transactions) lives here
- Serves **kiosk UI** on the touchscreen (Chromium, same as now)
- **Tailscale** connects the Pi to your backend (invisible to customer)
- Periodic **SQLite snapshot** pushed to your backend for backup

### Your Backend
- **Proxy layer** — routes authenticated dashboard requests to the correct Pi via Tailscale
- **Dashboard web app** — the customer-facing UI for managing their kiosk remotely (served by your backend, reads/writes to the Pi in real time)
- **Backup storage** — receives and stores periodic SQLite snapshots per device (S3 or equivalent)
- **Customer database** — accounts, device ownership, subscriptions, backup metadata
- **Google SSO** — single auth method, no passwords to manage

### What This Means
- Pi works fully offline — if your backend or internet goes down, kiosk keeps serving guests
- Dashboard edits are instant (your backend proxies directly to the Pi, not synced)
- Cloud infrastructure is lightweight — a VPS, an S3 bucket, a small customer DB
- If customer cancels subscription, their kiosk keeps working locally, they just lose remote dashboard access
- If your VPS goes down, no kiosk is affected — customers just lose remote access until you fix it

### Backup Architecture
- Pi periodically uploads a SQLite dump to your backend's storage
- Snapshots are stored per device with timestamps
- Dashboard has a **"download backup"** button and a **"restore from backup"** button
- Restore = upload snapshot file back to the Pi, overwrite its state
- No sync logic, no conflict resolution — backups are just point-in-time files

### Tailscale Setup
- All Pis live on **your** tailnet — customer never interacts with Tailscale
- Each Pi authenticated with a **pre-auth key** tagged per customer (e.g., `tag:customer-42`)
- ACLs ensure devices can only reach your backend server, not each other
- Free tier covers **100 devices** — enough for a long time
- Migration path if needed: raw WireGuard, Cloudflare Tunnels, or Headscale — customer-facing experience doesn't change
- Tailscale has no third-party OAuth (no "authorize this app to manage my Tailscale") — so customer-owned Tailscale is not viable for non-technical users

### Device Management with Ansible
- Replace current `setup.sh` + daily git pull with **Ansible**
- Ansible playbook for initial Pi provisioning before shipping
- Ansible for remote updates/maintenance through Tailscale — controlled push instead of blind auto-pull
- You decide when to push updates and to which devices
- Same playbook works for 5 or 50 devices

---

## Product Version — User Flow

### Discovery & Trial
1. Visitor lands on website — sees **"whiteboard vs. digital kiosk"** comparison
2. Clicks **"Go try"** — interactive browser demo of the kiosk UI with a basic CRUD dashboard alongside it
3. Plays around, sees how simple it is

### Decision Point
4. **Crossroad:** "Self-host" (open source repo, docs, use Google Sheets if you want) vs. "All-in-one managed" (paid)
5. Self-host path → GitHub repo, documentation, community. These users were never going to pay. Some will convert later when they get tired of maintaining it.

### Purchase Flow (Managed Path)
6. **Sign in with Google SSO**
7. **Configure kiosk in online simulator** — set up menu items, prices, categories, pension name
8. **Choose device** — screen size, casing color
9. **Upsell: backup device** — "What if something breaks on a Friday night? Pre-configured spare for peace of mind."
10. **Pay** — device + subscription

### Onboarding
11. You receive order, **flash a Pi** with standard image + customer's config from simulator + Tailscale pre-auth key
12. **Ship device**
13. Customer **plugs in via Ethernet**, Pi boots, Tailscale connects automatically
14. Device appears in customer's dashboard as **online**
15. Customer **configures WiFi** through the dashboard (Tailscale is already connected via Ethernet)
16. Unplug Ethernet. Done. Kiosk is running.

**Important:** WiFi setup via dashboard requires Tailscale already connected, which requires Ethernet first. This sequence must be crystal clear in instructions.

### Ongoing Use
17. Customer manages everything from the **remote dashboard** (your web app, accessible from anywhere via Tailscale to the Pi)
18. Dashboard shows **grid of registered devices** — status (online/offline), last sync timestamp
19. Click a device to manage: edit inventory, view sales log, change prices, see orders
20. Backup snapshots happen automatically — downloadable from dashboard
21. If primary Pi dies: plug in backup → click "activate" → restore from latest snapshot → back in business

---

## Backup & Failover

**No automatic failover.** The backup Pi is a cold spare sitting in a drawer.

- Both primary and backup are pre-configured and pre-authenticated on Tailscale before shipping
- Both appear in the customer's device grid (one "active," one "standby")
- Backup doesn't need to stay in sync — it just needs base software and Tailscale auth
- If primary dies: plug in backup → click "activate" in dashboard → click "restore from latest snapshot" → done
- Automatic failover would introduce split-brain problems and complexity for zero real benefit — a 10-minute manual swap is perfectly fine for a pension kiosk
- Multi-device grid also naturally supports future upsell: multiple locations, multiple kiosks per property

---

## Pricing

### Device
- **Hardware cost:** ~150 EUR (Pi 4B 2GB + touchscreen + 3D-printed casing)
- **Selling price:** 9 990 CZK (~400 EUR)
- **Margin per unit:** ~250 EUR

### Subscription
- **9.90 EUR/month** — remote dashboard access, backups, updates
- Under the psychological "10 EUR" barrier
- Justified if the kiosk sells 2 extra beers per month
- Cloud hosting costs are negligible (one VPS + S3 bucket)

### Backup Device
- **Selling price:** 7 490 CZK (~300 EUR) — ~25% discount off the primary
- **Margin:** ~150 EUR
- Pre-configured cold spare, ready to activate

### Self-Host (Free)
- Open source repo, no subscription, no support
- Acts as free tier / community funnel — some will convert to paid

---

## The Math

### Break-Even vs. Day Job
- Current net salary: 5 100 EUR/month → ~30 EUR/hr
- **23 units** to match current hourly rate (factoring in 100h build + 4h per unit)
- After break-even, each additional unit ≈ **62 EUR/hr** (250 EUR margin / 4h)

### Floor Scenario — 10 Units
- Hardware margin: 2 500 EUR
- Subscriptions: ~1 190 EUR/year
- First year total: ~3 700 EUR on 88 hours → **~42 EUR/hr**
- Year 2+: subscriptions keep paying for near-zero effort

### Growth Scenario — 50 Units
- Hardware margin: 12 500 EUR
- Subscriptions: ~6 000 EUR/year
- Per-device time shrinks as process is streamlined

### Scale Scenario — 100 Units
- Subscriptions alone: ~1 000 EUR/month recurring
- Tailscale free tier maxed — upgrade needed but trivially affordable
- Potential acquisition target at this scale

---

## Build Plan — Three Weekends

### Weekend 1: Local-First Architecture
- Decouple from Google Sheets → SQLite as sole data store
- Build local web dashboard served by the Pi
- CRUD for inventory, prices, categories
- Sales log / transaction history view
- **This is the validation weekend** — if migration is clean, the rest follows

### Weekend 2: Cloud & Remote Access
- Tailscale integration for multi-device management
- Your backend: proxy layer routing dashboard requests to the correct Pi
- Google SSO authentication
- Customer database: accounts, device ownership, subscriptions
- Remote dashboard web app (reads/writes to Pi through your backend)
- Backup snapshot mechanism (periodic SQLite dump from Pi to your storage)
- Restore from backup flow

### Weekend 3: Go to Market
- Landing page with whiteboard vs. kiosk pitch
- Interactive browser demo (kiosk UI + dashboard simulator)
- Payment integration (Stripe or similar)
- Device configuration export (from simulator to Pi image)
- Polish, docs, open source repo setup

---

## Hardware Decisions

### RAM: 2GB
- 1GB too tight — Chromium alone eats 300–500MB, add OS + Tailscale + web server and you're at 600–800MB with no headroom
- 2GB is the sweet spot — comfortable margin, low cost (~10–15 EUR more than 1GB)
- 4GB is what the current prototype runs but is unnecessary

### SD Card Security
- **No encryption needed** — but only because of the architectural change. The current prototype actively writes to Google Sheets. The product version makes the Pi **purely passive at the application level** — your backend reads from and writes to it, the Pi never initiates application-level connections.
- At the network level, the Pi does maintain a Tailscale/WireGuard tunnel (necessary for NAT traversal — the Pi is behind a random pension's router). This is the **only** outbound network activity. nftables drops everything else — no DNS, no HTTP, no outbound anything. The device is effectively air-gapped from the internet while still reachable by your backend.
- A stolen/cloned SD card contains: your software (open source anyway), sales data (low value), WiFi credentials (guests already have these), and a Tailscale node key for a passive endpoint.
- Even with code execution on the Pi, an attacker couldn't exfiltrate data, download payloads, or reach anything on the internet. The only reachable destination is your backend.
- USB storage already blocked via udev rules. Physical access gives no more network capability than connecting to the guest WiFi.
- The only remaining attack vector is someone compromising your backend and using it to reach the devices.
- Read-only root filesystem recommended for SD card longevity and power-loss corruption protection, not for security.

---

## Why This Gap Exists

1. **Good enough solved by low-tech.** Whiteboard, notebook, honor jar. Pain exists but isn't acute — vitamin, not painkiller.
2. **LLMs compressed the build time.** A solo dev couldn't justify 12 months of evenings for this market. 2–3 months changes the equation.
3. **Niche is genuinely small.** Big hotels have POS systems. Medium hotels use existing PMS. Target is specifically small owner-operated pensions with self-service areas and no tech.
4. **Capable devs aim higher.** Anyone who could build this is usually chasing SaaS with bigger TAM, not shipping hardware to pensions for 400 EUR.

**Point 4 is the moat.** Nobody well-funded is coming for this market.

---

## Strategic Notes

### The "Uncomfortable Middle"
This product will likely sit in a zone where it's too much for a hobby, too little to hire, not exciting for investors. **That's the goal** — a profitable side project, not a startup. 50–100 units/year, 10–20k EUR side income, few hours/week.

### Avoiding the Support Trap
- Device must be self-contained and near-indestructible (current resilience design already achieves this)
- Build so updates are genuinely unnecessary, not deferred
- Your backend is a convenience layer, not a dependency — kiosk works without it
- No SLA — subscription buys convenience, not support. Make this explicit.
- Dashboard must be as simple as editing a spreadsheet

### Distribution
- Pension owners don't browse Product Hunt
- Channels: local hospitality Facebook groups, regional tourism meetups, industry newsletters, word of mouth
- Best channel: owner-to-owner recommendation
- Subtle **"Powered by KioskKit"** on the kiosk screen — guests who own pensions notice it
- First sales channel: your dad's network of pension owners

### Exit Options
- Keep as passive income
- Sell on Acquire.com / MicroAcquire — micro-products at 30–50k/year sell at 2–3× annual revenue
- Hospitality SaaS company acquires to bolt onto their offering

---

## Open Questions

- [x] Brand name / product name — **KioskKit** (logo: **KK**)
- [ ] Exact screen sizes to offer
- [ ] 3D-printed casing design — commission or DIY?
- [ ] Stripe vs. other payment provider for Czech business
- [ ] Legal structure — živnostenský list sufficient or s.r.o. needed?
- [ ] Warranty / return policy
- [ ] Backup snapshot frequency
- [ ] Open source license choice (MIT? AGPL?)
- [ ] Domain name (kioskkit.com, kioskkit.io, etc.)
- [ ] Multi-location upsell pricing (additional devices on same account)

---

*Logo note: lowercase "kk" in a rounded font (Nunito/Quicksand), teal-green, vaguely reminiscent of Pied Piper from Silicon Valley. Those who know, know.*
