---
name: mizan-generative-ui
description: Use when working on Mizan's generative UI chat surface, LLM grid planner, UI block registry, Storybook block catalog, animations, or agent prompts for dynamic page rendering.
---

# Mizan Generative UI

Use this skill before changing the home-page agent UI, Convex UI planner, generated block components, or Storybook examples.

## Architecture Rules

- Keep the app headless: the LLM emits a typed json-render spec, React renders deterministic components.
- Use Mizan's custom harness boundary built from the `ai` npm package plus `@json-render/*`. Do not use hosted Vercel services, `@ai-sdk/sandbox-vercel`, or AI SDK `HarnessAgent` for the product chat.
- Never let the model produce arbitrary JSX, CSS, SQL, or URLs outside the allowed schema/catalog.
- Preserve the current board on follow-ups by sending the current json-render spec and recent chat to the harness route on every turn. Reset only for explicit reset, fresh page, or start-over language.
- Keep generated text short. The answer should come from charts, cards, controls, and sourced data blocks.
- Visible progress is not chain-of-thought. Use short labels such as "Reading budget totals" or "Adding debt chart".
- Investment prompts must become scenario/risk/indicator UI. Do not render recommendation or "where to invest" advice cards.

## UI Rules

- The chat rail is conversation history, not a list of report cards.
- New blocks should make the page grow naturally; scroll once to the relevant new/focused block after rendering finishes.
- Animate only `transform` and `opacity` for DOM transitions. For progress bars, animate `transform: scaleX(...)`, not `width`.
- Use canvas only as a lightweight render layer for ambient progress or visual continuity. Stop animation when rendering is done.
- Honor `prefers-reduced-motion`.
- Keep components informative: charts, metrics, comparisons, sources, and next actions before prose.

## Validation

Run the smallest relevant checks after changes:

```bash
cd app
npm run type-check
npm run lint
npx convex dev --once
```

When harness behavior changes, test a follow-up prompt with a non-empty `currentSpec` and verify the returned spec preserves useful existing context.
