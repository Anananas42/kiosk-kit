# Agent Skills

You are running inside an isolated agent container. The following skills are available.
Read and follow them carefully.

---

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

## Testing agent

After CI passes on a PR, the watch loop automatically runs a **testing agent** — a separate `claude` invocation that:

1. Reads `.claude/commands/testing.md` and the PR description (manual test steps)
2. Starts the relevant dev servers based on changed files
3. Drives a browser via Playwright MCP to execute each test step
4. Posts structured pass/fail results as a PR comment
5. Optionally requests changes if critical failures are found (>50% steps fail)

Key properties:
- **Runs exactly once per PR** — tracked via a marker file at `/tmp/.testing-done-<PR_NUMBER>`. Once touched, the testing agent is not re-invoked even if the loop continues polling.
- **Does NOT modify code or push changes** — it is read-only. Any failures it finds must be addressed by the main agent in a subsequent fix cycle.
- **Crash-safe** — the testing agent invocation uses `|| true`, so a crash does not kill the watch loop. The marker file is touched unconditionally after invocation.

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

To reset Postgres to a clean state (drop all tables, re-push schema, re-seed):

```bash
./dev/agents/scripts/db-reset.sh
```

To add new Postgres seed data, edit `packages/web-server/src/seed-test-user.ts`.

### SQLite (kiosk-server)

kiosk-server uses SQLite and seeds on first run via `packages/kiosk-server/src/seed.ts`:
- 5 buyers (labels 101–103, 201–202)
- 3 catalog categories (Drinks, Snacks, Pastries) with items
- Default kiosk settings (locale, currency, etc.)

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

---

---
name: cicd-workflow
description: End-to-end workflow for implementation tasks — Linear, branching, PRs, CI, deployment, and post-PR watch loop
---

## Resume check

Before starting new work, check if the current branch already has an open PR:

```bash
gh pr view --json state,reviewDecision,url 2>/dev/null
```

If an open PR exists:
- Run `gh pr checks` to see CI status.
- If CI is passing and there are no unaddressed review comments, skip to the **PR watch loop** — the PR is waiting for approval.
- If CI is failing or there are review comments, skip to the **PR watch loop** to handle them.

If no PR exists, proceed with the full workflow below.

## Code quality principle

Establish the correct patterns, conventions, and architecture from the very first PR. Once a codebase starts drifting toward ad-hoc solutions, the cost of correction compounds — each shortcut becomes the template for the next. Treat every task as if it's setting the precedent: choose the lowest-maintenance, most consistent approach even if it takes slightly longer up front. If you're unsure whether a pattern is right, ask — don't ship something "for now" that becomes permanent by inertia.

## Workflow

1. **Linear task first** — every PR must have a linked Linear issue. Create or refine one before writing code. If code was already written without a task (e.g. sporadic changes), create a Linear issue retroactively before opening the PR — summarize what was done and why. **Update the issue status to "In Progress"** immediately when you start working on it, using the Linear MCP.
2. **Pull latest main** — always `git checkout main && git pull` before creating a new branch, so you branch from the latest state.
3. **Branch naming** — use the format `kio-<id>/<description>` (e.g. `kio-5/devices-schema-crud-api`). The Linear task ID prefix auto-links to the issue.
4. **Conventional commits** on the feature branch. Include the Linear task ID in parentheses, e.g. `feat(KIO-5): add devices schema`.
5. **Push & open a PR** using the GitHub App token (see below). Use the `/fill-pr-template` skill to generate the description from `.github/pull_request_template.md`.

## Frontend screenshot verification

If your changes touch frontend code (files in `packages/web-client`, `packages/landing`, or `packages/kiosk-client`), take screenshots before opening the PR.

### 1. Take screenshots

Use the screenshot script to capture the affected pages:

```bash
pnpm screenshot @kioskkit/web-client
```

The script starts the dev server automatically, takes a viewport screenshot, and saves it to `.screenshots/`. Use `--full` for full-page captures. To screenshot a specific route, start the dev server first, then pass the URL:

```bash
pnpm screenshot http://localhost:5173/devices/123
```

Take screenshots of every page/view you changed.

### 2. Verify your work

Read the screenshot files to visually confirm the output matches what you intended. If something looks wrong, fix the code and re-screenshot before proceeding.

