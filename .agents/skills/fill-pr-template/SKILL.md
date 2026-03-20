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

If the branch contains a `screenshots/` directory:
1. List all `.png` files in it.
2. Build the **Screenshots** section with Markdown image links using raw GitHub URLs:
   ```
   ![description](https://raw.githubusercontent.com/Anananas42/kiosk-kit/<branch>/screenshots/<path>/<file>.png)
   ```
3. If no screenshots exist and the diff touches frontend packages (`packages/web-client`, `packages/landing`, `packages/kiosk-client`), add `TODO: take screenshots with \`pnpm screenshot\`` under the Screenshots heading.

## Output rules

- Be brief and to the point.
- Prefer short sentences and bullets.
- No long introductions or explanations outside the final template.
