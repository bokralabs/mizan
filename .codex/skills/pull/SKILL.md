---
name: pull
description: Sync the current branch with latest origin/main using a merge-based update and careful conflict resolution.
---

# Pull

Use this skill before handoff, when the branch may be stale, or after a push is rejected because the remote moved.

## Workflow

1. Inspect `git status`. Commit or explicitly preserve current work before merging.
2. Enable rerere locally:
   - `git config rerere.enabled true`
   - `git config rerere.autoupdate true`
3. Confirm `origin` exists and the current branch is the intended feature branch.
4. Fetch latest refs with `git fetch origin`.
5. If the feature branch exists remotely, pull it first with `git pull --ff-only origin $(git branch --show-current)`.
6. Merge latest main with `git -c merge.conflictstyle=zdiff3 merge origin/main`.
7. Resolve conflicts by understanding both sides before editing.
8. Check for conflict markers with `git diff --check`.
9. Run validation relevant to the changed files.
10. Record the merge result and resulting `HEAD` in the Linear workpad.

## Conflict Rules

- Prefer minimal, intention-preserving resolutions.
- For generated files, resolve source files first and regenerate when the repo has a documented generator.
- Ask for human input only when the conflict depends on product intent or a risky irreversible choice.
