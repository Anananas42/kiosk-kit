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
