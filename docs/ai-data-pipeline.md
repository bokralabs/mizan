# Mizan AI Data Pipeline

## Overview

Mizan uses an AI-powered data agent built on Convex to keep all government data fresh, validated, and properly sourced. The agent runs every 12 hours via a Convex cron job and orchestrates data collection across all categories.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Convex Cron Jobs                   │
│                                                       │
│  Every 12 hours:                                      │
│    crons.ts → internal.agents.dataAgent.orchestrateRefresh │
│  Weekly (168 hours):                                  │
│    crons.ts → internal.agents.pollAgent.generateDailyPoll │
│  Daily:                                               │
│    crons.ts → agents/maintenance.compactRefreshLogs   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              AI Orchestrator Action                    │
│           convex/agents/dataAgent.ts                  │
│                                                       │
│  1.  reference_data     — ensureAllReferenceData (18 tables) │
│  2.  government         — Cabinet (Wikipedia/Ahram + LLM)    │
│  3.  parliament         — Members (parliament.gov.eg + Wiki) │
│  4.  budget             — MOF + Wikipedia + LLM parsing      │
│  5.  debt               — World Bank API (debt stock/service)│
│  6.  economy            — World Bank, IMF, CBE, FX, EGX      │
│  7.  governorate_stats  — Wikipedia/CAPMAS + web research    │
│  8.  industry           — IDA + GAFI investment opportunities│
│  9.  constitution       — FAO PDF extraction if < 247 arts.  │
│  10. github_issues      — Community data corrections (LLM)   │
│  11. narrative          — AI bilingual economic narrative    │
│  12. news               — RSS feeds + LLM web search         │
│  13. llm_export         — ISR revalidation of /llms-full.txt │
│  14. cleanup            — Pipeline cleanup step              │
└──────────────────────┬──────────────────────────────────────┘
                       │
     ┌────────┬────────┼────────┬────────┬────────┐
     ▼        ▼        ▼        ▼        ▼        ▼
┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  Debt  │ │Budget│ │ Govt │ │Econom│ │Indust│ │ News │
│ World  │ │ MOF+ │ │Ahram/│ │ WB + │ │IDA + │ │ RSS+ │
│ Bank   │ │Claude│ │ Wiki │ │ IMF  │ │ GAFI │ │ LLM  │
└────────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘

┌─────────────────────────────────────────────────────┐
│       GitHub Issues → Claude Code Action             │
│      .github/workflows/claude-fix.yml                │
│                                                       │
│  Triggered by: `bug`, `enhancement`, or              │
│  `data-correction` label, or @claude mention         │
│                                                       │
│  Claude Code Action runs on GitHub-hosted runner,    │
│  implements the fix, and opens a PR with             │
│  "Closes #N". Human reviews before merge.            │
│                                                       │
│  Data corrections still flow through the 12h          │
│  github_issues step and LLM Council.                 │
└─────────────────────────────────────────────────────┘
```

## What the AI Searches

| Source | URL | What It Fetches | How |
|---|---|---|---|
| World Bank API | api.worldbank.org/v2/country/EGY/indicator/DT.DOD.DECT.CD | External debt + debt service time series (raw USD) | Direct API call, parse JSON, convert to billions |
| Ministry of Finance | mof.gov.eg | Budget totals (revenue, expenditure, deficit) | Fetch HTML, LLM extracts JSON |
| Wikipedia | en.wikipedia.org/wiki/Economy_of_Egypt | Budget data (USD-denominated) | Fetch HTML, LLM extracts structured data |
| Ahram Online | english.ahram.org.eg/News/562168.aspx | Minister names and titles | Fetch HTML, LLM extracts minister list |
| IMF DataMapper | imf.org/external/datamapper/api/v1 | GDP growth, inflation, debt projections | Direct API call, parse JSON |
| ExchangeRate API | open.er-api.com/v6/latest/USD | Live USD/EGP exchange rate | Direct API call |
| Central Bank of Egypt | cbe.org.eg | T-Bill rates | Fetch HTML, LLM extracts rates |
| CountryEconomy | countryeconomy.com/stock-exchange/egypt | EGX 30 stock index | Fetch HTML, LLM extracts value |
| parliament.gov.eg | parliament.gov.eg/MembersDetails.aspx?id=N | Individual MP names and details | Batch scrape, regex + LLM transliteration |
| Wikipedia (Parliament) | en.wikipedia.org/wiki/2025_Egyptian_parliamentary_election | Party seat counts | Fetch HTML, LLM extracts |
| IDA | ida.gov.eg | Industrial investment opportunities, complexes | Fetch HTML + web research, LLM extracts structured data |
| GAFI | gafi.gov.eg | Free zones, investment zones | Fetch HTML + web research, LLM extracts structured data |
| FAO/FAOLEX | faolex.fao.org/docs/pdf/egy127542e.pdf | Constitution full text (247 articles) | pdf-parse extracts text, LLM structures articles |
| Constitute Project | constituteproject.org/constitution/Egypt_2019 | Constitution reference/verification | Referenced as data source |
| RSS / Google News | /api/news proxy (Next.js route) | Egyptian news headlines, bilingual | 7 RSS feeds; LLM web search supplements |
| GitHub Issues | github.com/Ba3lisa/mizan/issues | Community data corrections | GitHub API + LLM parsing + LLM Council vote |

## Data Sources by Category

### Debt Data
- **Primary**: World Bank API (free, no auth) -- `DT.DOD.DECT.CD` (debt stock) and `DT.TDS.DECT.CD` (debt service) indicators for Egypt
- **Secondary**: Central Bank of Egypt (cbe.org.eg) -- quarterly reports
- **Validation**: IMF country data (imf.org/en/Countries/EGY)
- **Refresh**: Fully automated via World Bank API. Fetches both debt stock and debt service, converts USD to billions, upserts records. Preserves domestic debt and GDP ratio from existing records when present.
- **Interest rate data**: The `debtByCreditor` table stores per-creditor terms including `interestRate`, `annualDebtService`, and `maturityYears`. These are backfilled via the `debtInterestData:backfillCreditorTerms` function.
- **Specific URLs**:
  - Debt stock: `https://api.worldbank.org/v2/country/EGY/indicator/DT.DOD.DECT.CD?format=json`
  - Debt service: `https://api.worldbank.org/v2/country/EGY/indicator/DT.TDS.DECT.CD?format=json`
  - GDP data: `https://api.worldbank.org/v2/country/EGY/indicator/NY.GDP.MKTP.CD?format=json`
  - Reserves: `https://api.worldbank.org/v2/country/EGY/indicator/FI.RES.TOTL.CD?format=json`

### Budget Data
- **Primary**: Ministry of Finance (mof.gov.eg) + Wikipedia Economy of Egypt article
- **Parsing**: The primary LLM provider extracts structured JSON from MOF and Wikipedia HTML, pulling fiscal year totals for revenue, expenditure, deficit, and GDP. Schemas enforced via `BudgetDataSchema` and `BudgetWikipediaSchema` (see Structured Output Schemas below).
- **Content hashing**: The agent hashes the fetched page content and stores it in `dataRefreshLog.contentHash`. If the hash matches the previous refresh, parsing is skipped entirely (zero AI cost for unchanged pages)
- **Validation**: Totals must sum correctly (revenue items = total revenue)
- **Refresh**: Semi-automated (LLM parses, human reviews changes)
- **Specific URLs**:
  - Ministry of Finance: `https://www.mof.gov.eg`
  - Wikipedia (USD-denominated): `https://en.wikipedia.org/wiki/Economy_of_Egypt`

### Government/Cabinet Data
- **Primary**: Wikipedia Madbouly Cabinet page -- comprehensive, regularly updated list of all cabinet ministers. Used because cabinet.gov.eg is a JS-rendered SPA inaccessible to server-side fetch.
- **Fallback**: Ahram Online (english.ahram.org.eg) -- English-language coverage of cabinet reshuffles
- **Parsing**: The primary LLM provider extracts minister names and portfolios from the Wikipedia/Ahram HTML. Schemas enforced via `CabinetDataSchema` and `GovernorsDataSchema`.
- **Auto-write**: The government refresh auto-writes via `upsertOfficialAndMinistry` mutation when the LLM detects minister changes
- **Validation**: Cross-referenced with State Information Service (sis.gov.eg)
- **Specific URLs**:
  - Wikipedia (primary): `https://en.wikipedia.org/wiki/Madbouly_Cabinet`
  - Ahram Online (fallback): `https://english.ahram.org.eg/News/562168.aspx`
  - SIS: `https://www.sis.gov.eg/section/352/7510?lang=en`

