# Mizan -- System Architecture

Full system architecture for Mizan, Egypt's government transparency platform.

Architecture diagram: https://app.excalidraw.com/s/8B4UFPTVlkA/2QtqeIRt0rX

---

## Three-Layer Architecture

Mizan is structured in three layers: a Visual Layer that users interact with, a Data Layer that stores all structured government data, and an Agentic Layer that keeps data fresh and verified.

```
+---------------------------------------------------------------+
|                       VISUAL LAYER                            |
|              React / Next.js Web Application                  |
|                                                               |
|  Pages: /budget, /debt, /parliament, /government,             |
|         /constitution, /elections, /economy, /transparency     |
|  Tools: /tools/tax-calculator, /tools/invest,                 |
|         /tools/buy-vs-rent, /tools/mashroaak                  |
|  Components: Sankey charts, hemicycle, data tables, search,   |
|              bilingual toggle, guide chat (AI assistant)       |
|  Providers: ThemeProvider, LanguageProvider, GuideProvider     |
|  Integrations: WebMCP (navigator.modelContext), driver.js     |
+---------------------------------------------------------------+
        |                                          ^
        | Convex useQuery / useAction              | Real-time
        | (subscriptions)                          | updates
        v                                          |
+---------------------------------------------------------------+
|                        DATA LAYER                             |
|                    Convex Database                             |
|                                                               |
|  40 tables (core data + agent/council/funding/guide tables)   |
|                                                               |
|  Core data:                                                   |
|    budgetItems, debtRecords, parliamentMembers,               |
|    officials, constitutionArticles, elections,                 |
|    governorates, parties, investmentOpportunities             |
|                                                               |
|  Agent/infra data:                                            |
|    dataRefreshLog, dataChangeLog, councilVotes,               |
|    councilSessions, githubIssueProcessing,                    |
|    fundingDonations, chatUsage, pipelineProgress              |
|                                                               |
|  Every record has a sourceUrl field.                          |
+---------------------------------------------------------------+
        |                                          ^
        | Reads current data                       | Writes validated
        | for comparison                           | updates
        v                                          |
+---------------------------------------------------------------+
|                      AGENTIC LAYER                            |
|                    AI DATA + GUIDE LAYER                      |
|                                                               |
|  Orchestrator: dataAgent.ts (cron every 12h)                  |
|  LLM Council: multi-model voting on data changes              |
|  GitHub Agent: issue ingestion, spam filtering                |
|  Guide Agent: AI SDK structured actions (GPT-4.1-mini)        |
|  Validators: deterministic checks (sums, counts, ranges)      |
|  Verifier: Zod-based LLM output validation (verify.ts)        |
|  Providers: AI SDK registry for xAI, OpenAI, Claude, Gemini,  |
|             OpenRouter (priority fallback chain)               |
|  Components: @convex-dev/rate-limiter                         |
+---------------------------------------------------------------+
        |
        | Fetches from external sources
        v
+---------------------------------------------------------------+
|                   EXTERNAL SOURCES                            |
|                                                               |
|  World Bank API        Ministry of Finance (mof.gov.eg)       |
|  IMF DataMapper API    Ahram Online (ahram.org.eg)            |
|  ExchangeRate-API      Central Bank of Egypt                  |
|  Wikipedia (parliament) parliament.gov.eg                     |
|  IDA (ida.gov.eg)      GAFI (gafi.gov.eg)                    |
|  countryeconomy.com    GDELT (news headlines)                 |
|  FAO/FAOLEX (constitution PDF)                                |
+---------------------------------------------------------------+
```

## Visual Layer

**Stack**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui

The Visual Layer renders all government data as interactive visualizations and searchable interfaces. It never hardcodes data that should be dynamic -- all values come from Convex subscriptions.

Key pages and their visualizations:
- `/budget` -- Sankey flow diagram connecting revenue sources to expenditure categories
- `/debt` -- Time-series charts of external debt, GDP ratios, and creditor composition
- `/economy` -- GDP growth, inflation, exchange rate, sovereign credit ratings, stock index
- `/parliament` -- Hemicycle seating charts for House (596 seats) and Senate (300 seats), with party breakdown
- `/government` -- Cabinet grid, ministry list, governorate map with governor profiles
- `/constitution` -- Full-text search across all 247 articles
- `/elections` -- Interactive governorate map with historical election results
- `/transparency` -- Audit trail table showing every data refresh the agent has performed