### 3. Add screenshots to the PR

Do **not** commit screenshots to the repo. Instead, upload them to the PR using `gh-attach`, which uploads images to GitHub and returns embeddable markdown URLs:

```bash
# Upload screenshots to PR and get embeddable URLs
for img in .screenshots/*.png; do
  GH_TOKEN="${GH_TOKEN}" gh attach <pr-number> "$img"
done
```

The `gh attach` command uploads each image and outputs a markdown image reference that renders in the PR.

The `/fill-pr-template` skill should leave a `TODO` placeholder for screenshots when frontend code was changed.

**Fallback**: If `gh-attach` fails (network issue, auth problem), do NOT fail the PR workflow. Instead, describe the screenshots in text in the PR comment and note that screenshots could not be uploaded. Screenshot upload issues must never block PR creation.

## GitHub App authentication

`main` is a protected branch — agents must not push directly. PRs must be created via the `kiosk-kit-agent` GitHub App so they are owned by `kiosk-kit-agent[bot]`, allowing the repo owner to approve them.

Generate a short-lived installation token (expires in 1 hour):

```bash
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
```

Use it for **both** pushing the branch and creating the PR. Never modify the `origin` remote — push directly to the HTTPS URL instead:

```bash
BRANCH=$(git branch --show-current)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
GH_TOKEN="${GH_TOKEN}" gh pr create --title "..." --body "..."
```

**Token refresh**: the app token expires after 1 hour. Before any `gh` or `git push` command in the watch loop, regenerate it:

```bash
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
```

## Auto-merge

After creating the PR, enable auto-merge with squash so it merges automatically once approved and CI passes:

```bash
GH_TOKEN="${GH_TOKEN}" gh pr merge --auto --squash
```

## PR watch loop

After creating the PR (or resuming an existing one), poll every 2 minutes. Each iteration:

### 1. Refresh token and check PR state

```bash
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
PR_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json state,reviewDecision,mergeStateStatus)
```

- **Merged or closed** — update the Linear issue status to Done, then exit.
- Otherwise continue to CI and review checks.

### 2. Check CI

```bash
GH_TOKEN="${GH_TOKEN}" gh pr checks
```

- **All checks passing** — reset the attempt counter to 0. Continue to review check.
- **Checks failing** — read the failure logs, fix, and push:

```bash
GH_TOKEN="${GH_TOKEN}" gh run view <run-id> --log-failed
# ... fix the issue, commit ...
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
```

This counts as 1 fix attempt.

### 3. Check reviews and comments

Check both formal reviews and PR comments — reviewers may leave feedback in either place:

```bash
# Formal review comments (inline code comments)
GH_TOKEN="${GH_TOKEN}" gh api repos/Anananas42/kiosk-kit/pulls/<number>/comments
# General PR comments (conversation thread)
GH_TOKEN="${GH_TOKEN}" gh api repos/Anananas42/kiosk-kit/issues/<number>/comments
```

Act on feedback if `reviewDecision` is `CHANGES_REQUESTED` **or** if there are unaddressed comments:

- **Actionable feedback** — fix the issue, push, and reply to each addressed comment with a summary of what was changed.
- **Unclear feedback** — reply to the PR comment asking for clarification, then continue polling.
- **Questions or concerns** (not requesting code changes) — reply with an explanation, no code change needed.

Addressing review feedback counts as 1 fix attempt.

### 4. Attempt limit

