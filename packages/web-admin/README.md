# @kioskkit/web-admin

Admin dashboard for KioskKit platform operators, hosted at **admin.kioskk.net**. Built with [react-admin](https://marmelab.com/react-admin/) v5.

## Admin vs Customer Dashboard

### Admin dashboard (this package, admin.kioskk.net) — platform operator

- Register devices (name, Tailscale IP, assign to customer)
- Manage/delete devices
- User management (view customers, roles)
- Platform operations (billing, etc. eventually)
- Does **not** see inside any kiosk — kiosk data is the customer's private business data

### Customer dashboard (web-client) — kiosk owner

- View their own devices and device status
- Manage their kiosk through the device proxy (catalog, buyers, settings, consumption)
- Private data tied to their Google authentication, stored in the kiosk's local SQLite

The admin never accesses kiosk contents. Each kiosk is a customer's own database with sensitive data (buyers, consumption records, pricing).

## Architecture

### Data providers

Each resource has its own `DataProvider` implementation under `src/dataProvider/`:

```
src/dataProvider/
  index.ts      — routes resources via combineDataProviders
  devices.ts    — CRUD operations for devices (via tRPC)
  users.ts      — read-only provider for users (via tRPC)
```

To add a new resource: create a new `<resource>.ts` file implementing `DataProvider`, then add a case to the switch in `index.ts`.

### Resources (UI)

React-admin resource components live in `src/resources/`, one file per resource.

## Local development

```bash
pnpm --filter @kioskkit/web-admin dev
```

The dev server runs on **port 5175** and proxies `/api` requests to `http://localhost:3002`.

Requires `@kioskkit/web-server` running on port 3002 for API access.