### Parliament Data
- **Composition**: Wikipedia API (2025 Egyptian parliamentary election article) -- party seat counts and election metadata extracted via the primary LLM provider. Schema enforced via `ParliamentCompositionSchema`.
- **Member names**: parliament.gov.eg individual member pages (`/MembersDetails.aspx?id=N`) -- scraped via regex + LLM transliteration. The main listing page is a JS-rendered SPA, but individual member detail pages return server-rendered HTML accessible to fetch.
- **Pipeline**: The parliament scraper uses Convex scheduler to chain batches (avoids action timeout). Each batch fetches a range of member IDs, extracts names via regex, and upserts records.
- **Validation**: Member count must equal 596 (House) or 300 (Senate)
- **Specific URLs**:
  - Wikipedia (composition): `https://en.wikipedia.org/wiki/2025_Egyptian_parliamentary_election`
  - Individual member pages: `https://www.parliament.gov.eg/MembersDetails.aspx?id={N}`
  - Senate: `https://www.senategov.eg/en/Members`

### Economy Data
- **Primary**: World Bank API (GDP, inflation, unemployment indicators), IMF DataMapper API (projections through 2030)
- **Exchange rate**: ExchangeRate API (`open.er-api.com/v6/latest/USD`) for live USD/EGP rate
- **Interest rates**: Central Bank of Egypt T-Bill rates (`cbe.org.eg`), Banque Misr certificate rates
- **Stock index**: EGX 30 value from CountryEconomy (`countryeconomy.com/stock-exchange/egypt`) and Egyptian Exchange (`egx.com.eg`)
- **Schemas**: `IMFIndicatorsExtractionSchema`, `InterestRateSchema`, `BankRatesSchema`, `StockIndexSchema`, `EconomicNarrativeSchema`
- **Specific URLs**:
  - World Bank indicators: `https://api.worldbank.org/v2/country/EGY/indicator`
  - IMF DataMapper: `https://www.imf.org/external/datamapper/api/v1`
  - ExchangeRate API: `https://open.er-api.com/v6/latest/USD`
  - CBE T-Bills: `https://www.cbe.org.eg/en/economic-research/statistics/egp-t-bills-secondary-market`
  - Banque Misr: `https://www.banquemisr.com/en/SMEs/Retail-Banking/Accounts-And-Deposits/Certificates`
  - CountryEconomy: `https://countryeconomy.com/stock-exchange/egypt`

### Governorate Stats Data
- **Primary**: Wikipedia Governorates of Egypt articles (population, area, HDI rankings)
- **Schema**: `GovernorateEnrichmentSchema`
- **Specific URLs**:
  - Governorates: `https://en.wikipedia.org/wiki/Governorates_of_Egypt`
  - HDI Rankings: `https://en.wikipedia.org/wiki/List_of_governorates_of_Egypt_by_Human_Development_Index`

### Industry / Investment Data
- **Primary**: IDA (Industrial Development Authority) -- industrial complexes, investment opportunities map, incentives
- **Secondary**: GAFI (General Authority for Free Zones and Investment) -- free zones, investment zones
- **Deep scraping**: Two-pass approach. Pass 1 fetches opportunity listings. Pass 2 enriches with cost estimates, incentive details, and licensing steps using web research via server tools.
- **Schemas**: `IDAOpportunitiesSchema`, `GAFIOpportunitiesSchema`, `IndustrialBenchmarksSchema`, `CostEstimatesSchema`, `IDAComplexesSchema`, `GAFIZonesSchema`, `InvestmentIncentivesSchema`
- **Specific URLs**:
  - IDA main: `https://www.ida.gov.eg`
  - IDA industrial complexes: `https://www.ida.gov.eg/ar/industrial-complexes`
  - IDA investment map: `https://www.ida.gov.eg/ar/investmap`
  - IDA incentives PDF: `https://www.ida.gov.eg/uploads/files/pdfs/QR_PDF/Investment%20incentives%20(english)%202025.pdf`
  - GAFI free zones: `https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/FreeZones.aspx`
  - GAFI industrial zones: `https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/Industrial-Zones.aspx`
  - Golden License Program: `https://www.goldenlicense.gov.eg/`
  - Invest in Egypt: `https://www.investinegypt.gov.eg/English/pages/sectorandgeographies.aspx`

