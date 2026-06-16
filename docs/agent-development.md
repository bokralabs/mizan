# Agent-Driven Development

How Mizan uses AI agents across the entire development lifecycle -- from writing code to verifying data.

Architecture diagram: https://app.excalidraw.com/s/8B4UFPTVlkA/2QtqeIRt0rX

---

## How Code Gets Written

Code can be authored in local agent sessions using Codex or Claude-based tools. The developer describes what needs to be built or fixed, and the agent writes the implementation in TypeScript while following the project rules defined in `AGENTS.md`, `CLAUDE.md`, and `convex_rules.txt`.

Key constraints enforced on every agent session:
- TypeScript only, no JavaScript
- No `any` types -- use `unknown` or specific interfaces
- No `@ts-ignore` or `eslint-disable` -- fix the underlying issue
- All Convex functions must use validators (`v` from `convex/values`)
- All data must have a `sourceUrl` field

Codex is the repo's first-class local setup because it can load instructions automatically from the repository root `AGENTS.md`, merge in nested guidance such as `app/AGENTS.md`, and apply project-scoped behavior from `.codex/config.toml`.

Future: GitHub Actions will trigger agent sessions automatically for certain issue types, removing the requirement for a local developer to initiate work.

## How Code Gets Reviewed

Reviews are maintainer-driven. Agents can still be used locally to inspect diffs, run checks, or suggest fixes before a pull request is opened, but there is no repository-managed automated review agent.

## How Code Gets Merged

All merges require human approval. The single maintainer (essamgouda97) reviews every PR before merging to the main branch. This is a hard gate -- no automated merge path exists.

Merge criteria:
- TypeScript compiles without errors
- No new `any` types or lint suppressions
- Schema changes require explicit maintainer approval (destructive operations are never auto-approved)

A second approver will be added as the contributor base grows.

## How Data Gets Refreshed

A Convex cron job runs every 12 hours, triggering the data agent orchestrator at `convex/agents/dataAgent.ts`. The orchestrator:

1. Deduplicates fiscal years (e.g. "2024/2025" vs "2024-2025") before any refresh
2. Initializes pipeline progress tracking so the frontend can subscribe in real time
3. Ensures reference data tables are populated via `referenceData:ensureAllReferenceData`
4. Checks staleness of each data category (government, parliament, budget, debt, economy, governorate_stats, industry) against a 12-hour threshold
5. For each stale or empty category, dispatches a category-specific refresh using the primary LLM provider via the provider registry
6. Runs a separate constitution refresh step via `constitutionAgent.refreshConstitution`
7. Runs a news refresh step using LLM web research (server-side web_search)
8. All LLM responses are validated through centralized Zod schemas (`convex/agents/schemas.ts`) and the `verifyLLMOutput()` function (`convex/agents/verify.ts`) before writing to Convex
9. If validation passes, updates the Convex database
10. If validation fails, rejects the data and logs the discrepancy for human review
11. Logs every operation to the `dataRefreshLog` table, visible on the `/transparency` page
12. Registers/updates data sources in the `dataSources` table after each successful refresh

Government and cabinet changes are never auto-written. The agent flags differences for manual approval.

Manual trigger: `npx convex run agents/dataAgent:orchestrateRefresh`

## How Data Gets Verified

Community data corrections flow through the LLM Council, a multi-model voting system for verifying proposed changes.

The current pipeline:

