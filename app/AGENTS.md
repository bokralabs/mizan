<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Mizan Generative UI

- The home page uses a Convex/OpenAI planner plus deterministic React rendering. Keep the schema as the contract between model and UI.
- Do not add free-form JSX generation. Add new block kinds through typed schema, deterministic renderer, and Storybook coverage.
- On follow-up chat turns, preserve current UI context and prefer append/update/focus operations.
- Motion should be subtle and performant: transform/opacity for DOM, lightweight canvas only for ambient render feedback, and no repeated scroll-on-every-block effects.
- Use `.agents/skills/mizan-generative-ui` for detailed workflow guidance.
