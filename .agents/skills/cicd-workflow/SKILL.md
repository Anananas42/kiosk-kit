---
name: cicd-workflow
description: End-to-end workflow for implementation tasks — Linear, branching, PRs, CI, deployment
---

## Workflow

1. **Linear task first** — create or refine a Linear issue before writing code. Clarify scope upfront.
2. **Branch from Linear** — use the Linear-generated branch name (e.g. `pazderkaadam/kio-5-devices-schema-crud-api`) so the branch auto-links to the issue.
3. **Conventional commits** on the feature branch.
4. **Open a PR** targeting `main` — use the `/fill-pr-template` skill to generate the description from `.github/pull_request_template.md`.
5. **Post-merge** — manually mark the Linear issue as Done. Linear does not auto-close from GitHub merges in this project.

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