Interactive tools:
- `/tools/tax-calculator` -- Egyptian income tax calculator with per-sector spending breakdown
- `/tools/invest` -- Portfolio simulator across Egyptian asset classes (stocks, CDs, T-bills, gold, real estate)
- `/tools/buy-vs-rent` -- Buy vs rent comparison with mortgage, installments, and cash options
- `/tools/mashroaak` -- Investment opportunity explorer sourcing real projects from IDA and GAFI

Guide chat: An AI-powered assistant (currently disabled in production) that helps users navigate the platform. Built with Vercel AI SDK structured generation and GPT-4.1-mini, it supports typed actions: navigate (propose page transitions), highlight (spotlight UI elements via driver.js), control (set values on tool pages), and ask (request missing input). The guide chat panel opens on the left side of the screen and pushes the main content via the `#mizan-app` wrapper div. Page tours are defined in `guide-workflows.ts` with per-page `PAGE_TOURS` step arrays.

WebMCP integration: Pages register tools with the WebMCP `navigator.modelContext` API (W3C draft spec) so AI agents in browsers can discover and invoke them. The `useWebMCPTool` hook in `app/src/lib/webmcp.ts` handles feature detection, React Strict Mode guards, and cleanup. A static manifest at `app/public/.well-known/webmcp` declares available tools and multi-step flows. Global WebMCP tools (site overview, full data export, data health) are registered by the `WebMcpRegistration` component in `app/src/components/web-mcp.tsx`. Tool pages additionally register page-specific tools via `useWebMCPTool`, which also registers them in the guide chat's client-side tool registry (`app/src/lib/guide-registry.ts`).

data-guide attributes: UI elements across all major pages are annotated with `data-guide` attributes (e.g., `data-guide="budget-flow"`, `data-guide="salary-input"`). These serve as stable selectors for the guide chat's highlight tool and driver.js page tours.

Bilingual support: all pages render in both Arabic (RTL) and English (LTR), switchable via a global toggle. Currency formatting uses the `fmt()` utility in `app/src/lib/format.ts`.

## Data Layer

**Stack**: Convex (serverless database with real-time subscriptions)

All data lives in Convex as the single source of truth. The schema defines 40 tables across several categories:

### Core Data Tables

These store the structured government data that users see:
- `officials` (59 records) -- Ministers and governors with portfolio, appointment date, and biography
- `ministries` (27) -- Ministry names, descriptions, and associated officials
- `governorates` (27) -- All 27 governorates with population, area, and geographic data
- `parties` (8) -- Party name, founding date, ideology, seat counts
- `parliamentMembers` (30) -- Name, party, governorate, chamber (house/senate), committee assignments
- `committees`, `committeeMemberships` -- Parliamentary committee structure and member assignments
- `constitutionParts` (6), `constitutionArticles` (247), `articleCrossReferences` -- Full constitution structure with cross-references between articles
- `fiscalYears` (3), `budgetItems` (31) -- Revenue and expenditure line items with amounts, categories, and fiscal year
- `debtRecords` (10) -- External debt snapshots by year with total, GDP ratio, and creditor breakdown
- `debtByCreditor` -- Per-creditor debt breakdown with `interestRate`, `annualDebtService`, and `maturityYears` fields
- `elections` (3), `electionResults`, `governorateElectionData` -- Election results with governorate-level granularity
- `taxBrackets` (7 brackets for 2024) -- Income tax brackets per Law 7/2024, powering the /tools/tax-calculator page

Additional tables cover supporting data: `economicIndicators`, `governorateStats`, `dataSources`, `dataLineage`, `aiResearchReports`, `sovereignRatings`, `polls`, `pollVotes`, `apiUsageLog`, `pipelineProgress`, `investmentOpportunities`, `investmentProjectDetails`, `newsHeadlines`, and `chatUsage`.

