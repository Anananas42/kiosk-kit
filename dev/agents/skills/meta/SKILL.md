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
