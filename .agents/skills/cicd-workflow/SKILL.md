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

## Workflow

1. **Linear task first** — create or refine a Linear issue before writing code. Clarify scope upfront.
2. **Branch from Linear** — use the Linear-generated branch name (e.g. `pazderkaadam/kio-5-devices-schema-crud-api`) so the branch auto-links to the issue.
3. **Conventional commits** on the feature branch.
4. **Push & open a PR** using the GitHub App token (see below). Use the `/fill-pr-template` skill to generate the description from `.github/pull_request_template.md`.

## GitHub App authentication

`main` is a protected branch — agents must not push directly. PRs must be created via the `kiosk-kit-agent` GitHub App so they are owned by `kiosk-kit-agent[bot]`, allowing the repo owner to approve them.

Generate a short-lived installation token (expires in 1 hour):

```bash
GH_TOKEN=$(./scripts/github-app-token.sh)
```

Use it for **both** pushing the branch and creating the PR. Never modify the `origin` remote — push directly to the HTTPS URL instead:

```bash
BRANCH=$(git branch --show-current)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
GH_TOKEN="${GH_TOKEN}" gh pr create --title "..." --body "..."
```

**Token refresh**: the app token expires after 1 hour. Before any `gh` or `git push` command in the watch loop, regenerate it:

```bash
GH_TOKEN=$(./scripts/github-app-token.sh)
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
GH_TOKEN=$(./scripts/github-app-token.sh)
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
GH_TOKEN=$(./scripts/github-app-token.sh)
git push "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" "HEAD:refs/heads/${BRANCH}"
```

This counts as 1 fix attempt.

### 3. Check reviews

If `reviewDecision` is `CHANGES_REQUESTED`:

```bash
GH_TOKEN="${GH_TOKEN}" gh api repos/Anananas42/kiosk-kit/pulls/<number>/comments
```

- **Actionable feedback** — fix the issue, push, and reply to each addressed comment with a summary of what was changed.
- **Unclear feedback** — reply to the PR comment asking for clarification, then continue polling.

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