### Agent and Infrastructure Tables

These support the agentic layer's operations:
- `dataRefreshLog` -- Every refresh attempt with status, record count, source URL, and timestamps
- `dataChangeLog` -- Detailed record of what changed and why, for the transparency page
- `councilSessions`, `councilVotes` -- LLM Council voting sessions and individual votes
- `githubIssueProcessing` -- Ingested community issues awaiting or completed processing
- `fundingDonations`, `fundingAllocations`, `fundingSummary` -- Donation and sponsorship records for the funding transparency page
- `chatUsage` -- Guide chat token and cost tracking per thread, with a $20/month budget cap

### Data Integrity Rules

- Every record must have a `sourceUrl` field pointing to where the data was obtained
- Financial data supports both EGP and USD values
- Parliament member counts are validated: House = 596, Senate = 300
- Budget items must sum to their category totals (within 0.01 tolerance)
- Debt values must be non-negative and GDP ratios must be under 200%

## Agentic Layer

**Stack**: Convex actions (server-side), Vercel AI SDK multi-provider registry (xAI Grok, OpenAI, Anthropic Claude, Google Gemini, OpenRouter), `@convex-dev/rate-limiter`, pdf-parse (for constitution PDF extraction), Zod schemas + verifier, deterministic validators

The Agentic Layer is responsible for keeping data fresh, processing community contributions, and powering the guide chat. It consists of six components:

### Convex Component Registration (convex.config.ts)

The Convex app registers one component:
- `@convex-dev/rate-limiter` -- enforces per-session rate limits on guide chat (1 message per 3 seconds, 10K tokens/hour)

### Orchestrator (dataAgent.ts)

A Convex cron job fires every 12 hours and triggers the orchestrator. The orchestrator runs the following steps in sequence:
1. **ensureAllReferenceData** -- checks all 18 tables, loads from backup if empty (zero cost if populated)
2. **Debt refresh** -- fetches from World Bank API, converts USD to billions, upserts all available years
3. **Budget refresh** -- fetches MOF page, uses content hashing to skip when unchanged, Claude extracts fiscal year totals
4. **Government refresh** -- fetches Ahram Online (english.ahram.org.eg), Claude detects minister changes, auto-writes via upsertOfficialAndMinistry. Ahram Online is used because cabinet.gov.eg is JS-rendered and inaccessible to server-side fetch.
5. **Parliament refresh** -- composition from Wikipedia API (2025 election), member names from parliament.gov.eg individual pages (regex + Claude), batched via Convex scheduler
6. **Constitution refresh** -- checks if article count is below 247, downloads PDF from FAO, extracts with pdf-parse + Claude
7. **GitHub issue processing** -- processes data-correction/stale-data issues via LLM Council
8. **Log compaction** -- daily cron deletes refresh logs older than 30 days

### LLM Provider Registry (agents/providers/registry.ts)

A multi-provider system with automatic fallback. Priority order: xAI Grok > OpenAI > Anthropic Claude > Google Gemini > OpenRouter. The registry auto-detects available providers from environment variables. For the pipeline, it uses the highest-priority available provider. For the council, it uses all available providers (each casts a vote). Server tools (web search) route to the first capable provider.

### LLM Output Verifier (agents/verify.ts)

All LLM responses pass through `verifyLLMOutput()` or `parseAndVerify()` before being written to Convex. This enforces Zod schema compliance, handles markdown fences and other LLM quirks in JSON extraction, and logs verification results. Schemas are centralized in `agents/schemas.ts`.

### LLM Council

A multi-model voting system for verifying community-submitted data corrections. When a GitHub issue proposes a data change, the council evaluates the claim against the cited source. Each provider votes independently (approve / reject / abstain), and votes are tallied according to source classification rules. See `ai-data-pipeline.md` for the full decision matrix.

### Guide Agent (guideActions.ts, guide.ts, guideAnalytics.ts)

An interactive AI assistant built with Vercel AI SDK structured output. Uses GPT-4.1-mini with typed actions:
- `navigate` -- proposes page navigation with a confirmation button
- `highlight` -- spotlights a UI element on the current page using driver.js (targets `data-guide` attributes)
- `control` -- sets values on tool page inputs
- `ask` -- asks the user for missing information first

