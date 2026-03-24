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
./.agents/scripts/run.sh

# Non-interactive with a task description
./.agents/scripts/run.sh "Implement feature X per Linear issue KIO-15"

# Skip the PR watch loop (for testing)
./.agents/scripts/run.sh --no-loop "List your MCP servers"

# Rebuild the image first (after Dockerfile changes or to update Claude Code)
./.agents/scripts/run.sh --build
```

## What the container provides

| Component | Detail |
|-----------|--------|
| Node.js | v24 (matches CI) |
| pnpm | 10.32.1 (from corepack) |
| Claude Code | Pre-installed, runs with `--dangerously-skip-permissions` |
| Git identity | `kiosk-kit-agent[bot]`, no GPG signing, HTTPS remote |
| GitHub CLI | `gh`, authenticated via app token from `.agents/scripts/github-app-token.sh` |
| gh-attach | `gh attach` extension for uploading screenshots to PR comments |
| Playwright | Chromium pre-installed for screenshot verification |
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
2. Entrypoint (`.agents/container/entrypoint.sh`) copies it to `/workspace` via rsync
3. Git is configured with bot identity and HTTPS origin (no SSH, no GPG)
4. GitHub App PEM and Claude credentials are copied from `/mnt/secrets/`
5. `pnpm install --frozen-lockfile` runs (cached across runs via named volumes)
6. Postgres health check passes, then `db:push` applies the schema
7. A `CLAUDE.md` is generated at `/workspace/CLAUDE.md` by concatenating all `.agents/skills/*/SKILL.md` files — every agent conversation starts with all skills as context
8. Claude starts with the provided task or in interactive mode
9. After claude finishes a non-interactive task, the **PR watch loop** takes over (unless `--no-loop`)

## PR watch loop

When a task is provided via `AGENT_TASK`, the container does not exit after claude finishes. Instead, the entrypoint enters a polling loop:

1. Polls the PR for the current branch every 30 seconds
2. Checks CI status and review comments
3. If CI is failing or reviews need attention → re-invokes claude with full context (logs, comments)
4. If PR is merged or closed → container exits cleanly
5. After 5 consecutive failed fix attempts → posts a comment asking for human help and exits

Use `--no-loop` to skip the watch loop (useful for testing). Interactive sessions also skip it.

## Important: Do not wait for CI

After creating a PR, do NOT sleep, poll, or wait for CI status checks. Exit promptly. The PR watch loop in the entrypoint handles CI failures automatically — it will re-invoke you with the failure logs if anything breaks.

Similarly, do not poll for PR reviews or approval. Just create the PR, enable auto-merge, and exit.

## Git authentication inside the container

The container does **not** have SSH keys. All git push operations use the GitHub App token:

```bash
GH_TOKEN=$(./.agents/scripts/github-app-token.sh)
BRANCH=$(git branch --show-current)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
```

This is the same flow as the `cicd-workflow` skill. The token expires after 1 hour — regenerate before each push.

## Combining with cicd-workflow

The container is the intended runtime for the `cicd-workflow` skill. A typical autonomous task:

```bash
./.agents/scripts/run.sh "Pick up Linear issue KIO-15. Use /cicd-workflow to implement, open a PR, and watch CI."
```

The agent will branch, implement, push via app token, create a PR, and enter the watch loop — all inside the container.

## Key files

- `.agents/container/Dockerfile` — container image definition
- `.agents/container/docker-compose.yml` — compose services (agent + postgres)
- `.agents/container/entrypoint.sh` — container startup logic
- `.agents/container/wrappers/` — git/gh wrappers enforcing naming conventions
- `.agents/scripts/run.sh` — host-side launcher
- `.agents/scripts/github-app-token.sh` — GitHub App token generator
- `.agents/scripts/screenshot.mjs` — Playwright screenshot tool
- `.mcp.json` — MCP server configuration (loaded by Claude Code)
