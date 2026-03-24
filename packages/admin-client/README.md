# @kioskkit/admin-client

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

## Local development

```bash
pnpm --filter @kioskkit/admin-client dev
```

The dev server runs on **port 5175** and proxies `/api` requests to `http://localhost:3002`.

Requires `@kioskkit/web-server` running on port 3002 for API access.