### Constitution Data
- **Primary**: FAO/FAOLEX PDF of the Egyptian constitution
- **Extraction**: If the database has fewer than 247 articles, the agent downloads the PDF from `faolex.fao.org/docs/pdf/egy127542e.pdf`, extracts text using `pdf-parse`, then sends the raw text to the primary LLM provider to structure it into individual articles with part/chapter grouping. Schema enforced via `ConstitutionExtractionSchema`.
- **Secondary reference**: Constitute Project (`constituteproject.org/constitution/Egypt_2019`)
- **Validation**: Article count must equal 247
- **Refresh**: Only triggered when article count is below 247 (effectively a one-time load)

### Economy Data
- **Primary**: World Bank API — multiple indicators for Egypt:
  - GDP growth (`NY.GDP.MKTP.KD.ZG`), Inflation (`FP.CPI.TOTL.ZG`), Unemployment (`SL.UEM.TOTL.ZS`), Reserves (`FI.RES.TOTL.CD`), and others
- **Forecasts**: IMF DataMapper API — GDP, inflation, debt/GDP forecasts through 2030
- **Exchange rate**: Frankfurter API (`api.frankfurter.app/latest?from=USD&to=EGP`) — live daily rate
- **Stock index**: CountryEconomy (`countryeconomy.com/stock-exchange/egypt`) — EGX 30 index
- **Refresh**: Fully automated. Indicators skipped if still fresh (< staleness threshold). IMF forecasts seeded once.

### Governorate Stats
- **Source**: Claude web research — LLM searches for economic stats per governorate
- **Data**: Population, GDP contribution, key industries, employment indicators
- **Refresh**: Each 12h run; uses `callLLMWebResearchStructured` with a Zod-verified schema

### Industry Data
- **IDA** (Egyptian Industrial Development Authority): Investment opportunity listings, industrial complexes
- **GAFI** (General Authority for Investment): Free zones, investment incentive areas
- **Benchmarks**: AI-generated industrial cost benchmarks (research + structured extraction)
- **Cost estimates**: Unpriced opportunities get AI cost estimates based on benchmarks
- **Refresh**: Automated. Deep scrape pipeline: Pass 1 (structure discovery) → Pass 2 (enrichment + cost estimation)

### News Headlines
- **RSS feeds**: 7 feeds via Next.js API proxy at `/api/news`:
  - Google News (English + Arabic, Egypt-filtered)
  - Daily News Egypt, Egypt Independent (Egypt-only outlets)
  - Al-Monitor, BBC Middle East, NYT Middle East (filtered for Egypt keywords)
- **LLM supplement**: Pipeline `news` step uses `callLLMWebResearchStructured` to find headlines beyond RSS
- **Storage**: `newsHeadlines` table; entries older than 7 days are purged automatically
- **Frontend**: `NewsTicker` component on homepage fetches `/api/news` directly (client-side, 15-min cache)

### Election Data
- **Primary**: National Elections Authority (elections.eg)
- **Secondary**: State Information Service (sis.gov.eg)
- **Status**: Updated after each election cycle
- **URLs**:
  - Elections authority: `https://www.elections.eg`
  - 2024 results: `https://www.sis.gov.eg/section/10/7527?lang=en`

## Deterministic Validators

Located in `convex/agents/validators.ts`:

| Validator | What it checks |
|-----------|---------------|
| `validateBudgetTotals` | Budget items sum to expected total (±0.01 tolerance) |
| `validateParliamentCounts` | House = 596, Senate = 300 |
| `validateDebtRecord` | No negative values, GDP ratio < 500% (wide safety band) |
| `parseWorldBankResponse` | Parses World Bank API v2 format, filters nulls |
| `extractClaudeText` | Extracts text from Anthropic Claude API response |

## Data Refresh Log

Every refresh operation is logged to the `dataRefreshLog` table:

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | "government", "parliament", "budget", "debt", "economy", "governorate_stats", "industry", "constitution", "all" |
| `status` | string | "in_progress", "success", "failed" |
| `recordsUpdated` | number | How many records changed |
| `sourceUrl` | string | Which URL was fetched |
| `errorMessage` | string | Error details if failed |
| `contentHash` | string | SHA-256 hash of fetched content (used to skip re-parsing unchanged pages) |
| `startedAt` | number | Timestamp when refresh started |
| `completedAt` | number | Timestamp when completed |

