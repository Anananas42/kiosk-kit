---
name: agent-container
description: Launch and manage isolated agent containers for autonomous development tasks
---

## What this is

A Docker-based isolated environment for running Claude Code agents. Each container gets its own repo copy, postgres instance, and git identity — completely separate from the host's local development environment.

## Prerequisites

- Claude Code subscription (credentials at `~/.claude/.credentials.json`)
- GitHub App PEM file at `~/.config/github-apps/kiosk-kit-agent.pem`
- `.env` file with API keys (see Secrets section)
- Docker running

## Launching an agent

```bash
# Interactive claude session in a container
./dev/agents/scripts/run.sh

# Non-interactive with a task description
./dev/agents/scripts/run.sh "Implement feature X per Linear issue KIO-15"

# Skip the PR watch loop (for testing)
./dev/agents/scripts/run.sh --no-loop "List your MCP servers"

# Rebuild the image first (after Dockerfile changes or to update Claude Code)
./dev/agents/scripts/run.sh --build

# Start with Docker-in-Docker sidecar (for tasks needing docker/docker compose)
./dev/agents/scripts/run.sh --docker "Run integration tests for the Pi simulator"
```

## What the container provides

| Component | Detail |
|-----------|--------|
| Node.js | v24 (matches CI) |
| pnpm | 10.32.1 (from corepack) |
| Claude Code | Pre-installed, runs with `--dangerously-skip-permissions` |
| Git identity | `kiosk-kit-agent[bot]`, no GPG signing, HTTPS remote |
| GitHub CLI | `gh`, authenticated via app token from `dev/agents/scripts/github-app-token.sh` |
| gh-attach | `gh attach` extension for uploading screenshots to PR comments |
| shellcheck | Pre-installed for `pnpm lint:shell` |
| Playwright | Chromium pre-installed for screenshot verification |
| Docker CLI | Available in image; connects to DinD sidecar when `--docker` flag is used |
| Postgres | Isolated sidecar (port 5432 internal), schema auto-pushed on start |
| Repo | Full copy from host bind mount (read-only source), writable workspace |
| MCP servers | context7, stitch, Linear, Neon, postgres — all available |

## Secrets

The container loads secrets from two sources:

**`.env` file** (gitignored, at repo root):
```
DATABASE_URL=postgresql://kioskkit:kioskkit@localhost:5433/kioskkit
LINEAR_API_KEY=lin_api_...
NEON_API_KEY=napi_...
STITCH_API_KEY=...
```

**Mounted files:**
- `~/.config/github-apps/kiosk-kit-agent.pem` — GitHub App private key
- `~/.claude/.credentials.json` — Claude Code subscription credentials

## How it works

1. Host repo is bind-mounted read-only at `/mnt/repo`
2. Entrypoint (`dev/agents/container/entrypoint.sh`) copies it to `/workspace` via rsync
3. Git is configured with bot identity and HTTPS origin (no SSH, no GPG)
4. GitHub App PEM and Claude credentials are copied from `/mnt/secrets/`
5. `pnpm install --frozen-lockfile` runs (cached across runs via named volumes)
6. Postgres health check passes, then `db:push` applies the schema
7. A `CLAUDE.md` is generated at `/workspace/CLAUDE.md` by concatenating all `dev/agents/skills/*/SKILL.md` files — every agent conversation starts with all skills as context
8. Claude starts with the provided task or in interactive mode
9. After claude finishes a non-interactive task, its session ID is captured so the watch loop can resume it
10. The **PR watch loop** takes over (unless `--no-loop`), resuming the primary session for fixes
11. On exit, `run.sh` tears down sidecar containers (postgres, dind) and networks via `docker compose down`. Named volumes (pnpm store, node_modules) are preserved for caching across runs.

## Cleanup

When the agent exits (normally or via Ctrl-C), `run.sh` automatically runs `docker compose down --remove-orphans` to stop sidecar containers and remove networks. Named volumes are intentionally kept for build caching.

To reclaim all space including cached volumes:

```bash
docker compose -f dev/agents/container/docker-compose.yml down --volumes --remove-orphans --rmi local
```

## PR watch loop

