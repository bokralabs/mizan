---
name: push
description: Push the current branch to origin and create or update a GitHub PR for Mizan.
---

# Push

Use this skill when the implementation is committed and ready for PR handoff.

## Prerequisites

- `gh` CLI is installed and `gh auth status` succeeds.
- The current branch is not `main`.
- The branch contains only intended commits for the Linear issue.

## Validation Gate

Run the smallest relevant validation before pushing:

- Docs/config only: sanity-check links, commands, and file references.
- App code: `cd app && npm run type-check`; add `npm run lint` when broad or lint-sensitive.
- Convex code: after local TypeScript checks, run `cd app && npx convex dev --once`.
- UI behavior: use a local run or browser validation when static checks are insufficient.

Document the validation result in the Linear workpad.

## Workflow

1. Inspect `git status` and current branch.
2. Push with upstream tracking: `git push -u origin HEAD`.
3. If push is rejected because the branch is stale, use the `pull` skill, rerun validation, then push again.
4. Use `--force-with-lease` only if local history was intentionally rewritten.
5. Create a PR if none exists; update the PR if it already exists.
6. Fill `.github/pull_request_template.md` completely:
   - Replace placeholder comments.
   - Check the correct type and checklist boxes.
   - Mark `Codex agent` under creation source.
   - Include concrete validation results.
7. Return the PR URL.

## Guardrails

- Do not merge the PR.
- Do not run production deploys.
- Do not change remotes to work around auth or permission failures.
- Surface GitHub auth or permission errors exactly in the workpad.