## Queries for Frontend

| Query | File | Purpose |
|-------|------|---------|
| `getLastUpdated` | `dataRefresh.ts` | Get last successful refresh time for a category |
| `getAllLastUpdated` | `dataRefresh.ts` | Get freshness status for all categories |
| `getRefreshHistory` | `dataRefresh.ts` | Get last N refresh attempts for a category |

## Content Hashing

To avoid unnecessary AI API calls, the pipeline uses content hashing on fetched pages:

1. When a page is fetched (e.g., the MOF open data page), the raw HTML is SHA-256 hashed
2. The hash is stored in the `dataRefreshLog` record's `contentHash` field
3. On the next refresh cycle, the agent fetches the page again and computes a new hash
4. If the hash matches the previous successful refresh, LLM parsing is skipped entirely
5. This means unchanged pages cost zero AI tokens -- only the HTTP fetch is performed

This is particularly valuable for the budget page, which may only change once per fiscal year but is checked every 12 hours.

## LLM Provider Registry

Located in `convex/agents/providers/registry.ts`. The pipeline is provider-agnostic -- it routes all LLM calls through a registry that auto-detects available providers from environment variables.

### Priority Order

| Priority | Provider | Env Var | Default Model | Server Tools (web search) |
|----------|----------|---------|---------------|--------------------------|
| 1 | xAI (Grok) | `XAI_API_KEY` | `grok-4-1-fast-reasoning` | Yes (Responses API) |
| 2 | OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` | No |
| 3 | Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | Yes (web_search + web_fetch) |
| 4 | Google (Gemini) | `GOOGLE_AI_API_KEY` | `gemini-2.0-flash` | No |
| 5 | OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-4-scout` | No |

### Routing

- **Pipeline operations**: Uses the highest-priority available provider (`getPrimaryProvider()`).
- **LLM Council votes**: Uses ALL available providers -- each casts an independent vote.
- **Server tools (web search)**: Routes to the highest-priority provider that supports them (currently xAI or Anthropic).

### Provider Interface

Every provider implements the `LLMProvider` interface defined in `convex/agents/providers/types.ts`:

| Method | Description |
|--------|-------------|
| `callLLM` | Basic text completion |
| `callLLMStructured<T>` | Structured output via tool_use / function calling |
| `evaluateDataChange` | Council vote evaluation |
| `callLLMWithUsage` | Text completion with token usage tracking |
| `callLLMStructuredWithUsage<T>` | Structured output with usage tracking |
| `callLLMWithServerTools` | Text completion with server-side tools (web search) |
| `callLLMWebResearchStructured<T>` | Two-step: web research then structured parsing |

### Provider Files

| File | Provider |
|------|----------|
| `convex/agents/providers/registry.ts` | Vercel AI SDK provider registry for xAI, OpenAI, Anthropic, Google, and OpenRouter |
| `convex/agents/providers/types.ts` | Shared TypeScript interfaces |
| `convex/agents/providers/councilPrompt.ts` | Shared council evaluation prompt |

## Structured Output Schemas

Located in `convex/agents/schemas.ts`. Every LLM call in the pipeline uses a Zod schema from this file. The schemas serve three purposes:

1. **Generate JSON Schema** for structured LLM output (tool_use / function calling)
2. **Runtime validation** of LLM responses before upserting to Convex
3. **TypeScript type inference** for pipeline code

### Schema Catalog

