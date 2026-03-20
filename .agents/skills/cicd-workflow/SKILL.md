---
name: cicd-workflow
description: End-to-end workflow for implementation tasks — Linear, branching, PRs, CI, deployment
---

## Workflow

1. **Linear task first** — create or refine a Linear issue before writing code. Clarify scope upfront.
2. **Branch from Linear** — use the Linear-generated branch name (e.g. `pazderkaadam/kio-5-devices-schema-crud-api`) so the branch auto-links to the issue.
3. **Conventional commits** on the feature branch.
4. **Push & open a PR** using the GitHub App token (see below). Use the `/fill-pr-template` skill to generate the description from `.github/pull_request_template.md`.
5. **Post-merge** — manually mark the Linear issue as Done. Linear does not auto-close from GitHub merges in this project.

## GitHub App authentication

`main` is a protected branch — agents must not push directly. PRs must be created via the `kiosk-kit-agent` GitHub App so they are owned by `kiosk-kit-agent[bot]`, allowing the repo owner to approve them.

Generate a short-lived installation token (expires in 1 hour):

```bash
GH_TOKEN=$(./scripts/github-app-token.sh)
```

Use it for **both** pushing the branch and creating the PR:

```bash
git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git"
git push -u origin HEAD
GH_TOKEN="${GH_TOKEN}" gh pr create --title "..." --body "..."
```

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