The guide is context-aware: each request includes the user's current page, available `data-guide` selectors, and available tool actions for that page. Message persistence uses the `guideMessages` table, while usage is tracked in the `chatUsage` table with a $20/month cost cap enforced by `guide.checkMonthlyCost`. Rate limiting via `@convex-dev/rate-limiter` prevents spam (1 message per 3 seconds, 10K token budget per hour).

### GitHub Agent

Ingests issues from the Mizan GitHub repository, classifies them (data correction, feature request, bug report, spam), and routes data corrections through the LLM Council pipeline. Includes spam detection to prevent abuse of the community correction system.

### Validators (deterministic)

Located in `convex/agents/validators.ts`. These are pure functions with no LLM involvement:
- `validateBudgetTotals` -- Budget line items sum to expected totals
- `validateParliamentCounts` -- Member counts match constitutional requirements
- `validateDebtRecord` -- No negative values, GDP ratio within bounds
- `parseWorldBankResponse` -- Parses World Bank API v2 JSON format
- `extractClaudeText` -- Extracts structured text from Claude API responses

### Structured Schemas (agents/schemas.ts)

Centralized Zod schemas for all LLM-extracted data. Every LLM call in the pipeline uses a schema from this file for structured output generation, runtime validation, and TypeScript type inference. Covers budget, government, parliament, economy, constitution, industry/investment, news, council votes, and GitHub issue classification. Includes a `zodToToolSchema()` utility that converts Zod schemas to JSON Schema for LLM tool_use.

## Data Flows

### Automated Refresh Flow

```
External Sources (gov APIs, websites)
    |
    v
Orchestrator (every 12h cron)
    |
    v
Category-specific fetcher (HTTP request)
    |
    v
Parser (World Bank JSON / Claude HTML extraction)
    |
    v
Deterministic Validator
    |
    +-- pass --> Update Convex database --> Real-time push to Visual Layer
    |
    +-- fail --> Log to dataRefreshLog --> Flag for human review
```

### Community Correction Flow

```
GitHub Issue (community member submits data correction with source URL)
    |
    v
GitHub Agent (ingests, classifies, spam check)
    |
    v
LLM Council (multi-model vote on correctness)
    |
    +-- approved + low sensitivity --> Apply change to Data Layer
    |
    +-- approved + high sensitivity --> Queue for human review
    |
    +-- rejected --> Close issue with explanation
```

### User Request Flow

```
User visits page (e.g., /budget)
    |
    v
Next.js renders with Convex useQuery subscriptions
    |
    v
Convex returns current data from database
    |
    v
React renders visualization (Sankey chart, hemicycle, etc.)
    |
    v
If data updates in Convex --> real-time push --> UI re-renders automatically
```

### Guide Chat Flow

```
User opens guide chat (Compass button, bottom-left)
    |
    v
GuideChat component creates a local thread id
    |
    v
User sends message (or picks a preset)
    |
    +-- guide.sendMessage mutation saves message + schedules guideActions.generateResponse
    |
    v
guideAgent (GPT-4.1-mini) runs with page context (current page, selectors, tools)
    |
    +-- navigate tool --> frontend shows "Go to /page" confirmation button
    +-- highlight tool --> driver.js spotlights element via data-guide selector
    +-- controlInput tool --> sets values on tool page inputs (or asks for missing info)
    |
    v
Actions rendered as cards (NavigateCard, HighlightCard, ControlCard, AskCard)
    |
    v
Cross-page actions use localStorage (savePendingAction) + useGuidePending hook
```

## Layout Structure

The root layout (`app/src/app/layout.tsx`) wraps all page content in a `#mizan-app` div. This wrapper enables the guide chat panel to push the main content to the right when open on desktop (via `marginLeft` style adjustment). The layout includes:
- `Providers` -- ConvexProvider, ThemeProvider, LanguageProvider, TooltipProvider
- `Header` and `Footer` -- persistent navigation
- `WebMcpRegistration` -- registers global WebMCP tools
- `GuideChat` -- AI assistant panel (currently commented out for production)