When a task is provided via `AGENT_TASK`, the container does not exit after claude finishes. Instead, the entrypoint enters a polling loop:

1. Polls the PR for the current branch every 30 seconds
2. Checks CI status and review comments
3. If CI is failing or reviews need attention → resumes the primary agent session via `claude --resume` with the failure/feedback details. This preserves the agent's full conversation history from the implementation phase.
4. If PR is merged or closed → container exits cleanly
5. After 5 consecutive failed fix attempts → posts a comment asking for human help and continues polling for `@continue`

Use `--no-loop` to skip the watch loop (useful for testing). Interactive sessions also skip it.

### PR comment commands

The watch loop recognizes special commands in PR comments from non-bot users:

- **`@continue`** — Resets the attempt counter to 0 and resumes the polling loop. Use this after the agent has hit the max attempts limit and a human has provided guidance or fixed the underlying issue. The agent will pick up any pending CI failures or review comments on the next iteration.
- **`@tester`** — Invokes the testing agent on demand, even if it already ran once for this PR. Useful for re-testing after additional changes. If `@tester` appears alongside other review feedback, the agent addresses the feedback first, then runs the testing agent.
- **`@reviewer`** — Invokes the reviewing agent on demand, even if it already ran once for this PR. Useful for re-reviewing after the main agent has addressed feedback.

## Testing agent

After CI passes on a PR, the watch loop automatically runs a **testing agent** — a separate `claude` invocation that:

1. Reads `.claude/commands/testing.md` and the PR description (manual test steps)
2. Starts the relevant dev servers based on changed files
3. Drives a browser via Playwright MCP to execute each test step
4. Posts structured pass/fail results as a PR comment
5. Optionally requests changes if critical failures are found (>50% steps fail)

After the testing agent finishes, its comment(s) are handed to the main agent, which decides whether to act on them (fix failures) or acknowledge them (thumbs up reaction).

Key properties:
- **Runs exactly once per PR** — tracked via a marker file at `/tmp/.testing-done-<PR_NUMBER>`. Re-invoked on `@tester` command.
- **Does NOT modify code or push changes** — it is read-only. Any failures it finds must be addressed by the main agent in a subsequent fix cycle.
- **Crash-safe** — the testing agent invocation uses `|| true`, so a crash does not kill the watch loop. The marker file is touched unconditionally after invocation.

## Reviewing agent

After the testing agent finishes, the watch loop automatically runs a **reviewing agent** — a separate `claude` invocation that:

1. Reads `.claude/commands/reviewing.md` and the changed files
2. Reviews code quality: component structure, naming, UI library usage, error handling, schema migrations
3. Posts structured findings as a PR comment
4. Optionally requests changes if must-fix issues are found

After the reviewing agent finishes, its comment(s) are handed to the main agent, which decides whether to act on them (fix issues) or acknowledge them (thumbs up reaction).

Key properties:
- **Runs exactly once per PR** — tracked via a marker file at `/tmp/.reviewing-done-<PR_NUMBER>`. Re-invoked on `@reviewer` command.
- **Does NOT modify code or push changes** — it is read-only. Any issues it finds must be addressed by the main agent in a subsequent fix cycle.
- **Crash-safe** — same `|| true` pattern as the testing agent.

## Docker-in-Docker (DinD) sidecar

Some tasks require Docker (e.g. running `pnpm test:pi-emulator` or other Docker-based workflows). Use the `--docker` flag to start a DinD sidecar alongside the agent:

```bash
./dev/agents/scripts/run.sh --docker "task that needs docker"
```

This starts a `docker:dind` container and sets `DOCKER_HOST=tcp://dind:2375` in the agent. The Docker CLI is pre-installed in the agent image. The sidecar only starts when `--docker` is passed — zero overhead otherwise.

Inside the agent container, `docker` and `docker compose` commands work normally via the remote DinD daemon.

## Important: Do not wait for CI

After creating a PR, do NOT sleep, poll, or wait for CI status checks. Exit promptly. The PR watch loop in the entrypoint handles CI failures automatically — it will re-invoke you with the failure logs if anything breaks.

Similarly, do not poll for PR reviews or approval. Just create the PR, enable auto-merge, and exit.

