<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Mizan Generative UI

- The home page uses the Mizan-owned AI SDK harness route plus `@json-render/react`. The model emits a typed json-render spec; deterministic React components render it.
- Do not add free-form JSX generation, arbitrary CSS generation, or sandboxed coding agents for the product chat. Add new UI surface through the typed json-render catalog, schema, deterministic renderer, and Storybook coverage.
- On follow-up chat turns, send the current json-render spec and preserve useful context unless the user explicitly resets.
- Motion should be subtle and performant: transform/opacity for DOM, lightweight canvas only for ambient render feedback, and no repeated scroll-on-every-block effects.
- Use `.agents/skills/mizan-generative-ui` for detailed workflow guidance.