| Schema | Category | Fields |
|--------|----------|--------|
| `BudgetDataSchema` | Budget | fiscalYear, totalRevenue, totalExpenditure, deficit, gdp, sourceUrl |
| `BudgetWikipediaSchema` | Budget | fiscalYear, revenueUsd, expenditureUsd, deficitUsd, gdpNominalUsd |
| `CabinetDataSchema` | Government | officials[] (nameEn, nameAr, titleEn, titleAr, role, ministry) |
| `GovernorsDataSchema` | Government | governors[] (nameEn, nameAr, titleEn, titleAr, governorate) |
| `ParliamentCompositionSchema` | Parliament | parties[] (nameEn, nameAr, seats, color, isRuling), totalSeats |
| `NameTransliterationSchema` | Parliament | translations[] (id, nameEn) |
| `IMFIndicatorsExtractionSchema` | Economy | indicators[] (indicator, data: year→value) |
| `InterestRateSchema` | Economy | rate, tenor, date, sourceUrl |
| `BankRatesSchema` | Economy | oneYear, threeYear, savingsRate, sourceUrl |
| `StockIndexSchema` | Economy | value, change, changePercent, date |
| `EconomicNarrativeSchema` | Economy | titleEn/Ar, summaryEn/Ar, insights[] |
| `ConstitutionExtractionSchema` | Constitution | articles[] (articleNumber, textEn, textAr, part, chapter) |
| `IDAOpportunitiesSchema` | Industry | opportunities[] (externalId, name, sector, governorate, cost, area) |
| `GAFIOpportunitiesSchema` | Industry | opportunities[] (externalId, name, type, governorate, cost) |
| `IndustrialBenchmarksSchema` | Industry | benchmarks (land, construction, labor, utility costs by region) |
| `CostEstimatesSchema` | Industry | estimates[] (nameEn, costEgp, breakdown, methodology) |
| `IDAComplexesSchema` | Industry | complexes[] + incentives (sectorA/B) |
| `GAFIZonesSchema` | Industry | freeZones[] + registrationFees + investmentLaw |
| `InvestmentIncentivesSchema` | Industry | generalIncentives, sectorA/B, licensingSteps[], freeZoneBenefits |
| `GovernorateEnrichmentSchema` | Governorate | governorates[] (population, area, hdi, unemployment, literacy) |
| `CouncilVoteSchema` | Council | vote, confidence, reasoning, sourceVerified |
| `GitHubIssueClassificationSchema` | GitHub | valid, reason, page, dataPoint, sourceUrl, confidence |
| `NewsExtractionSchema` | News | headlines[] (titleEn/Ar, category, sourceUrl) |
| `RawNewsListSchema` | News | items[] (title, url, source) |

### Zod-to-JSON-Schema Conversion

The `zodToToolSchema()` utility in `schemas.ts` converts Zod schemas to the JSON Schema format required by LLM function calling / tool_use APIs. This is used by all providers.

## Output Verification

Located in `convex/agents/verify.ts`. All LLM responses pass through verification before being written to Convex.

### Functions

| Function | Description |
|----------|-------------|
| `verifyLLMOutput(schema, raw, category)` | Validates parsed JSON against a Zod schema. Returns typed data or error with details. |
| `parseAndVerify(text, schema, category)` | Parses free-form LLM text into JSON (handles markdown fences, prose wrapping), then validates against schema. |

### Verification Flow

1. LLM returns structured output (via tool_use / function calling) or free-form text
2. For structured output: `verifyLLMOutput()` validates directly against the Zod schema
3. For free-form text: `parseAndVerify()` strips markdown fences, extracts JSON, then validates
4. On success: returns typed `{ ok: true, data: T }`
5. On failure: returns `{ ok: false, errors: string[], raw: unknown }` with per-field error messages
6. All results are logged with `[verify/<category>]` prefix for audit trail

## Token Cost Tracking

Located in `convex/lib/tokenCost.ts`. Tracks estimated USD cost per LLM call based on model pricing.

### Supported Models and Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| `grok-4-1-fast-reasoning` | $0.20 | $0.50 |
| `grok-4-1-fast-non-reasoning` | $0.20 | $0.50 |
| `grok-4.20-0309-non-reasoning` | $2.00 | $6.00 |
| `claude-haiku-4-5-20251001` | $0.80 | $3.20 |
| `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-5.4-mini` | $0.20 | $0.80 |
| `gemini-2.0-flash` | $0.075 | $0.30 |
| `meta-llama/llama-4-scout` | $0.15 | $0.60 |

Usage is logged to the `apiUsageLog` table via `internal.usage.logApiUsage` after each LLM call, including provider name, model, token counts, estimated cost, and duration.

## Setup

1. Set at least one LLM API key in Convex dashboard (Settings -> Environment Variables). Priority order: `XAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`
2. The model used depends on which provider is configured -- see LLM Provider Registry above for defaults
3. For multi-model LLM Council voting, set multiple API keys (each provider casts an independent vote)
4. Without any API key, World Bank/IMF API data still refreshes (no auth needed), but LLM-powered parsing is skipped
5. Cron job runs automatically every 12 hours
6. Manual trigger (internal): `npx convex run agents/dataAgent:orchestrateRefresh`
7. Manual trigger (public action): `npx convex run agents/dataAgent:triggerRefresh` -- schedules the internal orchestrator via `ctx.scheduler.runAfter(0, ...)`

