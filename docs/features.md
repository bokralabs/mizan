# project-prompt-mizan-project-name — Feature Registry

<!-- Auto-synced. Do not edit manually. Run: fop docs sync <project> -->

## Pages

| Route | Description | Data Source |
|-------|-------------|-------------|
| `/` | Landing page with links to all sections | Static |
| `/economy` | GDP, inflation, unemployment, exchange rate, EGX 30, credit ratings, IMF projections | World Bank API, IMF DataMapper, ExchangeRate-API, countryeconomy.com |
| `/budget` | Government budget: revenue, expenditure, deficit, Sankey flow diagram, year comparison, per-capita breakdown | Ministry of Finance (AI-parsed) |
| `/debt` | External debt, debt-to-GDP ratio, timeline, creditor breakdown | World Bank API |
| `/government` | President, cabinet, 27 governorates with governors, parliament composition | Ahram Online (AI-parsed), parliament.gov.eg |
| `/parliament` | Party seat distribution, member directory, committees | parliament.gov.eg (automated) |
| `/constitution` | Full-text search across 247 articles, organized by parts, amendment tracking | FAO/FAOLEX (AI-extracted PDF) |
| `/constitution/article/[number]` | Individual article detail with cross-references | Convex |
| `/elections` | Presidential and parliamentary election results, turnout data | Convex |
| `/governorate/[slug]` | Per-governorate stats: population, area, density, HDI | CAPMAS, Wikipedia |
| `/polls` | AI-generated weekly opinion polls with anonymous voting | Convex (AI-generated) |
| `/tools/tax-calculator` | Egyptian income tax calculator with budget allocation breakdown | Convex (tax brackets + expenditure data) |
| `/tools/invest` | Investment portfolio simulator: Egyptian stocks, bank certificates, treasury bills, gold, real estate, S&P 500, MSCI EM | Convex (live rates from CBE, EGX) |
| `/tools/buy-vs-rent` | Buy vs rent comparison: mortgage, installments, or cash with inflation and depreciation modeling | Convex (economic indicators) |
| `/tools/mashroaak` | Industrial & investment opportunity explorer (IDA + GAFI data) with budget matching and filters | IDA, GAFI (AI-scraped) |
| `/methodology` | Data source manifest read from the `dataSources` table | Convex |
| `/transparency` | Full audit trail of AI pipeline runs, data changes, and council votes | Convex (`dataRefreshLog`, `dataChangeLog`) |
| `/funding` | GitHub Sponsors donations, allocation tracking, monthly summaries | Convex (`fundingDonations`, `fundingAllocations`) |

## AI Data Pipeline

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| 12-hour cron refresh | Active | `app/convex/crons.ts` | Calls `orchestrateRefresh` on a 12h interval |
| Public `triggerRefresh` action | Active | `app/convex/agents/dataAgent.ts` | Public action for manual pipeline runs via CLI (`npx convex run agents/dataAgent:triggerRefresh`); schedules `orchestrateRefresh` |
| Multi-provider LLM registry | Active | `app/convex/agents/providers/registry.ts` | Auto-detects available providers from env vars. Priority: xAI (Grok) > OpenAI > Anthropic > Google > OpenRouter |
| xAI/Grok provider | Active | `app/convex/agents/providers/xai.ts` | Model: `grok-4-1-fast-reasoning`. Supports chat completions, function calling, and server-side web search via the xAI Responses API |
| OpenAI provider | Active | `app/convex/agents/providers/openai.ts` | Default model: `gpt-4o-mini` |
| Anthropic provider | Active | `app/convex/agents/providers/anthropic.ts` | Default model: `claude-haiku-4-5-20251001`. Supports server tools (`web_search`, `web_fetch`) |
| Google provider | Active | `app/convex/agents/providers/google.ts` | Default model: `gemini-2.0-flash` |
| OpenRouter provider | Active | `app/convex/agents/providers/openrouter.ts` | Default model: `meta-llama/llama-4-scout`. No server tool support |
| Structured output schemas | Active | `app/convex/agents/schemas.ts` | Centralized Zod schemas for all LLM-extracted data categories: budget, government, parliament, economy, constitution, industry (IDA/GAFI), news, council votes, GitHub issue classification, governorate stats. Includes `zodToToolSchema()` for converting Zod to JSON Schema for tool_use |
| LLM output verification | Active | `app/convex/agents/verify.ts` | `verifyLLMOutput()` validates all LLM responses against Zod schemas before writing to Convex. `parseAndVerify()` handles markdown fences and prose wrapping |
| LLM Council | Active | `app/convex/agents/council.ts` | Multi-model data verification: all available providers vote (approve/reject/abstain) on proposed data changes. Sessions tracked in `councilSessions` and `councilVotes` tables |
| GitHub issue processing | Active | `app/convex/agents/githubAgent.ts` | 12h cron processes GitHub issues, classifies data corrections, routes to council |
| Poll generation | Active | `app/convex/agents/pollAgent.ts` (via cron) | Weekly AI-generated opinion polls |
| Log compaction | Active | `app/convex/agents/maintenance.ts` | Daily compaction of refresh logs older than 30 days |
| API usage tracking | Active | `apiUsageLog` table | Per-call token count, cost, duration, provider, and model logging |
| Pipeline progress | Active | `pipelineProgress` table | Real-time step-by-step tracking of each pipeline run |

