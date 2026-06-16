# Mizan Agent Guide

Use this file as the Codex entry point for the repository. Keep it practical and defer detailed domain rules to the source docs it references.

## Repo Layout

- `app/` is the main product: Next.js 15, React 19, Convex backend, and most day-to-day code changes.
- `docs/` holds architecture, deployment, and process documentation.
- `infra/` holds infrastructure code and deployment support files.
- `scripts/dev/` contains the project CLI.

When working inside `app/`, also load the nested [`app/AGENTS.md`](app/AGENTS.md). It adds Convex-specific guidance for that subtree.

## First Reads

Before changing application or Convex code, read:

1. [`CLAUDE.md`](CLAUDE.md) for project rules, approvals, data philosophy, and release constraints.
2. [`convex_rules.txt`](convex_rules.txt) for Convex-specific implementation rules.
3. [`app/convex/_generated/ai/guidelines.md`](app/convex/_generated/ai/guidelines.md) before editing Convex functions.

## Working Norms

- Preserve the existing Claude workflow; do not remove or rewrite Claude-specific files unless explicitly asked.
- Prefer small, reviewable changes over broad rewrites.
- Follow existing TypeScript and Next.js patterns. Do not introduce JavaScript files for product code.
- Do not use `any`, `@ts-ignore`, `@ts-nocheck`, or blanket lint disables.
- Keep data-backed UI truthful: numbers that should come from Convex or a cited source must not be hardcoded.
- Ask before destructive operations, schema migrations, production deploys, or environment-switching commands.

## Generative UI Runtime

- For Mizan's home generative interface, use the repo skill at `.agents/skills/mizan-generative-ui` when touching the planner, renderer, chat flow, or Storybook blocks.
- Treat the LLM as a planner, not a JSX author. The model emits typed grid notation and deterministic React/shadcn components render it.
- Preserve page state across chat turns. Follow-ups should append, update, or focus existing UI unless the user explicitly asks to reset or start a new page.
- Keep visible model progress as short status labels. Do not expose hidden chain-of-thought.
- Animate with `transform` and `opacity` first. Avoid per-block scroll loops, width/height animation, or layout-thrashing effects.

## Subagents

This repo supports project-scoped Codex subagents through `.codex/agents/`.

- `code_mapper` traces code paths and identifies likely edit surfaces.
- `convex_guard` checks Convex-specific correctness and data integrity risks.
- `docs_researcher` verifies APIs and framework behavior before coding.
- `implementer` handles bounded code changes after the scope is clear.

Use subagents deliberately:

- Prefer them for parallel discovery, independent review dimensions, and bounded write scopes.
- Do not fan out tiny edits or obviously local one-step tasks.
- Keep recursion shallow. This repo is configured for direct-child delegation only.

For explicit orchestration, prefer the repo skill at `.agents/skills/work`. Invoke it with `$work`.

## Running The Project

Primary app workflow:

```bash
cd app
npm install --legacy-peer-deps
npx convex dev
npm run dev
```

Useful checks:

```bash
cd app
npm run lint
npm run type-check
npx convex dev --once
```

## Done Criteria

Before closing a task, do the smallest relevant verification and report what you ran.

- For docs-only changes, sanity-check links and file references.
- For app code, run relevant lint or type-check commands in `app/`.
- For Convex changes, run `npx convex dev --once` after the code compiles locally.

## Guidance Strategy

- Keep this file short. Put project-wide expectations here.
- Put subtree-specific rules in nested `AGENTS.md` files near the code.
- Use `CLAUDE.md` as supporting project context, not as the only source of agent instructions.