## Graceful Degradation

- If no LLM API key is configured → skip AI parsing, log warning, use cached data
- If the primary LLM provider fails → error is logged, but other categories continue (each category is independent)
- If World Bank API is down → log failure, retain existing data
- If a government website is unreachable → log failure, flag for human review
- If Zod schema validation fails → reject the LLM output, keep existing records, log per-field errors
- If `DISABLE_CRONS=true` is set → orchestrator exits immediately without running any refreshes

## Alerting

A GitHub Actions workflow (`health-check.yml`) runs every 12 hours and checks that each data category has been refreshed within the last 48 hours. If any category is stale, the workflow creates a GitHub issue automatically to flag the problem.

## Log Compaction

A daily cron job (`agents/maintenance.compactRefreshLogs`) deletes `dataRefreshLog` entries older than 30 days to prevent unbounded table growth. This runs independently of the 12-hour refresh cycle.

## Sanad Reference Confidence System

Sanad (سند — Arabic for "support" or "chain of authority") is the 5-level reference confidence system used across Mizan. Every data point displayed on the platform carries a Sanad level indicating how much trust should be placed in it based on its source.

### The 5 Levels

| Level | Key | Name (EN) | Name (AR) | Description |
|-------|-----|-----------|-----------|-------------|
| 1 | `gov_eg` | Official Government | حكومي رسمي | Direct from gov.eg domains (CAPMAS, Ministry of Finance, CBE, SIS) |
| 2 | `international_org` | International Organization | منظمة دولية | World Bank, IMF, UNDP, Transparency International, FAO |
| 3 | `news_media` | News & Media | أخبار وإعلام | Ahram Online, State Information Service, EgyptToday, Reuters |
| 4 | `other` | Other Sources | مصادر أخرى | Wikipedia, academic papers, community-submitted data |
| 5 | `derived` | Derived/Calculated | محسوب/مشتق | Computed from other data points (e.g., debt-to-GDP ratio, per-capita figures) |

### Mapping to `dataSources.type`

The Sanad levels map directly to the existing `type` field on the `dataSources` table used by the pipeline:

| `dataSources.type` | Sanad Level |
|---------------------|-------------|
| `gov_eg` | 1 — Official Government |
| `international_org` | 2 — International Organization |
| `media` | 3 — News & Media |
| `other` | 4 — Other Sources |
| (no source record — computed inline) | 5 — Derived/Calculated |

When the pipeline refreshes data, the Sanad level is determined by the `type` of the `dataSources` entry that provided the value. Derived values (level 5) are computed from other stored data and do not have their own source record — instead they reference the Sanad levels of their input values.

### Conflict Resolution

When multiple sources report different values for the same data point (e.g., World Bank and CAPMAS report different GDP figures), Mizan does NOT pick a winner. Instead:

- ALL values are displayed on the page, each tagged with its Sanad level
- The user sees the full picture and can judge for themselves
- Higher Sanad levels (lower numbers) appear first but are not marked as "correct"
- The discrepancy itself is valuable transparency information

This approach ensures Mizan remains a mirror of available data rather than an arbiter of truth.

### The Only Opinionated Part

The assignment of Sanad levels to source types is the ONLY opinionated decision in Mizan. The hierarchy itself (government sources ranked above international organizations, which rank above media, etc.) reflects an editorial judgment about source reliability.

Everything else on the platform — the data values, the visualizations, the comparisons — is presented without editorial interpretation.

### Future: Automated Sanad Scoring via LLM Council

The current manual assignment of Sanad levels will be replaced by automated scoring through the LLM Council (see below). The council will:

1. Evaluate each source URL against known domain patterns and content quality signals
2. Cross-reference claims across multiple sources to detect conflicts
3. Assign Sanad levels through multi-model consensus voting
4. Flag sources whose reliability has changed (e.g., a government page that starts returning stale data)

This will remove the last remaining human opinion from the platform, making Mizan fully non-opinionated.

## LLM Council System

The LLM Council is a multi-model voting system that verifies community-submitted data corrections before they are applied to the database. It adds a layer of automated fact-checking between community input and data changes.

### Current Configuration

