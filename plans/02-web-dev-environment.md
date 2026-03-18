# Plan: Web Dev Environment Setup (web-client + web-server)

> **Agent instructions**: You are executing this plan independently. Other agents are working on Ansible migration and kiosk generalization in parallel — coordinate by only touching files in `packages/web-client/`, `packages/web-server/`, and root-level config files (lint/format configs, CI workflows, `.claude/`). When implementation is complete and confirmed correct by the user, delete this file.

## Goal

Research and recommend the full dev tooling setup for the two new web packages so they're production-grade from day one. **This is research only** — produce a concrete recommendation document, don't write code yet.

## Current State

The monorepo already has: pnpm workspaces, Turborepo, TypeScript strict, Vitest, tsup (server builds), Vite (client builds). The `web-client` and `web-server` are empty scaffolds (hello-world level). The existing kiosk packages have **no linter, no formatter, no CI**. The product plan calls for Google SSO, Postgres, S3 backups, Stripe payments.

## Research Areas

### 1. Linting + formatting

The repo has zero lint config today. Research whether to add ESLint + Prettier (or Biome as a single tool) at the **root level** — this would apply to all packages, not just web ones.

Consider: monorepo-wide config vs per-package overrides, TypeScript-aware rules, React-specific rules for clients, import sorting. Biome is faster but newer — compare ecosystem support. Recommend one approach with a root config that all packages inherit.

### 2. Testing strategy for web packages

Vitest is already used for shared/kiosk-server unit tests. Research what's needed for:
- **web-server**: API route testing (Hono has `app.request()` test helper)
- **web-client**: component testing (vitest + @testing-library/react vs testing hooks/logic without DOM)
- **E2E**: probably not warranted yet — flag as future

Recommend test file conventions matching existing `*.test.ts` co-location.

### 3. Database tooling for web-server

The web-server uses Postgres. Research:
- **Migration tool**: Drizzle ORM (has its own migrations), Prisma, or raw SQL with a lightweight migrator? The kiosk-server uses raw SQL with better-sqlite3 and it works fine — match that philosophy if possible.
- **Connection pooling**: serverless-compatible (Neon has built-in, others need pg-pool)
- **Local dev**: docker-compose for Postgres, or Neon free tier for dev?

Recommend the lightest setup that doesn't fight existing patterns.

### 4. Auth

Google SSO via OAuth2. Research:
- **Library**: arctic (lightweight OAuth), lucia (session management), oslo (utilities). Better to use a focused library than a framework like next-auth since we're on Hono, not Next.js.
- **Session storage**: Postgres sessions vs JWT vs encrypted cookies
- **Hono middleware**: what does the auth middleware look like?

### 5. Deployment

Research hosting for web-server + web-client. Constraints: must run Tailscale (to reach Pis), must have Postgres, must have S3-compatible storage.

Options:
- Single VPS (Hetzner/DigitalOcean) running everything
- Fly.io (supports Tailscale, has Postgres)
- Railway

For the client SPA: serve from same server, or deploy to Cloudflare Pages/Vercel? Consider that the web-server needs to proxy to Pis — a VPS with Tailscale is likely simplest.

Recommend one path.

### 6. CI/CD

GitHub Actions. Research:
- Monorepo-aware CI — turbo has `--filter=[origin/main...]` for only building changed packages
- Test + typecheck + lint on PR
- Deploy on merge to main

What does the workflow look like for a turbo monorepo?

### 7. Claude Code integration

Research what MCP servers and agent skills would be useful for this monorepo:
- Postgres MCP for database queries during dev
- GitHub MCP for PR/issue management
- Custom skills for common workflows (deploy to staging, run migrations, etc.)

What config goes in `.claude/` for this?

### 8. Payments

Stripe for Czech business. Research:
- Stripe.js + @stripe/react-stripe-js for web-client
- stripe node SDK for web-server
- Webhook handling pattern in Hono
- Subscription model (Stripe Billing with monthly plan)

Note any Czech-specific considerations (currency CZK, VAT/DPH reporting).

## Output

A structured recommendation document (can be a markdown file in `plans/`) covering each area with: **chosen tool, why, what config is needed, and any gotchas**. Not code — just decisions that an implementer can execute.
