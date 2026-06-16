# Convex Cost Analysis — Mizan

> Last updated: 2026-04-17
> Status: Development mode (numbers may be inflated by frequent deploys/hot reloads)

## Current Plan: Free & Starter

| Resource | Free Limit | Overage Cost |
|----------|-----------|-------------|
| Database I/O | 1 GB/month | $0.22/GB |
| Database Storage | 0.5 GB | $0.22/GB/month |
| Function Calls | 1M/month | $2.20/1M |
| Data Egress | 1 GB/month | $0.132/GB |
| Action Compute | 20 GB-hours | $0.33/GB-hour |

Source: [Convex Pricing](https://www.convex.dev/pricing)

---

## Bandwidth Audit Summary

### Critical: Queries that read entire tables just to count rows

Convex has no native `COUNT(*)`. The codebase uses `.collect()` on entire tables and checks `.length` — this reads every byte of every document just to get a number.

| Query | File | Tables Collected | Est. Size/Call | Subscribed? |
|-------|------|-----------------|----------------|-------------|
| `adminDashboard.getDataOverview` | `adminDashboard.ts` | 12 tables (take 10000 each) incl. dataChangeLog | 2–8 MB | Yes — transparency page |
| `transparency.getCategoryHealth` | `transparency.ts` | 10 tables (full collect) incl. constitutionArticles | 1–3 MB | Yes — transparency page |
| `government.getHomeStats` | `government.ts` | constitutionArticles + parliamentMembers + governorates | ~1.5 MB | Yes — **homepage (all visitors)** |
| `constitution.listAllArticles` | `constitution.ts` | constitutionArticles (247 articles, full text) | ~1.2 MB | Yes — constitution page |

**Why this matters:** These are real-time subscriptions (`useQuery`). Every write to any of the collected tables triggers a full re-read. During a pipeline run, `dataChangeLog` is written to every few seconds — causing `getDataOverview` to re-execute its 12-table scan for every transparency page visitor on every write.

### High: N+1 Query Patterns

| Query | File | Pattern | Impact |
|-------|------|---------|--------|
| `parliament.listMembers` | `parliament.ts` | 596 members → 3 joins each = 2,384 reads | Parliament page subscription |
| `parliamentQueries.upsertMember` | `parliamentQueries.ts` | 4 full collects × N scraped members | Pipeline mutation (not subscription) |
| `parliamentQueries.updatePlaceholderWithRealName` | `parliamentQueries.ts` | 3 full collects per call × N members | Pipeline mutation |

### Medium: Unbounded Pipeline Log Reads

| Query | File | Pattern | Impact |
|-------|------|---------|--------|
| `transparency.getRefreshTimeline` | `transparency.ts` | `take(500)` on dataRefreshLog, in-memory filter | Transparency page subscription |
| `transparency.getRecentActivity` | `transparency.ts` | 20 logs × 50 change entries each | Transparency page subscription |
| `maintenance.deleteOldRefreshLogs` | `maintenance.ts` | Full collect on dataRefreshLog (no time filter) | Daily cron |

### High Frequency: Pipeline Progress

| Query | File | Pattern | Impact |
|-------|------|---------|--------|
| `pipelineProgress.getProgress` | `pipelineProgress.ts` | `.collect()` all progress rows | **Homepage** — every visitor subscribes, re-fires 12+ times per pipeline run |
| `pipelineProgress.updateStep` | `pipelineProgress.ts` | ~~`.collect()` + JS `.find()`~~ **Fixed**: uses `by_runId_and_step` index + `.unique()` | Called every few seconds during pipeline run |

---

## Estimated Monthly Bandwidth (Production)

### Assumptions
- 100 daily visitors, avg 2 pages each
- Pipeline runs 2×/day (every 12h), each run writes ~50 change log entries
- 10% of visitors view transparency page, 20% view constitution

### Per-Visit Database I/O

| Page | Queries | Est. Initial Read | Re-reads/visit |
|------|---------|-------------------|----------------|
| Homepage | getHomeStats + getProgress | ~1.8 MB | 1–2 (if pipeline active) |
| Transparency | 4 queries (health + overview + activity + sources) | ~8 MB | 10+ during pipeline run |
| Constitution | listAllArticles + listAmendedArticles + listParts | ~2.5 MB | Rare |
| Parliament | listMembers + stats (both chambers) | ~3 MB | Rare |
| Budget | getBudgetSankeyData + breakdown | ~0.5 MB | Rare |

### Monthly Estimate

| Source | Calculation | Est. I/O |
|--------|------------|----------|
| Homepage visits | 100/day × 1.8 MB × 30 | ~5.4 GB |
| Transparency page | 10/day × 8 MB × 30 | ~2.4 GB |
| Pipeline re-triggers (subscriptions) | 4 runs/day × 50 writes × 10 subs × 3 MB avg × 30 | ~18 GB |
| Constitution page | 20/day × 2.5 MB × 30 | ~1.5 GB |
| Parliament page | 15/day × 3 MB × 30 | ~1.4 GB |
| Pipeline mutations | 4 runs/day × pipeline reads × 30 | ~2 GB |
| **Total** | | **~30 GB/month** |

### Cost at Current Plan

| Resource | Usage | Free Limit | Overage | Cost |
|----------|-------|-----------|---------|------|
| Database I/O | ~30 GB | 1 GB | 29 GB × $0.22 | **$6.38/month** |
| Function Calls | ~500K | 1M | 0 | $0 |
| Data Egress | ~2 GB | 1 GB | 1 GB × $0.132 | $0.13 |

**Note:** During development with hot reloads, bandwidth can be 5–10x higher since every file save triggers all subscriptions to re-execute.

---

## Optimization Roadmap

### P0 — Critical (saves ~70% of I/O)

1. **Replace count-only collects with counter documents**
   - Create a `_counters` table with one document per tracked table
   - Increment/decrement on insert/delete via internal mutations
   - `getCategoryHealth` and `getDataOverview` read 6 small counter docs instead of scanning 10–12 full tables
   - **Estimated savings: 15–20 GB/month**

2. **Remove `getDataOverview` subscription from transparency page**
   - The transparency page already has `getCategoryHealth` — `getDataOverview` is redundant
   - If table-level breakdowns are needed, create a lightweight `getTableCounts` query using the counter documents
   - **Estimated savings: 5–10 GB/month**

3. **Stop collecting constitutionArticles just for counting**
   - `getHomeStats` should use a counter document, not read 247 full-text articles
   - This fires on every homepage visit
   - **Estimated savings: 3–5 GB/month**

### P1 — High (saves ~15% of I/O)

4. ~~**Add `by_runId_and_step` index to pipelineProgress**~~ **DONE**
   - Index added to schema and `updateStep` now uses `.withIndex("by_runId_and_step", ...)`.unique()`

5. **Use `by_wasAmended2019` index in `listAmendedArticles`**
   - Index exists in schema but `constitution.ts:listAmendedArticles` still collects all 247 articles and filters in memory
   - Fix: `.withIndex("by_wasAmended2019", q => q.eq("wasAmended2019", true))` — reads only ~20 amended articles

6. **Fix `listMembers` N+1 pattern**
   - Batch-fetch unique parties and governorates first, then map
   - Reduces ~2,384 reads to ~630

### P2 — Medium (saves ~10% of I/O)

7. **Fix `getRefreshTimeline` to use index filter**
   - Use `by_category_and_startedAt` index with a time range instead of `take(500)` + in-memory filter

8. **Fix `maintenance.deleteOldRefreshLogs` to use time filter**
   - Filter by `startedAt` range using existing index instead of collecting everything

9. **Consider pagination for `listAllArticles`**
   - On constitution page, load article summaries first, full text on demand
   - Reduces initial load from ~1.2 MB to ~100 KB

---

## SEO Entity Pages — Cost Impact

### New dynamic pages (Phase 1 SEO)
~1,200 entity pages: 30 officials + 247 constitution articles + 27 governorates + 896 MPs

**How caching works:**
- Pages use ISR with `revalidate = 43200` (12 hours)
- First visit: 1 Convex query → HTML cached by Next.js
- Subsequent visits: served from cache → zero Convex cost
- After 12 hours: next visit re-fetches → re-caches

**Cost estimate per entity page query:**
- Official lookup: ~2 KB (1 record by slug)
- Article lookup: ~3 KB (1 record by number)
- Governorate lookup: ~1 KB (1 record by slug)

**Monthly estimate (100 daily visitors, 5% visit entity pages):**
- 5 entity page visits/day × 3 KB avg × 30 days = ~450 KB/month
- With ISR cache: even less since most visits hit cache
- **Impact: negligible — <1 MB/month additional**

**Worst case (Google bot crawls all 1,200 pages in one day):**
- 1,200 × 3 KB = 3.6 MB — still negligible

### Current actual costs (April 2026)
- **Pipeline API tokens used**: 16,161 (6 calls) — $0.04 total
- **Guide chat**: gpt-4.1-mini via Vercel AI SDK, $20/month budget cap enforced by `guide.ts:checkMonthlyCost`
- **Infrastructure**: Convex $10/mo + DigitalOcean $12/mo = $22/mo
- **Convex components**: `@convex-dev/rate-limiter` (guide message throttling) — included in Convex plan, adds to function calls and action compute
- **Total monthly burn**: ~$22/mo + API costs (pipeline + guide chat)

---

## Guide Chat — Cost Tracking

The guide chat (`guide.ts`, `guideActions.ts`) uses `gpt-4.1-mini` via Vercel AI SDK with a hard $20/month budget cap.

### How costs are tracked
- Every agent response logs tokens and estimated cost to the `chatUsage` table via `guideAnalytics.ts:logUsage`
- `guide.ts:checkMonthlyCost` sums all `chatUsage` rows since the 1st of the current month
- When `totalCostUsd >= 20`, the frontend should block new messages (`isOverBudget: true`)

### Cost table (`chatUsage`)
| Field | Purpose |
|-------|---------|
| `userId` | Optional session identifier |
| `threadId` | Agent thread ID |
| `model` | Model used (currently `gpt-4.1-mini`) |
| `provider` | Provider name (`openai`) |
| `promptTokens` / `completionTokens` | Token counts from the API response |
| `costUsd` | Estimated cost from `lib/tokenCost.ts:estimateCost` |
| `timestamp` | Unix ms, indexed for monthly aggregation |

### Rate limiting
`@convex-dev/rate-limiter` enforces per-session limits in `rateLimits.ts`:
- `guideMessage`: 1 message per 3 seconds (fixed window)
- `guideTokens`: 10,000 tokens/hour, burst capacity 30,000

### Note on pricing gap
`gpt-4.1-mini` is not in the `MODEL_PRICING` table in `lib/tokenCost.ts`. The `estimateCost` function returns `0` for unknown models, so guide chat costs are currently under-counted in `chatUsage`. The closest entry is `gpt-5.4-mini` ($0.20/$0.80 per 1M tokens).

---

## Model Pricing Reference (`lib/tokenCost.ts`)

All models tracked by the cost system, with per-1M-token pricing:

| Model | Input $/1M | Output $/1M | Used By |
|-------|-----------|------------|---------|
| `grok-4-1-fast-non-reasoning` | $0.20 | $0.50 | Pipeline (xAI, non-reasoning mode) |
| `grok-4-1-fast-reasoning` | $0.20 | $0.50 | Pipeline (xAI, default) |
| `grok-4.20-0309-non-reasoning` | $2.00 | $6.00 | Pipeline (xAI, higher-tier) |
| `claude-haiku-4-5-20251001` | $0.80 | $3.20 | Pipeline (Anthropic) |
| `claude-sonnet-4-20250514` | $3.00 | $15.00 | Pipeline (Anthropic, higher-tier) |
| `gpt-4o-mini` | $0.15 | $0.60 | Pipeline (OpenAI), Council |
| `gpt-4o` | $2.50 | $10.00 | Pipeline (OpenAI, higher-tier) |
| `gemini-2.0-flash` | $0.075 | $0.30 | Pipeline (Google) |
| `meta-llama/llama-4-scout` | $0.15 | $0.60 | Pipeline (OpenRouter) |
| `gpt-5.4-mini` | $0.20 | $0.80 | Pipeline (OpenAI, newer) |
| `gpt-4.1-mini` | **missing** | **missing** | Guide chat (not tracked — costs report as $0) |

Provider priority for pipeline: xAI (Grok) > OpenAI > Anthropic > Google > OpenRouter.

---

## Current Plan: Starter ($10/mo, capped at $20)

At current usage levels, the Starter plan is more than sufficient:
- Database I/O: well under 1 GB/month
- Function calls: ~50K/month (limit: 1M)
- The $10 spend includes development overhead

**Pro plan ($25/mo)** only needed if:
- Traffic exceeds 500 daily visitors AND
- Pipeline runs cause subscription re-triggers exceeding 50 GB I/O

---

## Monitoring

Track these metrics monthly:
- **Convex Dashboard** → Usage tab (https://dashboard.convex.dev)
- **Pipeline API costs** → `npx convex run usage:getCurrentMonthCost` (real-time from `apiUsageLog`)
- **Guide chat costs** → `npx convex run guide:checkMonthlyCost` (real-time from `chatUsage`, $20/mo cap)
- **Usage by purpose** → `npx convex run usage:getUsageByPurpose '{"days": 30}'`
- **Runway** → `npx convex run usage:getRunwaySummary` (uses fixed $22/mo infrastructure + pipeline API costs; does not yet include guide chat costs)
- Run `npx convex insights` (requires user auth, not deploy key)
