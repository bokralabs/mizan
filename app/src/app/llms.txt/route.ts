import { NextResponse } from "next/server";
import { NAV_GROUPS } from "@/lib/navigation";

export const revalidate = 86400; // 24h

export async function GET() {
  // Build the site map section dynamically from the navigation config
  const siteMap = NAV_GROUPS.map((group) => {
    const items = group.items.map((item) =>
      `  - [${item.en}](https://mizanmasr.com${item.href}): ${item.descEn}`
    ).join("\n");
    return `- **${group.en}**\n${items}`;
  }).join("\n");

  const content = `# Mizan (ميزان) — Egypt's Government Data, Made Visible

> A civic transparency platform providing cited, verified data on Egyptian government structure,
> parliament, constitution, budget, debt, elections, and economy.
> All data is AI-collected every 12 hours from official sources and fully auditable.

## About

Mizan is an open-source transparency platform at https://mizanmasr.com.
Every number is backed by a cited official source. Data is collected, verified,
and refreshed every 12 hours by AI agents. The full audit trail is publicly visible.

- **Language**: Fully bilingual — Arabic (RTL) and English
- **Currency**: All financial data supports EGP/USD toggle
- **Code**: Open source at https://github.com/bokralabs/mizan

## Site Map

${siteMap}
- **Home**
  - [Homepage](https://mizanmasr.com/): Daily AI poll, live stats, pipeline status

## Core Data Pages

### Government (/government)
Cabinet structure: President, Prime Minister, ministers organized by sector
(sovereignty, economic, social, infrastructure). Includes all 27 governorates
with governors. Tabs: Cabinet · Parliament · Governorates.

### Parliament (/parliament → /government?tab=parliament)
House of Representatives (596 seats) and Senate (300 seats). Members searchable
by party, governorate, election method. Full party breakdown with seat counts.

### Constitution (/constitution)
Full text of Egypt's 2014 constitution — 247 articles across 6 parts — with
2019 amendments highlighted. Full-text search, cross-references between articles.

### Elections (/elections)
Presidential (2014, 2018, 2024) and parliamentary election results with turnout,
vote counts, and governorate-level breakdown maps.

### Economy (/economy)
25+ economic indicators: GDP growth, inflation, unemployment, exchange rate (USD/EGP),
foreign reserves, Suez Canal revenue, remittances, FDI, tourism receipts, current account.
Includes IMF forecasts through 2030. All sourced from World Bank, CBE, and IMF APIs.

### Budget (/budget)
Government revenue and expenditure breakdown by sector and fiscal year.
Interactive Sankey flow visualization. Tax breakdown by category.

### Debt (/debt)
External debt (~$155B), domestic debt, debt-to-GDP ratio, debt service costs.
Timeline chart with historical data. Creditor breakdown (multilateral, bilateral, commercial).

## Interactive Tools

### Tax Calculator (/tools/tax-calculator)
Enter your income → see exactly where your taxes go by budget sector.

### Buy vs Rent (/tools/buy-vs-rent)
Egyptian real estate decision calculator. Compares buying vs renting with
local market data: property prices, rental yields, mortgage rates, inflation.

### Investment Simulator (/tools/invest)
Compare Egyptian asset classes: EGX stocks, real estate, bank CDs, T-bills,
gold, S&P 500, emerging markets. Uses real return rates from the platform.
Adjustable capital, horizon, allocation, and EGP depreciation assumptions.

### Governorate Finder (/governorate)
Look up any of Egypt's 27 governorates: governor, MPs, population,
area, density, HDI, and other local statistics.

## Data Transparency

- [Transparency Dashboard](https://mizanmasr.com/transparency): Live data health, tracked sources, refresh audit log, AI verification reports
- [Methodology](https://mizanmasr.com/methodology): How the AI agent collects and verifies data, source priority, Sanad reliability levels
- [Full Data Export](https://mizanmasr.com/llms-full.txt): Complete structured data dump in markdown — all numbers, all sources

## Data Sources (priority order)

1. **World Bank API** — GDP, external debt, economic indicators (automated)
2. **IMF DataMapper API** — GDP/inflation/debt forecasts through 2030 (automated)
3. **Central Bank of Egypt** — Exchange rates, reserves, monetary data (automated)
4. **Ministry of Finance** — Budget, revenue, expenditure (AI-parsed from mof.gov.eg)
5. **Parliament.gov.eg** — Member names, committees, parties (scraping + AI)
6. **Ahram Online** — Government structure, cabinet lineup (AI-parsed)
7. **Wikipedia** — Parliament composition (automated)
8. **ExchangeRate-API** — Live USD/EGP daily rate (automated)

## Data Reliability (Sanad System)

Every data point has a Sanad (سند) level indicating source reliability:
1. 🟢 Official Government (.gov.eg)
2. 🔵 International Organizations (World Bank, IMF)
3. 🟡 News/Media (Ahram, Reuters)
4. 🟠 Other sources
5. 🔴 Derived/Calculated

## API & Machine Access

- \`/llms.txt\` — This file: site overview for AI navigation
- \`/llms-full.txt\` — Complete data export (refreshed every 12 hours)
- WebMCP support — Chrome AI agents can auto-discover Mizan tools via navigator.modelContext
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
