---
name: agent-container
description: Launch and manage isolated agent containers for autonomous development tasks
---

## What this is

A Docker-based isolated environment for running Claude Code agents. Each container gets its own repo copy, postgres instance, and git identity — completely separate from the host's local development environment.

## Prerequisites

- Claude Code subscription (credentials at `~/.claude/.credentials.json`)
- GitHub App PEM file at `~/.config/github-apps/kiosk-kit-agent.pem`
- Docker running

## Launching an agent

```bash
# Interactive claude session in a container
./scripts/agent-run.sh

# Non-interactive with a task description
./scripts/agent-run.sh "Implement feature X per Linear issue KIO-15"

# Rebuild the image first (after Dockerfile.agent changes or to update Claude Code)
./scripts/agent-run.sh --build
```

## What the container provides

| Component | Detail |
|-----------|--------|
| Node.js | v24 (matches CI) |
| pnpm | 10.32.1 (from corepack) |
| Claude Code | Pre-installed, runs with `--dangerously-skip-permissions` |
| Git identity | `kiosk-kit-agent[bot]`, no GPG signing, HTTPS remote |
| GitHub CLI | `gh`, authenticated via app token from `scripts/github-app-token.sh` |
| Postgres | Isolated sidecar (port 5432 internal), schema auto-pushed on start |
| Repo | Full copy from host bind mount (read-only source), writable workspace |

## How it works

1. Host repo is bind-mounted read-only at `/mnt/repo`
2. Entrypoint (`scripts/agent-entrypoint.sh`) copies it to `/workspace`
3. Git is configured with bot identity and HTTPS origin (no SSH, no GPG)
4. GitHub App PEM is copied from `/mnt/secrets/` to `~/.config/github-apps/`
5. `pnpm install --frozen-lockfile` runs
6. Postgres health check passes, then `db:push` applies the schema
7. A `CLAUDE.md` is generated at `/workspace/CLAUDE.md` by concatenating all `.agents/skills/*/SKILL.md` files — every agent conversation starts with all skills as context
8. Claude starts with the provided task or in interactive mode
9. After claude finishes a non-interactive task, the **PR watch loop** takes over (see below)

## PR watch loop

When a task is provided via `AGENT_TASK`, the container does not exit after claude finishes. Instead, the entrypoint enters a polling loop:

1. Polls the PR for the current branch every 20 seconds
2. Checks CI status and review comments
3. If CI is failing or reviews need attention → re-invokes claude with full context (logs, comments)
4. If PR is merged or closed → container exits cleanly
5. After 5 consecutive failed fix attempts → posts a comment asking for human help and exits

Interactive sessions (`./scripts/agent-run.sh` with no task) skip the watch loop.

## Git authentication inside the container

The container does **not** have SSH keys. All git push operations use the GitHub App token:

```bash
GH_TOKEN=$(./scripts/github-app-token.sh)
BRANCH=$(git branch --show-current)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
```

This is the same flow as the `cicd-workflow` skill. The token expires after 1 hour — regenerate before each push.

## Combining with cicd-workflow

The container is the intended runtime for the `cicd-workflow` skill. A typical autonomous task:

```bash
./scripts/agent-run.sh "Pick up Linear issue KIO-15. Use /cicd-workflow to implement, open a PR, and watch CI."
```

The agent will branch, implement, push via app token, create a PR, and enter the watch loop — all inside the container.

## Customization

Create `docker-compose.agent.override.yml` (gitignored) for local tweaks like extra env vars or volume mounts.

## Key files

- `Dockerfile.agent` — container image definition
- `docker-compose.agent.yml` — compose services (agent + postgres)
- `scripts/agent-entrypoint.sh` — container startup logic
- `scripts/agent-run.sh` — host-side launcher