## Git authentication inside the container

The container does **not** have SSH keys. All git push operations use the GitHub App token:

```bash
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
BRANCH=$(git branch --show-current)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
```

This is the same flow as the `cicd-workflow` skill. The token expires after 1 hour — regenerate before each push.

## Combining with cicd-workflow

The container is the intended runtime for the `cicd-workflow` skill. A typical autonomous task:

```bash
./dev/agents/scripts/run.sh "Pick up Linear issue KIO-15. Use /cicd-workflow to implement, open a PR, and watch CI."
```

The agent will branch, implement, push via app token, create a PR, and enter the watch loop — all inside the container.

## Database seeding

The container auto-seeds databases on startup. **Never add test data or mock devices in application code** — use the existing seed infrastructure.

### Postgres (web-server)

On container start, the entrypoint automatically:
1. Pushes the schema via `pnpm --filter @kioskkit/web-server db:push`
2. Seeds a test admin user via `pnpm --filter @kioskkit/web-server db:seed-test-user`:
   - Email: `test@kioskkit.local`, role: `admin`
   - Session token exported as `TEST_SESSION_TOKEN` env var (valid 1 year)
3. Seeds test data via `pnpm --filter @kioskkit/web-server db:seed-test-data`:
   - **Customer user**: `customer@kioskkit.local`, role: `customer`, ID: `test-customer-user-id`
   - **3 devices** (owned by admin user):
     - `Lobby Kiosk` (ID: `a0000000-0000-4000-8000-000000000001`, pairing: `PAIR-001`, last seen 2026-03-28)
     - `Cafe Kiosk` (ID: `a0000000-0000-4000-8000-000000000002`, pairing: `PAIR-002`, last seen 2026-03-29)
     - `Warehouse Kiosk` (ID: `a0000000-0000-4000-8000-000000000003`, pairing: `PAIR-003`, never seen)
   - **4 backups**: 2 for Lobby Kiosk, 2 for Cafe Kiosk (50 MB each, spread over several days)
   - **3 releases**: v1.0.0 (published), v1.1.0 (published), v1.2.0-rc.1 (draft)

To reset Postgres to a clean state (drop all tables, re-push schema, re-seed):

```bash
./dev/agents/scripts/db-reset.sh
```

To add new Postgres seed data, edit `packages/web-server/src/seed-test-data.ts` (or `seed-test-user.ts` for auth-related seeds).

### SQLite (kiosk-server)

On container start, the entrypoint automatically seeds the kiosk-server SQLite database via `pnpm --filter @kioskkit/kiosk-server seed`. The seed is idempotent (skips if data exists). Seeded data:
- 5 buyers (labels 101–103, 201–202)
- 3 catalog categories (Drinks, Snacks, Pastries) with 9 items
- Default kiosk settings (locale, currency, etc.)
- 18 transaction records spread across all 5 buyers and 7 days, with varying items and quantities (1–3 per record). Record IDs are prefixed `seed-record-`.

To drop and re-seed the kiosk-server SQLite database:

```bash
pnpm --filter @kioskkit/kiosk-server db:reseed
```

To add new SQLite seed data, edit `packages/kiosk-server/src/seed.ts`.

### Rules for agents

- **NEVER** hardcode test data, mock devices, or fake users in application code
- Use `TEST_SESSION_TOKEN` for authenticated requests in tests
- If you need additional seed data, add it to the appropriate seed script
- Use `db-reset.sh` or `db:reseed` when you need a clean database state

## Key files

- `dev/agents/container/Dockerfile` — container image definition
- `dev/agents/container/docker-compose.yml` — compose services (agent + postgres)
- `dev/agents/container/entrypoint.sh` — container startup logic
- `dev/agents/container/wrappers/` — git/gh wrappers enforcing naming conventions
- `dev/agents/scripts/run.sh` — host-side launcher
- `dev/agents/scripts/github-app-token.sh` — GitHub App token generator
- `dev/agents/scripts/screenshot.mjs` — Playwright screenshot tool
- `dev/agents/scripts/db-reset.sh` — Postgres database reset (drop, re-push, re-seed)
- `.mcp.json` — MCP server configuration (loaded by Claude Code)
