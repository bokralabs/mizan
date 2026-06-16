---
name: commit
description: Create a clean git commit from the current intended changes with rationale and validation notes.
---

# Commit

Use this skill when finalizing a coherent unit of work.

## Steps

1. Inspect `git status`, `git diff`, and `git diff --staged`.
2. Confirm the diff only contains files for the current Linear issue.
3. Do not stage build artifacts, logs, caches, generated temp output, or unrelated user changes.
4. Stage the intended files.
5. Write a conventional commit subject in imperative mood, 72 characters or fewer.
6. Include a body with:
   - Summary of the change.
   - Rationale or tradeoffs.
   - Validation run, or why validation could not run.
7. Add `Co-authored-by: Codex <codex@openai.com>` unless instructed otherwise.
8. Commit with `git commit -F <message-file>` so formatting is preserved.

## Guardrails

- Never commit secrets or local environment files.
- Never commit unrelated dirty work from the starting workspace.
- If the staged diff and message do not match, fix the index or revise the message before committing.