The council uses ALL available LLM providers to cast independent votes. Each provider configured via environment variable participates automatically. Currently supported providers: xAI (Grok), OpenAI (GPT), Anthropic (Claude), Google (Gemini), and OpenRouter (any model). Every provider implements `evaluateDataChange()` using the shared `CouncilVoteSchema` (Zod-validated structured output) and `councilPrompt.ts` for consistent evaluation criteria.

### Source Classification

Every data correction includes a source URL. The council classifies sources into tiers that determine how much automated trust they receive:

| Source Type | Domain Pattern | Trust Level | Council Behavior |
|---|---|---|---|
| `gov_eg` | *.gov.eg, *.eg official domains | Auto-high | Council votes with high prior confidence; single model approval sufficient |
| `international_org` | worldbank.org, imf.org, transparencyintl.org | Auto-medium | Council votes normally; majority approval required |
| `media` | Major news outlets (ahram, reuters, bbc) | Low / estimated | Council votes with skepticism; unanimous approval required, data marked as "estimated" if applied |
| `other` | Any other domain | Needs human review | Council may vote but result is advisory only; human approval always required regardless of vote outcome |

### Decision Matrix

Votes are tallied differently depending on the source classification:

- **gov_eg sources**: A single `approve` vote from any council member is sufficient. The assumption is that official Egyptian government sources are authoritative for their own data.
- **international_org sources**: Majority of council members must vote `approve`. Abstentions do not count against the threshold.
- **media sources**: All council members must vote `approve` (unanimous). Any `reject` vote blocks the change. Applied data is tagged with `confidence: "estimated"` rather than `confidence: "verified"`.
- **other sources**: Council votes are recorded but treated as advisory. The change is always routed to human review regardless of the vote outcome.

For all source types, if a council member votes `reject` with a reasoning that cites a contradicting official source, the change is automatically blocked and flagged for human review.

### Integration with GitHub Issues

> **Note (v1.9.3+):** The standalone `processGitHubIssues` Convex cron has been removed. `bug` and `enhancement` issues are now handled by the GitHub Actions Claude Code Action (`.github/workflows/claude-fix.yml`) which creates fix PRs automatically. However, `data-correction` issues are still processed by the `github_issues` step inside `orchestrateRefresh` (step 10 of the 12h pipeline), which runs the LLM Council verification flow described below.

The council is the middle step in the community data-correction pipeline:

1. A community member opens a GitHub Issue with label `data-correction`, including the incorrect value, the proposed correct value, and a source URL
2. The GitHub Agent ingests the issue, runs spam detection (rate limiting, duplicate checking, source URL validation), and classifies it
3. If the issue passes spam checks, it is submitted to the LLM Council as a `councilSession`
4. Each council provider evaluates the change independently, producing a vote and reasoning
5. Votes are recorded in the `councilVotes` table and tallied according to the decision matrix above
6. The final decision is recorded in the `councilSessions` table
7. Approved changes are applied to the data layer (or queued for human review if the source type or data category requires it)
8. The original GitHub issue is updated with the council's decision and reasoning

### High-Sensitivity Data Categories

Certain data categories always require human approval, even if the council unanimously approves:

- Government officials (cabinet ministers, governors)
- Election results
- Constitutional articles
- Any change that would modify more than 10 records at once

### Extending the Council

To add a new LLM provider:

1. Create a new file in `convex/agents/providers/` (e.g., `newprovider.ts`)
2. Implement the `LLMProvider` interface from `convex/agents/providers/types.ts`, including:
   - `callLLM`, `callLLMStructured`, `callLLMWithUsage`, `callLLMStructuredWithUsage`
   - `evaluateDataChange()` using the shared `CouncilVoteSchema` from `convex/agents/schemas.ts` and `buildCouncilPrompt()` from `convex/agents/providers/councilPrompt.ts`
   - Output: vote (`approve` / `reject` / `abstain`), confidence (`high` / `medium` / `low`), reasoning text, sourceVerified boolean
3. Add the provider to the `PROVIDER_REGISTRY` array in `convex/agents/providers/registry.ts` with its env var key, default model, and priority position
4. Add the provider's model(s) to `convex/lib/tokenCost.ts` for cost tracking
5. Set the provider's API key as a Convex environment variable
6. The registry will automatically include the new provider in pipeline operations and council sessions