1. A community member opens a GitHub Issue with a data correction (e.g., "Minister X was replaced by Minister Y") and includes a source URL
2. The GitHub Agent (`convex/agents/githubAgent.ts`) ingests the issue, classifies it using the `GitHubIssueClassificationSchema`, and checks for spam
3. The issue is submitted to the LLM Council (`convex/agents/council.ts`) for evaluation
4. All providers with API keys configured cast independent votes. The 5-provider registry (`convex/agents/providers/registry.ts`) supports: xAI Grok (`grok-4-1-fast-reasoning`), OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5-20251001`), Google Gemini (`gemini-2.0-flash`), and OpenRouter (`meta-llama/llama-4-scout`)
5. Each provider uses a shared council prompt (`convex/agents/providers/councilPrompt.ts`) and returns a structured vote (approve/reject/abstain, confidence level, reasoning, source verification) validated against `CouncilVoteSchema`
6. Votes are tallied according to the decision matrix (see `ai-data-pipeline.md` for details on source classification)
7. If the council approves, the change is queued for application to the data layer
8. High-sensitivity changes (government officials, election results) still require human approval even after council approval

## Adding a New LLM Provider

Five providers are already implemented: xAI (`xai.ts`), OpenAI (`openai.ts`), Anthropic (`anthropic.ts`), Google (`google.ts`), and OpenRouter (`openrouter.ts`). To add a sixth:

1. Create a new file in `convex/agents/providers/` implementing the `LLMProvider` interface from `convex/agents/providers/types.ts`
2. Required methods: `callLLM`, `callLLMStructured`, `evaluateDataChange`, `callLLMWithUsage`, `callLLMStructuredWithUsage`, plus the `supportsServerTools` flag
3. If the provider supports server-side web search, set `supportsServerTools: true` and implement `callLLMWithServerTools` and `callLLMWebResearchStructured` (currently only xAI and Anthropic support this)
4. Use `zodToToolSchema()` from `convex/agents/schemas.ts` to convert Zod schemas to tool_use JSON Schema for structured output
5. Use `CouncilVoteSchema` and the shared `buildCouncilPrompt()` / `COUNCIL_SYSTEM_PROMPT` from `convex/agents/providers/councilPrompt.ts` for council evaluation
6. Add the provider to the `PROVIDER_REGISTRY` array in `convex/agents/providers/registry.ts` with its env var key and default model
7. The registry auto-detects available providers by checking environment variables. Priority order: xAI, OpenAI, Anthropic, Google, OpenRouter

Provider interface (`LLMProvider` from `types.ts`):
- Input for council evaluation: category, table name, field name, current/proposed values, source URL, source content, issue body (typed as `CouncilEvaluationContext`)
- Output for council evaluation: vote (`approve`, `reject`, or `abstain`), confidence (`high`, `medium`, or `low`), reasoning text, and `sourceVerified` boolean (typed as `CouncilVoteResult`)
- Providers must handle their own API authentication via Convex environment variables

## Structured Output and Verification

All LLM calls in the pipeline use centralized Zod schemas and a verification layer to ensure data integrity.

### Schemas (`convex/agents/schemas.ts`)

Every data category has a Zod schema defined in this file. The schemas serve three purposes:
1. Generate JSON Schema for structured LLM output (tool_use / function calling)
2. Runtime validation of LLM responses before upserting to Convex
3. TypeScript type inference for pipeline code

Schema categories: Budget (`BudgetDataSchema`, `BudgetWikipediaSchema`), Government (`CabinetDataSchema`, `GovernorsDataSchema`), Parliament (`ParliamentCompositionSchema`, `NameTransliterationSchema`), Economy (`IMFProjectionsSchema`, `IMFIndicatorsExtractionSchema`, `InterestRateSchema`, `BankRatesSchema`, `StockIndexSchema`, `EconomicNarrativeSchema`), Constitution (`ConstitutionExtractionSchema`), Industry/Investment (`IDAOpportunitiesSchema`, `GAFIOpportunitiesSchema`, `IndustrialBenchmarksSchema`, `CostEstimatesSchema`, `IDAComplexesSchema`, `GAFIZonesSchema`, `InvestmentIncentivesSchema`), News (`NewsExtractionSchema`, `RawNewsListSchema`), Council (`CouncilVoteSchema`), GitHub (`GitHubIssueClassificationSchema`), Governorate (`GovernorateEnrichmentSchema`).

The `zodToToolSchema()` utility converts any Zod schema into the `{ name, description, input_schema }` format required by the LLM provider interface for tool_use calls.

### Verification (`convex/agents/verify.ts`)

Two functions:
- `verifyLLMOutput(schema, raw, category)` -- validates parsed JSON against a Zod schema, returns `{ ok: true, data }` or `{ ok: false, errors, raw }`
- `parseAndVerify(text, schema, category)` -- extracts JSON from free-form LLM text (handles markdown fences, prose wrapping), then validates against the schema

All LLM responses MUST pass through one of these functions before being written to Convex.

## Guide Agent (Interactive Chat)

Mizan includes an interactive guide agent that helps users explore the platform. It is built on the **Convex Agent SDK** (`@convex-dev/agent` v0.6.1) and uses **driver.js** for UI element highlighting.

### Architecture

- **Backend agent**: `convex/guideActions.ts` -- defines the `guideAgent` using `new Agent()` from `@convex-dev/agent`, with `gpt-4.1-mini` (via `@ai-sdk/openai`) as the language model
- **Queries/mutations**: `convex/guide.ts` -- `sendMessage` (mutation that saves the user message and schedules the agent response), `listMessages` (paginated query using `listUIMessages`), `checkMonthlyCost` ($20/month budget cap)
- **Usage tracking**: `convex/guideAnalytics.ts` -- logs every agent call to the `chatUsage` table with token counts and cost estimates from `convex/lib/tokenCost.ts`
- **Rate limiting**: `convex/rateLimits.ts` -- uses `@convex-dev/rate-limiter` to enforce 1 message per 3 seconds and a 10K tokens/hour budget per session
- **Convex config**: `convex/convex.config.ts` -- registers the `@convex-dev/agent` and `@convex-dev/rate-limiter` components via `app.use()`
- **Frontend**: `src/components/guide-chat.tsx` (chat UI with action parsing) and `src/components/guide-provider.tsx` (React context for pending highlights/inputs)

### Agent Tools

The guide agent has 3 tools, each returning a JSON action that the frontend interprets:

1. **navigate** -- proposes navigating to one of the platform's pages (shows a confirmation button)
2. **highlight** -- spotlights a `data-guide` element on the current page using driver.js
3. **controlInput** -- sets input values on calculator/tool pages, or asks the user a follow-up question first (`needsInfo: true`)

The agent is constrained to `maxSteps: 3` per response and `toolChoice: "required"` (it must always call at least one tool).

### Page Context

Each page has a registered set of highlightable selectors and controllable tools defined in the `PAGE_CONTEXT` map in `guideActions.ts`. The `generateResponse` action injects the current page's available selectors and tools into the system prompt so the agent knows what it can interact with.

## Agent Onboarding Guide

If you are a Codex session, Claude session, or any other AI agent working on this repo for the first time, read these files in order to understand the codebase:

### Required Reading (before any code change)
1. `AGENTS.md` -- Repo-level agent guidance, commands, and verification expectations
2. `CLAUDE.md` -- Project rules, data philosophy, critical constraints
3. `convex_rules.txt` -- Convex-specific patterns (function syntax, validators, indexes, scheduling)
4. `convex/schema.ts` -- All 26+ tables, their fields, and indexes

### Architecture Understanding
5. `docs/architecture.md` -- Three-layer system overview (visual, data, agentic)
6. `convex/agents/dataAgent.ts` -- Main 12h orchestrator (how data flows in)
7. `convex/agents/council.ts` -- LLM Council orchestrator (how data gets verified)
8. `convex/agents/githubAgent.ts` -- GitHub issue processing (how community contributes)
9. `convex/agents/providers/registry.ts` -- Provider registry and auto-detection (reuse `callLLM*` wrappers, don't inline API calls)
10. `convex/agents/schemas.ts` -- Centralized Zod schemas for all LLM-extracted data
11. `convex/agents/verify.ts` -- `verifyLLMOutput()` and `parseAndVerify()` for validating LLM responses
12. `convex/guideActions.ts` -- Guide agent (Convex Agent SDK + driver.js interactive chat)

### Data Layer
13. `convex/dataRefresh.ts` -- All mutations for writing data (upsert patterns, audit logging)
14. `convex/referenceData.ts` -- Reference data loader (static data that rarely changes)
15. `convex/agents/constitutionAgent.ts` -- PDF extraction tool (how constitution is loaded)
16. `convex/agents/validators.ts` -- Deterministic validators (budget sums, debt bounds, etc.)
17. `convex/agents/providers/types.ts` -- `LLMProvider`, `LLMCallResult`, `CouncilVoteResult` interfaces
18. `convex/lib/tokenCost.ts` -- Per-model pricing table and `estimateCost()` for usage tracking

### What You Need From Your Human
- At least one LLM API key must be set as a Convex environment variable: **XAI_API_KEY** (highest priority), **OPENAI_API_KEY**, **ANTHROPIC_API_KEY**, **GOOGLE_AI_API_KEY**, or **OPENROUTER_API_KEY**
- **GITHUB_TOKEN** must be set for GitHub issue processing
- For the guide chat agent: **OPENAI_API_KEY** is required (uses `gpt-4.1-mini` via the Convex Agent SDK)
- Schema migrations need explicit approval (never auto-run destructive operations)
- Government official changes need human confirmation (pipeline flags but doesn't write)
- Production deployments need human approval (use `npx convex deploy` only when told to)

### Manual Pipeline Triggers
```bash
# Full pipeline refresh (all 7 categories + reference data + constitution + news)
npx convex run agents/dataAgent:orchestrateRefresh

# Force refresh even if data is fresh
npx convex run agents/dataAgent:orchestrateRefresh '{"force": true}'

# Single category refresh via dataRefresh
npx convex run dataRefresh:manualRefresh '{"category": "debt"}'
npx convex run dataRefresh:manualRefresh '{"category": "economy"}'

# Check data freshness
npx convex run dataRefresh:getAllLastUpdated

# Seed initial data (populates all tables from backups)
npx convex run seedData:seedAll
```

### Development Setup
1. Clone the repo and `cd app`
2. `npm install --legacy-peer-deps`
3. Copy `.env.example` to `.env.local`
4. Run `npx convex dev` (creates a dev deployment)
5. Run `npx convex run seedData:seedAll` to populate initial data
6. Run `npm run dev` for the Next.js frontend
7. Set at least one LLM API key in the Convex dashboard (Settings > Environment Variables) to enable AI features: `XAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, or `OPENROUTER_API_KEY`. The guide chat agent requires `OPENAI_API_KEY` specifically.