## Guide Chat

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| Guide Chat widget | Active | `app/src/components/guide-chat.tsx` | Desktop-only side panel (360px) that pushes app content. Powered by Convex Agent SDK |
| Agent backend | Active | `app/convex/guideActions.ts` | Uses `@convex-dev/agent` with `openai("gpt-4.1-mini")`, `maxSteps: 3`, `temperature: 0.3` |
| Navigate tool | Active | `app/convex/guideActions.ts` | Proposes page navigation with a confirmation button. Constrained to 15 valid page paths |
| Highlight tool | Active | `app/convex/guideActions.ts` | Spotlights an element using driver.js via `data-guide` attribute selectors. Constrained to 31 valid selector names |
| ControlInput tool | Active | `app/convex/guideActions.ts` | Sets values on tool page calculators or asks the user a clarifying question first (`needsInfo` flag). Maps to 4 WebMCP tools |
| Thread persistence | Active | `app/src/lib/guide-registry.ts` | Thread ID saved to localStorage, restored on page reload |
| Pending actions | Active | `app/src/lib/guide-registry.ts`, `app/src/lib/use-guide-pending.ts` | Cross-page tool execution: saves action to localStorage, consumes on target page after navigation |
| Preset prompts | Active | `app/src/lib/guide-workflows.ts` | 6 bilingual preset prompts: economy, government, taxes, investments, rights, data sourcing |
| Cost cap | Active | `app/convex/guide.ts` | $20/month budget cap on guide chat usage, tracked in `chatUsage` table |
| Usage analytics | Active | `app/convex/guideAnalytics.ts` | Per-thread stats: message count, total tokens, cost |
| Rate limiting | Active | `app/convex/rateLimits.ts` | `@convex-dev/rate-limiter`: 1 message per 3 seconds, 10K tokens/hour per session |
| Guide provider context | Active | `app/src/components/guide-provider.tsx` | React context for guide open/close state and pending inputs/highlights |
| Bilingual support | Active | Guide chat responds in the same language the user writes in (English or Arabic) | System prompt injected per message |

## Page Tours (driver.js)

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| Page tour system | Active | `app/src/lib/guide-workflows.ts` | `PAGE_TOURS` defines step-by-step guided tours per page using driver.js highlights |
| Local tour button | Active | `app/src/components/guide-chat.tsx` | "Tour this page" button appears in guide chat panel when the current page has a tour defined |
| Tour step rendering | Active | `app/src/components/guide-chat.tsx` | Steps rendered as inline cards in the guide panel; current step highlighted, completed steps dimmed |
| `data-guide` attributes | Active | 13 page files | 35 `data-guide` attributes across: tax-calculator (4), invest (4), buy-vs-rent (4), mashroaak (4), economy (4), budget (4), debt (4), government (4), parliament (1), constitution (2) |
| Tours defined for 10 pages | Active | `app/src/lib/guide-workflows.ts` | `/tools/tax-calculator`, `/tools/invest`, `/tools/buy-vs-rent`, `/tools/mashroaak`, `/economy`, `/budget`, `/debt`, `/government`, `/parliament`, `/constitution` |

