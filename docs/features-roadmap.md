# Mizan Feature Roadmap — Inspired by BuildCanada

## Mapping BuildCanada projects → Egyptian equivalents

### Already Built (Phase 1-5)
| BuildCanada | Mizan Equivalent | Status |
|---|---|---|
| Canada Spends | `/budget` — Budget breakdown with CanadaSpends-style visualization | ✅ Done |
| Election Tracker | `/elections` — Presidential + parliamentary results with Egypt map | ✅ Done |
| Builder MP (bill analysis) | `/parliament` — Member profiles, party composition, committees | ✅ Done |
| Economic Tracker | `/economy` — GDP, inflation, debt, reserves, EGX30, Suez Canal revenue | ✅ Done |
| Your Governorate | `/governorate/[slug]` — Governor, MPs, senators, stats per governorate | ✅ Done |
| Tax Calculator | `/tools/tax-calculator` — Income tax, social insurance, net salary | ✅ Done |
| Mashrou'ak | `/tools/mashroaak` — Entrepreneur investment simulator (مشروعك) | ✅ Done |
| Investment Simulator | `/tools/invest` — Investment growth calculator | ✅ Done |
| Buy vs Rent | `/tools/buy-vs-rent` — Homeownership vs renting calculator | ✅ Done |
| Funding Sources | `/funding` — Where Egypt's budget funding comes from | ✅ Done |
| Polls | `/polls` — Weekly AI-generated polls on government topics | ✅ Done |

### To Build Next

#### 1. "Where Your Tax Dollars Go" → `/budget/your-share`
**What**: Personal tax calculator — enter your annual income, see exactly where your taxes go
- Input: annual salary in EGP
- Calculate: income tax paid based on Egyptian tax brackets
- Output: breakdown of YOUR money → education (X EGP), health (X EGP), debt service (X EGP), defense (X EGP)...
- Visualization: personal pie chart + itemized list
- **Data needed**: Egyptian income tax brackets (available from Tax Authority)
- **Impact**: Makes budget data PERSONAL — "you paid 12,400 EGP to debt interest this year"

#### 2. "Outcomes Tracker" → `/promises`
**What**: Track government promises and commitments
- Presidential promises from campaign/inauguration speeches
- "Egypt Vision 2030" goals and progress
- Infrastructure megaprojects (New Administrative Capital, Suez Canal expansion, etc.)
- For each promise: date made, current status (not started / in progress / completed / stalled), evidence, source
- Visualization: progress bars, timeline, completion percentage
- **Data needed**: Official government plans, Vision 2030 reports (available from planning ministry)

#### 3. ~~"Trade/Economic Tracker" → `/economy`~~ ✅ Done
The `/economy` page is live with GDP, inflation, debt, forex reserves, EGX30 index, and Suez Canal revenue. Auto-refreshed via World Bank API and other sources.

#### 4. "Great Egyptian Builders" → `/figures`
**What**: Biographical profiles of significant Egyptian political/civic figures
- Current and historical leaders
- Key reformers, economists, activists
- Each profile: photo, bio, role, key achievements, controversies, sources
- **Data needed**: Curated from SIS, Wikipedia, academic sources

#### 5. ~~"Tax Calculator" → `/tools/tax-calculator`~~ ✅ Done
The `/tools/tax-calculator` page is live with Egyptian income tax brackets and social insurance calculation.

#### 6. "Legislation Tracker" → `/legislation`
**What**: Track laws passed by parliament
- Each law: number, title, date passed, sponsoring committee, status
- Timeline of a bill's journey through parliament
- Search/filter by topic, year, committee
- **Data needed**: Official Gazette (Al-Waqa'i al-Masriya), parliament session records

#### 7. "Corruption Perception" → `/transparency/corruption`
**What**: Egypt's corruption indices and transparency metrics
- Transparency International CPI score + historical trend
- Government accountability metrics
- Comparison with regional peers
- Freedom of press index
- **Data needed**: TI reports, World Bank governance indicators (all public APIs)

#### 8. ~~"Your Governorate" → `/governorate/[name]`~~ ✅ Done
The `/governorate/[slug]` pages are live, showing the governor, House MPs, and Senate members for each of Egypt's 27 governorates.

#### 9. "Automated Sanad Scoring" → LLM Council
**What**: LLM Council automatically determines Sanad confidence levels for data sources
- Currently Sanad levels are manually assigned (the only opinionated part of Mizan)
- LLM Council (multi-model voting) would evaluate source reliability
- Cross-reference multiple sources, detect conflicts, assign confidence
- Reduce human opinion in the confidence scoring process
- **Data needed**: Existing LLM Council infrastructure + source metadata
- **Impact**: Makes the entire platform fully non-opinionated

## Priority Order
1. 🔴 "Where Your Tax Dollars Go" — highest impact, makes data personal
2. 🔴 Economic Tracker — uses available APIs, high utility
3. 🟡 Outcomes/Promises Tracker — unique accountability tool
4. 🟡 Your Governorate Dashboard — personalized experience
5. 🟢 Tax Calculator — useful tool, straightforward
6. 🟢 Legislation Tracker — important but data-heavy
7. 🟢 Corruption Perception — sensitive but important
8. 🟢 Great Egyptian Figures — editorial content
9. 🔵 Automated Sanad Scoring — removes human opinion from confidence levels

## Data Availability Assessment
| Feature | Data Source | API Available? | Auto-refreshable? |
|---|---|---|---|
| Tax calculator | Tax Authority brackets | No (manual) | Yearly update |
| Economic tracker | World Bank, CBE, CAPMAS | Yes (World Bank API) | Daily/Monthly |
| Promises tracker | Government speeches, Vision 2030 | No (curated) | Manual |
| Your Governorate | CAPMAS statistical yearbook | Partial | Yearly |
| Legislation | Official Gazette | No (PDF extraction) | AI-assisted |
| Corruption index | Transparency International | Yes (public data) | Yearly |
| Automated Sanad | LLM Council + source metadata | Yes (internal) | Real-time |

## Recently Added (Not in Original Roadmap)

| Feature | Path | Status | Notes |
|---|---|---|---|
| Mashrou'ak (مشروعك) | `/tools/mashroaak` | ✅ Done | Entrepreneur investment tool |
| Investment Simulator | `/tools/invest` | ✅ Done | Investment growth with inflation calculator |
| Buy vs Rent | `/tools/buy-vs-rent` | ✅ Done | Homeownership cost comparison |
| Funding Sources | `/funding` | ✅ Done | Where Egypt's budget revenue comes from |
| Weekly Polls | `/polls` | ✅ Done | AI-generated polls on government policy topics |
| News Ticker | `/` (homepage) | ✅ Done | Live Egyptian news headlines from 7 RSS feeds (Google News, BBC, NYT, Daily News Egypt, Egypt Independent, Al-Monitor); also refreshed by pipeline via LLM web search |
| Guide Chat | (sidebar, disabled in prod) | 🚧 Dev only | Driver.js-powered page tours + AI SDK structured actions |
| WebMCP Integration | `.well-known/webmcp` | ✅ Done | Exposes tool pages to external AI agents (Chrome Gemini, etc.) |
| PR Preview Deploys | `.github/workflows/preview.yml` | ✅ Done | DigitalOcean preview deploy on every PR with URL comment |
| Claude Code Action | `.github/workflows/claude-fix.yml` | ✅ Done | Auto-fixes GitHub issues labeled `bug`, `enhancement`, `data-correction` or @claude mention |
| xAI Grok LLM Council | `convex/agents/providers/registry.ts` | ✅ Done | Grok added as primary AI SDK council provider (`grok-4-1-fast-reasoning`) |
