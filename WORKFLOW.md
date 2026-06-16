---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "9ceb74fa6824"
  active_states:
    - Todo
    - In Progress
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 30000
workspace:
  root: ~/code/mizan-symphony-workspaces
hooks:
  timeout_ms: 600000
  after_create: |
    git clone --depth 1 "${SOURCE_REPO_URL:-git@github.com:Ba3lisa/mizan.git}" .
    git config rerere.enabled true
    git config rerere.autoupdate true
    if command -v npm >/dev/null 2>&1; then
      npm --prefix app ci --legacy-peer-deps || npm --prefix app install --legacy-peer-deps
    fi
agent:
  max_concurrent_agents: 1
  max_turns: 12
codex:
  command: "${CODEX_BIN:-codex} --config shell_environment_policy.inherit=all --model ${CODEX_MODEL:-gpt-5.3-codex} app-server"
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
# Mizan Symphony Workflow

You are working on Linear issue `{{ issue.identifier }}` for Mizan.

{% if attempt %}
Continuation context:
- This is retry or continuation attempt #{{ attempt }}.
- Resume from the current workspace state. Do not restart investigation or validation unless the current code state requires it.
- Do not stop while the issue is still in an active state unless a real blocker prevents progress.
{% endif %}

Issue context:
- Identifier: `{{ issue.identifier }}`
- Title: `{{ issue.title }}`
- Current status: `{{ issue.state }}`
- Labels: `{{ issue.labels }}`
- URL: `{{ issue.url }}`

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## Operating Rules

1. Work only inside this Symphony-created repository copy.
2. Read `AGENTS.md` and `CLAUDE.md` before editing. When working inside `app/`, also read `app/AGENTS.md`; before Convex edits, read `convex_rules.txt` and `app/convex/_generated/ai/guidelines.md`.
3. Preserve Mizan's code rules: TypeScript only, no `any`, no `@ts-ignore`, no `@ts-nocheck`, no blanket lint disables, and no hardcoded source-backed data.
4. Never run production deploys, schema migrations, destructive commands, database resets, or environment-switching commands.
5. Treat the Linear issue as the work control plane. Keep one `## Codex Workpad` comment updated in place; do not post separate progress comments.
6. Operate autonomously until the work is ready for human review or blocked by missing credentials, permissions, or external requirements.
7. If the work touches UI, keep changes scoped and include concrete validation evidence. If the work touches data or Convex, keep source/citation and validator rules intact.

## Related Skills

- `linear`: query and update Linear through Symphony's injected `linear_graphql` tool.
- `pull`: sync the branch with latest `origin/main`.
- `commit`: create clean commits with rationale and validation notes.
- `push`: publish the branch and create or update the GitHub PR.

## Status Map

- `Todo`: move to `In Progress`, create or refresh the workpad, then begin work.
- `In Progress`: continue implementation from the current workpad.
- `Rework`: read all review feedback, update the workpad, implement required changes, and revalidate.
- `Human Review`: handoff state. Symphony should not dispatch this state; if encountered, do not code.
- `Done`, `Closed`, `Cancelled`, `Canceled`, `Duplicate`: terminal states; do nothing.

## Required Flow

1. Fetch the Linear issue by identifier, including state, team states, comments, links, attachments, and project.
2. If the issue is `Todo`, move it to `In Progress` before making code changes.
3. Find or create exactly one active comment starting with `## Codex Workpad`.
4. Update the workpad with:
   - Environment stamp: host, workspace path, current branch, and `HEAD`.
   - Plan checklist.
   - Acceptance criteria copied or derived from the issue.
   - Validation checklist, including any issue-provided validation requirements.
   - Notes for reproduction, implementation decisions, and blockers.
5. Create a feature branch from `origin/main`. Prefer Linear's branch name if present; otherwise use `symphony/{{ issue.identifier }}` with a short slug.
6. Reproduce or inspect the current behavior before editing, and record the signal in the workpad.
7. Run the `pull` skill before code edits when the branch already exists remotely or the workspace may be stale.
8. Implement the smallest coherent change that satisfies the issue.
9. Run the smallest relevant validation:
   - Docs/config only: sanity-check links, commands, and file references.
   - App code: `cd app && npm run type-check`; add `npm run lint` when the change is broad or lint-sensitive.
   - Convex code: after local TypeScript checks, run `cd app && npx convex dev --once`.
   - UI behavior: use a local run or browser validation when the change cannot be proven by static checks alone.
10. Update the workpad immediately after meaningful milestones and after every validation attempt.
11. Commit with the `commit` skill.
12. Push and create or update a PR with the `push` skill. Fill `.github/pull_request_template.md` completely.
13. Attach the PR to the Linear issue using the `linear` skill.
14. Before handoff, verify the workpad exactly reflects completed scope, validation, PR URL, and remaining risks.
15. Move the issue to `Human Review` only when the completion bar below is met.

## Completion Bar Before Human Review

- Acceptance criteria are satisfied or explicitly marked blocked.
- Required validation has passed, or a blocker explains why it cannot run.
- The branch is pushed.
- A GitHub PR exists and uses the repository PR template.
- The PR is attached to the Linear issue.
- The workpad contains final scope, validation evidence, and concise risks.
- No production deploy, merge, schema migration, destructive operation, or environment switch was performed.

## Blocker Handling

Use a blocker only after exhausting local fallbacks. Missing GitHub or Linear auth, missing Convex credentials, absent environment variables, unavailable external services, or a failing dependency install can be blockers when they prevent required validation or handoff.

When blocked:

1. Update the workpad with the missing requirement, why it blocks completion, and the exact unblock action.
2. Move the issue to `Human Review` if the issue can be handed off for human action.
3. Final response should contain completed actions and blockers only.