## WebMCP Integration

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| WebMCP hook | Active | `app/src/lib/webmcp.ts` | `useWebMCPTool()` registers page tools with `navigator.modelContext` (W3C Community Group Draft). Also registers in the guide chat tool registry |
| Type declarations | Active | `app/src/types/webmcp.d.ts` | TypeScript declarations for the WebMCP `navigator.modelContext` API |
| `calculate_egypt_tax` | Active | `app/src/app/tools/tax-calculator/page.tsx` | Input: `{annualSalary: number}`. Returns tax amount, effective rate, and per-sector budget allocation |
| `simulate_egypt_investment` | Active | `app/src/app/tools/invest/page.tsx` | Input: `{capitalEgp?, strategy?, horizonYears?}`. Returns nominal, real, and USD projections across asset classes |
| `compare_buy_vs_rent` | Active | `app/src/app/tools/buy-vs-rent/page.tsx` | Input: `{homePrice, monthlyRent, years?}`. Returns verdict, total costs, breakeven year, and detailed breakdown |
| `search_egypt_investment_opportunities` | Active | `app/src/app/tools/mashroaak/page.tsx` | Input: `{maxCapitalEgp?}`. Returns matching IDA/GAFI opportunities with sector and governorate stats |
| Guide registry bridge | Active | `app/src/lib/guide-registry.ts` | All WebMCP tools are also registered in the guide chat registry so the guide agent can invoke them via `controlInput` |

## Budget Features

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| Expenditure breakdown fallback | Active | `app/convex/budget.ts` (`getExpenditureBreakdown`) | Iterates through up to 5 recent fiscal years (newest first) and returns the first one that has expenditure breakdown items. Used by the tax calculator to show where tax money goes |
| Sankey flow diagram | Active | `app/src/app/budget/page.tsx` | Desktop: Nivo `ResponsiveSankey` showing revenue sources to spending categories. Mobile: interactive SVG flow diagram |
| Year comparison chart | Active | `app/src/app/budget/page.tsx` | SVG bar chart comparing revenue and spending across fiscal years, data from Convex |
| Per-capita breakdown | Active | `app/src/app/budget/page.tsx` | Per-citizen revenue, spending, debt service, and education figures using World Bank population data |
| Fiscal year reconciliation | Active | `app/convex/dataRefresh.ts` | `reconcileFiscalYearBudgetState()` recomputes totals, percentage-of-total, and percentage-of-GDP for all budget items after data changes |

## Infrastructure

| Feature | Status | Backend | Notes |
|---------|--------|---------|-------|
| Convex Agent SDK | Active | `app/convex/convex.config.ts` | `@convex-dev/agent` component for guide chat thread management and message streaming |
| Rate limiter component | Active | `app/convex/convex.config.ts` | `@convex-dev/rate-limiter` component for guide chat spam prevention |
| Token cost estimation | Active | `app/convex/lib/tokenCost.ts` | `estimateCost()` maps model names to per-token pricing for usage tracking |
| Sanad source confidence | Active | Schema-wide | 5-level confidence system (1=official_gov, 2=intl_org, 3=news, 4=other, 5=derived) on all data tables via `sanadLevel` field |
| Full-text search | Active | Convex `searchIndex` | `constitutionArticles.search_articles` (English text) and `investmentOpportunities.search_opportunities` (English name) |
| SEO metadata | Active | Per-page `layout.tsx` files | `generateMetadata` with bilingual title, description, and OpenGraph tags |
| LLM-optimized sitemaps | Active | `app/src/app/llms.txt`, `app/src/app/llms-full.txt` | Machine-readable endpoints for LLM crawlers |
| Currency support | Active | `CurrencyProvider` | Global EGP/USD toggle on financial pages using ExchangeRate-API daily rate |
| Bilingual UI | Active | `useLanguage()` from providers | Full Arabic/English toggle with RTL support |