Track consecutive failed fix attempts (CI failures or review rounds that don't resolve). **Max 5 attempts.** After 5, stop the loop and ask for human help.

A successful CI pass or an approving review resets the counter to 0.

### 5. Sleep

Wait 2 minutes, then go back to step 1.

## CI

Runs on push to `main` and on pull requests (`ci.yml`):

```
pnpm turbo lint typecheck test build
```

## Deployment

**Never run `flyctl deploy` directly.** All deploys go through the release workflow.

To deploy, create a GitHub release:

```
gh release create
```

The release workflow (`release.yml`) triggers on `published` releases and:

- Runs CI first
- Deploys `web-server` to Fly.io
- Deploys `landing` to GitHub Pages
- Appends deployment status to the release notes

## Post-merge

Manually mark the Linear issue as Done. Linear does not auto-close from GitHub merges in this project.

---

---
name: fill-pr-template
description: Fill PR description from .github template with concise, copy-pasteable output
---

## What I do

- Find and read `.github/pull_request_template.md` from the current repository.
- Produce a filled PR description that keeps the same section order and formatting.
- Keep wording concise and practical — direct, no fluff.
- Return a copy-pasteable Markdown block only.

## Workflow

1. Read `.github/pull_request_template.md`.
2. Inspect branch changes with a diff against `main` and use it as the primary source of truth.
3. Keep all headings/checklists from the template exactly as they are.
4. Fill placeholders with concrete details from the branch changes.
5. If some detail is unknown, use `TODO:` with a short note instead of guessing.
6. Output only the final Markdown in a fenced block.

## Screenshots

If the diff touches frontend packages (`packages/web-client`, `packages/landing`, `packages/kiosk-client`), add `TODO: take screenshots with \`pnpm screenshot\` and upload as PR comments` under the Screenshots heading. Screenshots are uploaded as PR comments after the PR is created — they are never committed to the repo.

## Output rules

- Be brief and to the point.
- Prefer short sentences and bullets.
- No long introductions or explanations outside the final template.

---

---
name: meta
description: Rules for maintaining SKILL.md files — keep them accurate as the codebase evolves
---

## What SKILL.md files are

Each `dev/agents/skills/<name>/SKILL.md` is a self-contained reference that gets injected into every agent conversation via the auto-generated `CLAUDE.md`. They are the primary way agents learn how to operate in this repo.

## When to update a SKILL.md

After completing work that changes how a skill operates, update the relevant SKILL.md in the same branch. Examples:

- You changed the git push flow → update `cicd-workflow/SKILL.md`
- You added a new compose service → update `agent-container/SKILL.md`
- You changed the PR template → update `fill-pr-template/SKILL.md`
- You added a new database workflow → update `neon-postgres/SKILL.md`

If your changes don't fit an existing skill, create a new one at `dev/agents/skills/<name>/SKILL.md`.

## What a SKILL.md should contain

- **Frontmatter**: `name` and `description` (used for indexing)
- **What it does**: one-paragraph summary
- **Concrete commands and workflows**: copy-pasteable shell snippets, not abstract descriptions
- **Key file paths**: so agents can find the relevant code
- **Gotchas**: anything non-obvious that would trip up an agent

## Rules

- Keep skills factual and current — an outdated skill is worse than no skill
- Don't duplicate information across skills; reference other skills by name instead
- Don't document things that are obvious from the code itself
- Prefer short, scannable content over long prose

---

---
name: neon-postgres
description: Guides and best practices for working with Neon Serverless Postgres. Covers getting started, local development with Neon, choosing a connection method, Neon features, authentication (@neondatabase/auth), PostgREST-style data API (@neondatabase/neon-js), Neon CLI, and Neon's Platform API/SDKs. Use for any Neon-related questions.
---

# Neon Serverless Postgres

Neon is a serverless Postgres platform that separates compute and storage to offer autoscaling, branching, instant restore, and scale-to-zero. It's fully compatible with Postgres and works with any language, framework, or ORM that supports Postgres.

## Neon Documentation

The Neon documentation is the source of truth for all Neon-related information. Always verify claims against the official docs before responding. Neon features and APIs evolve, so prefer fetching current docs over relying on training data.

### Fetching Docs as Markdown

Any Neon doc page can be fetched as markdown in two ways:

1. **Append `.md` to the URL** (simplest): https://neon.com/docs/introduction/branching.md
2. **Request `text/markdown`** on the standard URL: `curl -H "Accept: text/markdown" https://neon.com/docs/introduction/branching`

Both return the same markdown content. Use whichever method your tools support.

### Finding the Right Page

The docs index lists every available page with its URL and a short description:

```
https://neon.com/docs/llms.txt
```

Common doc URLs are organized in the topic links below. If you need a page not listed here, search the docs index: https://neon.com/docs/llms.txt — don't guess URLs.

## What Is Neon

Use this for architecture explanations and terminology (organizations, projects, branches, endpoints) before giving implementation advice.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/what-is-neon.md

## Getting Started

Use this for first-time setup: org/project selection, connection strings, driver installation, optional auth, and initial schema setup.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/getting-started.md

## Connection Methods & Drivers

Use this when you need to pick the correct transport and driver based on runtime constraints (TCP, HTTP, WebSocket, edge, serverless, long-running).

Link: https://neon.com/docs/ai/skills/neon-postgres/references/connection-methods.md

### Serverless Driver

Use this for `@neondatabase/serverless` patterns, including HTTP queries, WebSocket transactions, and runtime-specific optimizations.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-serverless.md

### Neon JS SDK

Use this for combined Neon Auth + Data API workflows with PostgREST-style querying and typed client setup.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-js.md

## Developer Tools

Use this for local development enablement with `npx neonctl@latest init`, VSCode extension setup, and Neon MCP server configuration.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/devtools.md

### Neon CLI

Use this for terminal-first workflows, scripts, and CI/CD automation with `neonctl`.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-cli.md

## Neon Admin API

The Neon Admin API can be used to manage Neon resources programmatically. It is used behind the scenes by the Neon CLI and MCP server, but can also be used directly for more complex automation workflows or when embedding Neon in other applications.

### Neon REST API

Use this for direct HTTP automation, endpoint-level control, API key auth, rate-limit handling, and operation polling.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-rest-api.md

### Neon TypeScript SDK

Use this when implementing typed programmatic control of Neon resources in TypeScript via `@neondatabase/api-client`.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-typescript-sdk.md

### Neon Python SDK

Use this when implementing programmatic Neon management in Python with the `neon-api` package.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-python-sdk.md

## Neon Auth

Use this for managed user authentication setup, UI components, auth methods, and Neon Auth integration pitfalls in Next.js and React apps.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/neon-auth.md

Neon Auth is also embedded in the Neon JS SDK - so depending on your use case, you may want to use the Neon JS SDK instead of Neon Auth. See https://neon.com/docs/ai/skills/neon-postgres/references/connection-methods.md for more details.

## Branching

Use this when the user is planning isolated environments, schema migration testing, preview deployments, or branch lifecycle automation.

Key points:

- Branches are instant, copy-on-write clones (no full data copy).
- Each branch has its own compute endpoint.
- Use the neonctl CLI or MCP server to create, inspect, and compare branches.

Link: https://neon.com/docs/ai/skills/neon-postgres/references/branching.md

## Autoscaling

Use this when the user needs compute to scale automatically with workload and wants guidance on CU sizing and runtime behavior.

Link: https://neon.com/docs/introduction/autoscaling.md

## Scale to Zero

Use this when optimizing idle costs and discussing suspend/resume behavior, including cold-start trade-offs.

Key points:

- Idle computes suspend automatically (default 5 minutes, configurable) (unless disabled - launch & scale plan only)
- First query after suspend typically has a cold-start penalty (around hundreds of ms)
- Storage remains active while compute is suspended.

Link: https://neon.com/docs/introduction/scale-to-zero.md

## Instant Restore

Use this when the user needs point-in-time recovery or wants to restore data state without traditional backup restore workflows.

Key points:

- Restore windows depend on plan limits.
- Users can create branches from historical points-in-time.
- Time Travel queries can be used for historical inspection workflows.

Link: https://neon.com/docs/introduction/branch-restore.md

## Read Replicas

Use this for read-heavy workloads where the user needs dedicated read-only compute without duplicating storage.

Key points:

- Replicas are read-only compute endpoints sharing the same storage.
- Creation is fast and scaling is independent from primary compute.
- Typical use cases: analytics, reporting, and read-heavy APIs.

Link: https://neon.com/docs/introduction/read-replicas.md

## Connection Pooling

Use this when the user is in serverless or high-concurrency environments and needs safe, scalable Postgres connection management.

Key points:

- Neon pooling uses PgBouncer.
- Add `-pooler` to endpoint hostnames to use pooled connections.
- Pooling is especially important in serverless runtimes with bursty concurrency.

Link: https://neon.com/docs/connect/connection-pooling.md

## IP Allow Lists

Use this when the user needs to restrict database access by trusted networks, IPs, or CIDR ranges.

Link: https://neon.com/docs/introduction/ip-allow.md

## Logical Replication

Use this when integrating CDC pipelines, external Postgres sync, or replication-based data movement.

Key points:

- Neon supports native logical replication workflows.
- Useful for replicating to/from external Postgres systems.

Link: https://neon.com/docs/guides/logical-replication-guide.md

