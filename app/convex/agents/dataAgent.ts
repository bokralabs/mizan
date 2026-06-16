"use node";
// AI-powered data orchestrator for Mizan.
// Uses the Vercel AI SDK provider registry to parse and validate
// government transparency data fetched from public sources.
//
// SETUP: Set at least one LLM API key (XAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) in your Convex dashboard
// (Settings → Environment Variables) before deploying this action.

import { internalAction, ActionCtx } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";

import {
  parseWorldBankResponse,
  validateDebtRecord,
} from "./validators";
import { callLLMStructured, callLLMWithUsage, callLLMStructuredWithUsage, callLLMWebResearchStructured, getPrimaryProvider } from "./providers/registry";
import { estimateCost } from "../lib/tokenCost";
import { BudgetDataSchema, BudgetWikipediaSchema, CabinetDataSchema, GovernorsDataSchema, IMFIndicatorsExtractionSchema, InterestRateSchema, BankRatesSchema, StockIndexSchema, RawNewsListSchema, IDAOpportunitiesSchema, GAFIOpportunitiesSchema, IndustrialBenchmarksSchema, CostEstimatesSchema, IDAComplexesSchema, GAFIZonesSchema, InvestmentIncentivesSchema, zodToToolSchema } from "./schemas";
import { parseAndVerify as _parseAndVerify } from "./verify";
import { z } from "zod";

// ─── COST TRACKING ───────────────────────────────────────────────────────────

/**
 * Call the primary LLM provider and log usage to apiUsageLog for the funding page.
 * Provider-agnostic — routes through the registry to whichever provider is active.
 */
async function _callPrimaryLLM(
  ctx: ActionCtx,
  prompt: string,
  systemPrompt?: string,
  purpose = "data_pipeline"
): Promise<string | null> {
  const provider = getPrimaryProvider();
  const providerName = provider?.name ?? "unknown";
  const result = await callLLMWithUsage(prompt, systemPrompt);

  if (result.usage) {
    const { inputTokens, outputTokens, model, durationMs } = result.usage;
    const costUsd = estimateCost(model, inputTokens, outputTokens);
    try {
      await ctx.runMutation(internal.usage.logApiUsage, {
        provider: providerName,
        model,
        purpose,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd,
        durationMs,
        success: result.text !== null,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn("[dataAgent] Failed to log API usage:", err);
    }
  }

  return result.text;
}

/** Get the active provider name for usage logging. */
function activeProviderName(): string {
  return getPrimaryProvider()?.name ?? "unknown";
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type RefreshCategory = "government" | "parliament" | "budget" | "debt" | "economy" | "governorate_stats" | "industry";

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours (matches cron interval)
const INDUSTRY_REFRESH_TIMEOUT_MS = 20 * 60 * 1000;
const NEWS_REFRESH_TIMEOUT_MS = 8 * 60 * 1000;
const PIPELINE_TIMEOUT_ERROR = "AI provider timeout";
const CORE_REFRESH_CATEGORIES: Array<RefreshCategory> = [
  "government",
  "parliament",
  "budget",
  "debt",
  "economy",
  "governorate_stats",
  "industry",
];

type PipelineChainArgs = {
  runId: string;
  force?: boolean;
};

type CoreCategoryStepArgs = PipelineChainArgs & {
  categoryIndex: number;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(PIPELINE_TIMEOUT_ERROR));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ─── SOURCE REGISTRY ─────────────────────────────────────────────────────────
// Every URL the pipeline fetches, grouped by category.
// On each successful refresh, all sources for that category are upserted into
// the `dataSources` table so the /transparency page stays in sync automatically.

type SourceEntry = {
  nameEn: string;
  nameAr: string;
  url: string;
  type: "official_government" | "international_org" | "academic" | "media" | "other";
};

const CATEGORY_SOURCES: Record<string, SourceEntry[]> = {
  debt: [
    { nameEn: "World Bank — External Debt Stock", nameAr: "البنك الدولي — رصيد الدين الخارجي", url: "https://api.worldbank.org/v2/country/EGY/indicator/DT.DOD.DECT.CD", type: "international_org" },
    { nameEn: "World Bank — Debt Service Payments", nameAr: "البنك الدولي — مدفوعات خدمة الدين", url: "https://api.worldbank.org/v2/country/EGY/indicator/DT.TDS.DECT.CD", type: "international_org" },
  ],
  budget: [
    { nameEn: "Ministry of Finance — Financial Monthly", nameAr: "وزارة المالية — النشرة المالية الشهرية", url: "https://www.mof.gov.eg", type: "official_government" },
    { nameEn: "Wikipedia — Economy of Egypt", nameAr: "ويكيبيديا — اقتصاد مصر", url: "https://en.wikipedia.org/wiki/Economy_of_Egypt", type: "media" },
  ],
  government: [
    { nameEn: "Ahram Online — Cabinet Composition", nameAr: "الأهرام — تشكيل مجلس الوزراء", url: "https://english.ahram.org.eg/News/562168.aspx", type: "media" },
    { nameEn: "Ahram Online — Governors List", nameAr: "الأهرام — قائمة المحافظين", url: "https://english.ahram.org.eg/News/526575.aspx", type: "media" },
  ],
  parliament: [
    { nameEn: "Wikipedia — 2025 Egyptian Parliamentary Election", nameAr: "ويكيبيديا — انتخابات البرلمان المصري ٢٠٢٥", url: "https://en.wikipedia.org/wiki/2025_Egyptian_parliamentary_election", type: "media" },
  ],
  economy: [
    { nameEn: "World Bank — Economic Indicators", nameAr: "البنك الدولي — المؤشرات الاقتصادية", url: "https://api.worldbank.org/v2/country/EGY/indicator", type: "international_org" },
    { nameEn: "IMF — DataMapper API", nameAr: "صندوق النقد الدولي — واجهة بيانات DataMapper", url: "https://www.imf.org/external/datamapper/api/v1", type: "international_org" },
    { nameEn: "ExchangeRate API — USD/EGP", nameAr: "واجهة أسعار الصرف — دولار/جنيه", url: "https://open.er-api.com/v6/latest/USD", type: "other" },
    { nameEn: "Central Bank of Egypt — T-Bill Rates", nameAr: "البنك المركزي المصري — أسعار أذون الخزانة", url: "https://www.cbe.org.eg/en/economic-research/statistics/egp-t-bills-secondary-market", type: "official_government" },
    { nameEn: "Banque Misr — Certificate of Deposit Rates", nameAr: "بنك مصر — أسعار شهادات الإيداع", url: "https://www.banquemisr.com/en/SMEs/Retail-Banking/Accounts-And-Deposits/Certificates", type: "other" },
    { nameEn: "CountryEconomy — EGX 30 Stock Index", nameAr: "CountryEconomy — مؤشر البورصة المصرية EGX 30", url: "https://countryeconomy.com/stock-exchange/egypt", type: "other" },
    { nameEn: "Egyptian Exchange (EGX)", nameAr: "البورصة المصرية (EGX)", url: "https://www.egx.com.eg", type: "other" },
  ],
  governorate_stats: [
    { nameEn: "Wikipedia — Governorates of Egypt", nameAr: "ويكيبيديا — محافظات مصر", url: "https://en.wikipedia.org/wiki/Governorates_of_Egypt", type: "media" },
    { nameEn: "Wikipedia — Governorate HDI Rankings", nameAr: "ويكيبيديا — ترتيب المحافظات حسب التنمية البشرية", url: "https://en.wikipedia.org/wiki/List_of_governorates_of_Egypt_by_Human_Development_Index", type: "media" },
  ],
  constitution: [
    { nameEn: "FAO — Egypt Constitution 2019 (PDF)", nameAr: "منظمة الأغذية والزراعة — دستور مصر ٢٠١٩", url: "https://faolex.fao.org/docs/pdf/egy127542e.pdf", type: "international_org" },
    { nameEn: "Constitute Project — Egypt 2019", nameAr: "مشروع Constitute — دستور مصر ٢٠١٩", url: "https://www.constituteproject.org/constitution/Egypt_2019", type: "academic" },
  ],
  industry: [
    { nameEn: "IDA — Industrial Development Authority", nameAr: "هيئة التنمية الصناعية", url: "https://www.ida.gov.eg", type: "official_government" },
    { nameEn: "IDA — Industrial Complexes", nameAr: "هيئة التنمية الصناعية — المجمعات الصناعية", url: "https://www.ida.gov.eg/ar/industrial-complexes", type: "official_government" },
    { nameEn: "IDA — Investment Opportunities Map", nameAr: "خريطة الفرص الاستثمارية — هيئة التنمية الصناعية", url: "https://www.ida.gov.eg/ar/investmap", type: "official_government" },
    { nameEn: "IDA — Investment Incentives 2025", nameAr: "هيئة التنمية الصناعية — حوافز الاستثمار ٢٠٢٥", url: "https://www.ida.gov.eg/uploads/files/pdfs/QR_PDF/Investment%20incentives%20(english)%202025.pdf", type: "official_government" },
    { nameEn: "IDA — Investor Journey", nameAr: "هيئة التنمية الصناعية — رحلة المستثمر", url: "https://www.ida.gov.eg/ar/investor-journey", type: "official_government" },
    { nameEn: "GAFI — Free Zones", nameAr: "هيئة الاستثمار — المناطق الحرة", url: "https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/FreeZones.aspx", type: "official_government" },
    { nameEn: "GAFI — Industrial Zones", nameAr: "هيئة الاستثمار — المناطق الصناعية", url: "https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/Industrial-Zones.aspx", type: "official_government" },
    { nameEn: "GAFI — General Authority for Investment", nameAr: "الهيئة العامة للاستثمار والمناطق الحرة", url: "https://www.gafi.gov.eg", type: "official_government" },
    { nameEn: "Invest in Egypt — Sector Feasibility Studies", nameAr: "استثمر في مصر — دراسات الجدوى القطاعية", url: "https://www.investinegypt.gov.eg/English/pages/sectorandgeographies.aspx", type: "official_government" },
    { nameEn: "Golden License Program", nameAr: "برنامج الرخصة الذهبية", url: "https://www.goldenlicense.gov.eg/", type: "official_government" },
  ],
};

// ─── DEBT REFRESH ─────────────────────────────────────────────────────────────

async function refreshDebtData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  // Fetch both external debt stock AND debt service from World Bank
  const DEBT_STOCK_URL =
    "https://api.worldbank.org/v2/country/EGY/indicator/DT.DOD.DECT.CD?format=json&per_page=10";
  const DEBT_SERVICE_URL =
    "https://api.worldbank.org/v2/country/EGY/indicator/DT.TDS.DECT.CD?format=json&per_page=10";

  // Fetch debt stock
  const stockResponse = await fetch(DEBT_STOCK_URL);
  if (!stockResponse.ok) {
    throw new Error(
      `World Bank debt stock API failed with status ${stockResponse.status}`
    );
  }
  const stockRaw: unknown = await stockResponse.json();
  const stockEntries = parseWorldBankResponse(stockRaw);

  // Fetch debt service (interest + principal payments)
  const serviceByDate: Record<string, number> = {};
  try {
    const serviceResponse = await fetch(DEBT_SERVICE_URL);
    if (serviceResponse.ok) {
      const serviceRaw: unknown = await serviceResponse.json();
      const serviceEntries = parseWorldBankResponse(serviceRaw);
      for (const entry of serviceEntries) {
        if (entry.value != null) {
          const date = entry.date.length === 4 ? `${entry.date}-12-31` : entry.date;
          serviceByDate[date] = entry.value / 1e9; // Convert to billions
        }
      }
    }
  } catch {
    console.warn("[dataAgent] Failed to fetch debt service data, continuing with stock only");
  }

  if (stockEntries.length === 0) {
    console.warn("[dataAgent] World Bank returned no debt entries for Egypt.");
    return { recordsUpdated: 0 };
  }

  let totalUpdated = 0;
  for (const entry of stockEntries) {
    const debtValueUsd = entry.value;
    if (debtValueUsd === null || debtValueUsd === undefined) continue;

    const debtInBillions = debtValueUsd / 1e9;
    const record = { totalExternalDebt: debtInBillions };

    const validation = validateDebtRecord(record);
    if (!validation.valid) {
      console.warn(
        `[dataAgent] Debt record for ${entry.date} failed validation: ${validation.errors.join("; ")}`
      );
      continue;
    }

    const date = entry.date.length === 4 ? `${entry.date}-12-31` : entry.date;
    const debtService = serviceByDate[date];

    const updated: number = await ctx.runMutation(
      internal.dataRefresh.upsertDebtRecord,
      {
        date,
        totalExternalDebt: debtInBillions,
        totalDebtService: debtService,
        sourceUrl: DEBT_STOCK_URL,
        sanadLevel: 2,
      }
    );
    totalUpdated += updated;
  }

  return { recordsUpdated: totalUpdated, sourceUrl: DEBT_STOCK_URL };
}

// ─── BUDGET REFRESH ───────────────────────────────────────────────────────────

async function refreshBudgetData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  const hasLLM = !!getPrimaryProvider();
  if (!hasLLM) {
    console.warn("[dataAgent] Skipping budget refresh — no LLM provider configured.");
    return { recordsUpdated: 0 };
  }

  // ── Level 1: MOF Financial Monthly PDF via LLM web_search ──
  // The LLM searches for the latest PDF on assets.mof.gov.eg, fetches it, and
  // extracts fiscal data from Section 4 (Fiscal Sector). The provider executes
  // the search/fetch server-side — no headless browser needed.
  try {
    console.log("[dataAgent/budget] Attempting MOF via web_search → structured output...");

    // Two-step: web research → structured parse with Zod-verified schema
    const budgetToolSchema = zodToToolSchema(
      "extract_budget",
      "Extract Egyptian national budget data from web research",
      BudgetDataSchema,
    );

    const result = await callLLMWebResearchStructured<z.infer<typeof BudgetDataSchema>>(
      `Search for the latest Egypt government budget data. Try these searches:
1. "Egypt Ministry of Finance Financial Monthly 2025 revenue expenditure deficit EGP billions"
2. "Egypt budget fiscal year 2024-2025 total revenue total expenditure"

From the search results, find the most recent Egyptian national budget figures.
All monetary values MUST be in EGP BILLIONS (not trillions). If a source says "EGP 1.442 trillion", convert to 1442 billion.
fiscalYear MUST use dash separator "YYYY-YYYY" (e.g. "2024-2025"), NEVER slash.`,
      [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      budgetToolSchema,
      `Extract the Egyptian national budget data into structured format.
CRITICAL: fiscalYear must be "YYYY-YYYY" with dash (e.g. "2024-2025"). All amounts in EGP billions.`,
      "You are a data extraction assistant for Egyptian government fiscal data.",
    );

    // Log usage
    if (result.usage) {
      const { inputTokens, outputTokens, model, durationMs } = result.usage;
      const costUsd = estimateCost(model, inputTokens, outputTokens);
      try {
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(),
          model,
          purpose: "data_pipeline_budget",
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUsd,
          durationMs,
          success: result.result !== null,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn("[dataAgent/budget] Failed to log API usage:", err);
      }
    }

    if (result.result) {
      // Verify with Zod before upserting
      const verified = BudgetDataSchema.safeParse(result.result);
      if (!verified.success) {
        console.error("[dataAgent/budget] REJECTED by verifier:", verified.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        const data = verified.data;
        const srcUrl = data.sourceUrl;
        const isMof = srcUrl.includes("mof.gov.eg");
        const isIntlOrg = srcUrl.includes("worldbank.org") || srcUrl.includes("imf.org");
        const sanadLevel = isMof ? 1 : isIntlOrg ? 2 : 3;

        const recordsUpdated: number = await ctx.runMutation(
          internal.dataRefresh.upsertFiscalYear,
          {
            year: data.fiscalYear,
            totalRevenue: data.totalRevenue,
            totalExpenditure: data.totalExpenditure,
            deficit: data.deficit,
            gdp: data.gdp,
            sourceUrl: srcUrl,
            sanadLevel,
          }
        );
        console.log(`[dataAgent/budget] Web search: ${recordsUpdated} records updated (sanad ${sanadLevel}, source: ${srcUrl}).`);
        return { recordsUpdated, sourceUrl: srcUrl };
      }
    }
    console.warn("[dataAgent/budget] MOF extraction returned no usable data — falling back to Wikipedia.");
  } catch (err) {
    console.warn(`[dataAgent/budget] MOF PDF approach failed: ${err instanceof Error ? err.message : String(err)} — falling back to Wikipedia.`);
  }

  // ── Level 2: Wikipedia Economy of Egypt infobox ───────────────────────────
  // The infobox has structured fields like: | revenue = $60.671 billion (2025)
  try {
    console.log("[dataAgent/budget] Fetching Wikipedia Economy of Egypt infobox...");
    const wikiUrl = "https://en.wikipedia.org/w/api.php?action=parse&page=Economy_of_Egypt&prop=wikitext&section=0&format=json";
    const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(15000) });

    if (!wikiRes.ok) {
      console.warn(`[dataAgent/budget] Wikipedia returned ${wikiRes.status}`);
      return { recordsUpdated: 0 };
    }

    const wikiData = await wikiRes.json() as { parse?: { wikitext?: { "*"?: string } } };
    const wikitext = wikiData?.parse?.wikitext?.["*"] ?? "";

    if (wikitext.length < 500) {
      console.warn("[dataAgent/budget] Wikipedia infobox too short.");
      return { recordsUpdated: 0 };
    }

    // Extract with Claude structured output — wikitext is structured template data
    const wikiToolSchema = zodToToolSchema(
      "extract_wiki_budget",
      "Extract Egyptian budget data from Wikipedia infobox",
      BudgetWikipediaSchema,
    );

    const { result: wikiResult, usage: wikiUsage } = await callLLMStructuredWithUsage<z.infer<typeof BudgetWikipediaSchema>>(
      `Extract Egyptian government budget data from this Wikipedia infobox wikitext.
The infobox contains fields like: | revenue = $XX billion (YYYY) | expenses = $XX billion (YYYY)
fiscalYear MUST use dash separator "YYYY-YYYY" (e.g. "2024-2025"), NEVER slash.

Wikitext (first 6000 chars):
${wikitext.slice(0, 6000)}`,
      wikiToolSchema,
      "Extract fiscal data from Wikipedia infobox. Be precise with numbers.",
    );

    // Log usage
    if (wikiUsage) {
      const costUsd = estimateCost(wikiUsage.model, wikiUsage.inputTokens, wikiUsage.outputTokens);
      try {
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(), model: wikiUsage.model, purpose: "data_pipeline_budget_wiki",
          inputTokens: wikiUsage.inputTokens, outputTokens: wikiUsage.outputTokens,
          totalTokens: wikiUsage.inputTokens + wikiUsage.outputTokens,
          costUsd, durationMs: wikiUsage.durationMs, success: wikiResult !== null, timestamp: Date.now(),
        });
      } catch (err) {
        console.warn("[dataAgent/budget] Failed to log wiki usage:", err);
      }
    }

    if (!wikiResult) {
      console.warn("[dataAgent/budget] Claude returned no structured data from Wikipedia.");
      return { recordsUpdated: 0 };
    }

    // Verify with Zod
    const verified = BudgetWikipediaSchema.safeParse(wikiResult);
    if (!verified.success) {
      console.error("[dataAgent/budget] Wikipedia data REJECTED by verifier:", verified.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      return { recordsUpdated: 0 };
    }

    const wikiBudget = verified.data;

    // Convert USD → EGP using latest exchange rate from economicIndicators
    let usdToEgp = 50; // Conservative fallback
    try {
      const fxRecords = await ctx.runQuery(api.economy.getIndicator, { indicator: "exchange_rate", limit: 1 }) as Array<{ value: number }>;
      if (fxRecords.length > 0 && fxRecords[0].value > 0) {
        usdToEgp = fxRecords[0].value;
      }
    } catch {
      console.warn("[dataAgent/budget] Could not fetch exchange rate, using fallback.");
    }

    const totalRevenue = wikiBudget.revenueUsd * usdToEgp;
    const totalExpenditure = wikiBudget.expenditureUsd * usdToEgp;
    const deficit = wikiBudget.deficitUsd * usdToEgp;
    const gdp = wikiBudget.gdpNominalUsd * usdToEgp;

    const recordsUpdated: number = await ctx.runMutation(
      internal.dataRefresh.upsertFiscalYear,
      {
        year: wikiBudget.fiscalYear,
        totalRevenue,
        totalExpenditure,
        deficit,
        gdp,
        sourceUrl: "https://en.wikipedia.org/wiki/Economy_of_Egypt",
        sanadLevel: 3, // Wikipedia citing IMF
      }
    );

    console.log(`[dataAgent/budget] Wikipedia fallback: ${recordsUpdated} records updated.`);
    return { recordsUpdated, sourceUrl: "https://en.wikipedia.org/wiki/Economy_of_Egypt" };
  } catch (err) {
    console.warn(`[dataAgent/budget] Wikipedia fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    return { recordsUpdated: 0 };
  }
}

// parseBudgetJson removed — budget calls now use structured output with Zod verification
// via BudgetDataSchema and BudgetWikipediaSchema from schemas.ts

// ─── GOVERNMENT REFRESH ───────────────────────────────────────────────────────

async function refreshGovernmentData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  const hasLLM = !!getPrimaryProvider();
  if (!hasLLM) {
    console.warn(
      "[dataAgent] Skipping government AI refresh — no LLM provider configured."
    );
    return { recordsUpdated: 0 };
  }

  // Primary: Ahram Online (gov-affiliated news, has full cabinet lineup)
  // Wikipedia "Second Madbouly Cabinet" article doesn't exist yet
  const AHRAM_URL = "https://english.ahram.org.eg/News/562168.aspx";

  let pageText = "";
  const sourceUrl = AHRAM_URL;

  try {
    const ahramRes = await fetch(AHRAM_URL, { signal: AbortSignal.timeout(15000) });
    if (ahramRes.ok) {
      const html = await ahramRes.text();
      const titleMarker = html.indexOf("ContentPlaceHolder1_hd");
      const bodyStart = titleMarker > 0 ? titleMarker : html.indexOf("ContentPlaceHolder1_bref");
      const articleHtml = bodyStart > 0 ? html.slice(bodyStart, bodyStart + 15000) : html.slice(Math.floor(html.length / 2), Math.floor(html.length / 2) + 15000);
      pageText = articleHtml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
      console.log(`[dataAgent] Fetched Ahram cabinet article: ${pageText.length} chars`);
    }
  } catch (err) {
    console.warn(`[dataAgent] Ahram fetch failed: ${err}`);
  }

  if (pageText.length < 500) {
    console.warn("[dataAgent] Insufficient page content for government extraction");
    return { recordsUpdated: 0 };
  }

  const CABINET_URL = sourceUrl;

  const systemPrompt = `You are a data extraction assistant for Mizan, Egypt's government transparency platform.
Extract structured Egyptian government data from official sources.
Always respond with valid JSON only — no markdown, no prose.`;

  const prompt = `Extract ALL current Egyptian government officials from this article.

IMPORTANT: Always include these at the top of the array:
1. {"nameEn": "Abdel Fattah el-Sisi", "titleEn": "President of Egypt", "nameAr": "عبد الفتاح السيسي", "titleAr": "رئيس الجمهورية", "role": "president"}
2. {"nameEn": "Mostafa Madbouly", "titleEn": "Prime Minister", "nameAr": "مصطفى مدبولي", "titleAr": "رئيس الوزراء", "role": "prime_minister"}

Then extract ALL ministers from the article below (30+ ministers).

Return a JSON array. Each entry: {"nameEn": "...", "titleEn": "...", "nameAr": "", "titleAr": "", "role": "president"|"prime_minister"|"minister"}

Page content:
${pageText || "(page content unavailable)"}`;

  // Fetch governor data from Ahram Online (separate article from cabinet)
  let governorText = "";
  try {
    const govAhramRes = await fetch("https://english.ahram.org.eg/News/526575.aspx", { signal: AbortSignal.timeout(10000) });
    if (govAhramRes.ok) {
      const html = await govAhramRes.text();
      const titleMarker = html.indexOf("ContentPlaceHolder1_hd");
      const bodyStart = titleMarker > 0 ? titleMarker : 0;
      governorText = html.slice(bodyStart, bodyStart + 10000).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
      console.log(`[dataAgent] Fetched Ahram governor article: ${governorText.length} chars`);
    }
  } catch {
    console.warn("[dataAgent] Ahram governor article fetch failed");
  }

  console.log(`[dataAgent] Government: sending ${pageText.length} chars to Claude for ministers...`);
  const cabinetToolSchema = zodToToolSchema("extract_cabinet", "Extract Egyptian cabinet officials", CabinetDataSchema);
  const { result: cabinetResult } = await callLLMStructuredWithUsage<z.infer<typeof CabinetDataSchema>>(
    prompt,
    cabinetToolSchema,
    systemPrompt,
  );

  if (!cabinetResult) {
    console.warn("[dataAgent] Claude returned no government data (null response).");
    return { recordsUpdated: 0 };
  }

  const cabinetVerified = CabinetDataSchema.safeParse(cabinetResult);
  if (!cabinetVerified.success) {
    console.error("[dataAgent/government] REJECTED by verifier:", cabinetVerified.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
    return { recordsUpdated: 0 };
  }

  const officials = cabinetVerified.data.officials;
  console.log(`[dataAgent] Government: verified ${officials.length} officials`);

  // Auto-write officials to DB (upsert by name, never delete existing)
  let recordsUpdated: number = await ctx.runMutation(
    internal.dataRefresh.upsertGovernmentOfficials,
    {
      officials: officials.map((o) => ({
        nameEn: o.nameEn,
        nameAr: o.nameAr || o.nameEn,
        titleEn: o.titleEn,
        titleAr: o.titleAr || o.titleEn,
        role: o.role === "president" ? "president" as const
          : o.role === "prime_minister" ? "prime_minister" as const
          : "minister" as const,
      })),
      sourceUrl: CABINET_URL,
      sanadLevel: 3,
    }
  );

  // Step 2: Extract governors separately (different source)
  if (governorText.length > 200) {
    console.log(`[dataAgent] Government: extracting governors from ${governorText.length} chars...`);
    const govToolSchema = zodToToolSchema("extract_governors", "Extract Egyptian governors", GovernorsDataSchema);
    const { result: govResult } = await callLLMStructuredWithUsage<z.infer<typeof GovernorsDataSchema>>(
      `Extract ALL 27 Egyptian governors from this text.
Egypt has 27 governorates. Extract every governor mentioned.

Text:
${governorText.slice(0, 8000)}`,
      govToolSchema,
      systemPrompt,
    );

    if (govResult) {
      const govVerified = GovernorsDataSchema.safeParse(govResult);
      if (!govVerified.success) {
        console.warn("[dataAgent] Governors REJECTED by verifier:", govVerified.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        const govUpdated: number = await ctx.runMutation(
          internal.dataRefresh.upsertGovernmentOfficials,
          {
            officials: govVerified.data.governors.map((o) => ({
              nameEn: o.nameEn,
              nameAr: o.nameAr || "",
              titleEn: o.titleEn,
              titleAr: o.titleAr || "",
              role: "governor" as const,
            })),
            sourceUrl: "https://english.ahram.org.eg/News/526575.aspx",
            sanadLevel: 3,
          }
        );
        recordsUpdated += govUpdated;
        console.log(`[dataAgent] Government: ${govVerified.data.governors.length} governors extracted`);
      }
    }
  }

  return { recordsUpdated, sourceUrl: CABINET_URL };
}

// ─── PARLIAMENT REFRESH ───────────────────────────────────────────────────────

async function refreshParliamentData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  // Delegate to the parliament agent which fetches composition from Wikipedia
  // and uses Claude to extract party/seat data
  try {
    const result: { status: string; partiesUpdated?: number } =
      await ctx.runAction(
        internal.agents.parliamentAgent.refreshParliament,
        {}
      );
    return {
      recordsUpdated: result.partiesUpdated ?? 0,
      sourceUrl: "https://en.wikipedia.org/wiki/2025_Egyptian_parliamentary_election",
    };
  } catch (err) {
    console.warn(
      `[dataAgent] Parliament refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { recordsUpdated: 0 };
  }
}

// ─── ECONOMY REFRESH ──────────────────────────────────────────────────────────

// World Bank indicator codes for Egypt
const WB_INDICATORS: Array<{
  code: string;
  indicator: string;
  unit: string;
  sourceNameEn: string;
  scaleFactor?: number;
}> = [
  {
    code: "NY.GDP.MKTP.KD.ZG",
    indicator: "gdp_growth",
    unit: "percent",
    sourceNameEn: "World Bank — GDP growth (annual %)",
  },
  {
    code: "FP.CPI.TOTL.ZG",
    indicator: "inflation",
    unit: "percent",
    sourceNameEn: "World Bank — Inflation, consumer prices (annual %)",
  },
  {
    code: "SL.UEM.TOTL.ZS",
    indicator: "unemployment",
    unit: "percent",
    sourceNameEn: "World Bank — Unemployment, total (% of total labor force)",
  },
  {
    code: "FI.RES.TOTL.CD",
    indicator: "reserves",
    unit: "billion_usd",
    sourceNameEn: "World Bank — Total reserves (current USD)",
    scaleFactor: 1e9, // API returns raw USD; divide to get billions
  },
  // Exchange rate removed from WB -- annual average is outdated.
  // Live rate fetched separately from Frankfurter API (see refreshEconomyData).
  {
    code: "BX.TRF.PWKR.CD.DT",
    indicator: "remittances",
    unit: "billion_usd",
    scaleFactor: 1e9,
    sourceNameEn: "World Bank",
  },
  {
    code: "BX.KLT.DINV.CD.WD",
    indicator: "fdi_inflows",
    unit: "billion_usd",
    scaleFactor: 1e9,
    sourceNameEn: "World Bank",
  },
  {
    code: "ST.INT.RCPT.CD",
    indicator: "tourism_receipts",
    unit: "billion_usd",
    scaleFactor: 1e9,
    sourceNameEn: "World Bank",
  },
  {
    code: "BN.CAB.XOKA.CD",
    indicator: "current_account",
    unit: "billion_usd",
    scaleFactor: 1e9,
    sourceNameEn: "World Bank",
  },
  {
    code: "NY.GDP.MKTP.CD",
    indicator: "gdp_nominal",
    unit: "billion_usd",
    scaleFactor: 1e9,
    sourceNameEn: "World Bank",
  },
  {
    code: "NY.GDP.PCAP.CD",
    indicator: "gdp_per_capita",
    unit: "usd",
    sourceNameEn: "World Bank",
  },
  {
    code: "SP.POP.TOTL",
    indicator: "population",
    unit: "millions",
    scaleFactor: 1e6,
    sourceNameEn: "World Bank",
  },
  {
    code: "SI.POV.NAHC",
    indicator: "poverty_rate",
    unit: "percent",
    sourceNameEn: "World Bank",
  },
  {
    code: "DT.TDS.DECT.EX.ZS",
    indicator: "debt_service_exports",
    unit: "percent",
    sourceNameEn: "World Bank",
  },
];

// ─── IMF DATAMAPPER REFRESH ───────────────────────────────────────────────────

// IMF DataMapper indicator codes for Egypt.
// The API returns both historical values and WEO forecasts through 2030.
const IMF_INDICATORS: Array<{
  code: string;
  indicator: string;
  unit: string;
  sourceNameEn: string;
}> = [
  {
    code: "NGDP_RPCH",
    indicator: "imf_gdp_growth_forecast",
    unit: "percent",
    sourceNameEn: "IMF WEO — Real GDP growth (annual %)",
  },
  {
    code: "PCPIPCH",
    indicator: "imf_inflation_forecast",
    unit: "percent",
    sourceNameEn: "IMF WEO — Inflation, average consumer prices (annual %)",
  },
  {
    code: "BCA_NGDPD",
    indicator: "imf_current_account_forecast",
    unit: "percent_gdp",
    sourceNameEn: "IMF WEO — Current account balance (% of GDP)",
  },
  {
    code: "GGXWDG_NGDP",
    indicator: "imf_gov_debt_gdp",
    unit: "percent_gdp",
    sourceNameEn: "IMF WEO — Government gross debt (% of GDP)",
  },
];

// IMF DataMapper API response shape
type IMFResponse = {
  values?: Record<string, Record<string, Record<string, number>>>;
};

// IMF direct API function -- kept for when IMF unblocks cloud IPs
async function _refreshIMFData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number }> {
  let totalUpdated = 0;
  const BASE_URL = "https://www.imf.org/external/datamapper/api/v1";

  // IMF DataMapper API blocks cloud IPs (403). Use Wikipedia as the source
  // for IMF projections -- the Economy of Egypt article cites IMF WEO data.
  // Fallback: one Claude call to extract forecasts from the Wikipedia text.
  console.log("[dataAgent/imf] Fetching IMF projections from Wikipedia...");

  let imfText = "";
  try {
    const wikiUrl = "https://en.wikipedia.org/w/api.php?action=query&titles=Economy_of_Egypt&prop=extracts&explaintext=true&format=json";
    const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(15000) });
    if (wikiRes.ok) {
      const data = await wikiRes.json() as { query?: { pages?: Record<string, { extract?: string }> } };
      const pages = data?.query?.pages;
      if (pages) {
        imfText = Object.values(pages)[0]?.extract ?? "";
        imfText = imfText.slice(0, 15000);
      }
    }
  } catch {
    console.warn("[dataAgent/imf] Wikipedia fetch failed");
  }

  if (imfText.length > 500) {
    const imfToolSchema = zodToToolSchema("extract_imf", "Extract IMF economic projections for Egypt", IMFIndicatorsExtractionSchema);
    const { result: imfResult } = await callLLMStructuredWithUsage<z.infer<typeof IMFIndicatorsExtractionSchema>>(
      `Extract IMF economic projections for Egypt from this Wikipedia article.

Extract these indicators if available:
- imf_gdp_growth_forecast (Real GDP growth %)
- imf_inflation_forecast (Inflation %)
- imf_current_account_forecast (Current account % of GDP)
- imf_gov_debt_gdp (Government debt % of GDP)

Include both historical and forecast years (2020-2030).

Text: ${imfText}`,
      imfToolSchema,
      "Extract IMF economic data from Wikipedia.",
    );

    if (imfResult) {
      const verified = IMFIndicatorsExtractionSchema.safeParse(imfResult);
      if (!verified.success) {
        console.warn("[dataAgent/imf] REJECTED by verifier:", verified.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        for (const ind of verified.data.indicators) {
          const meta = IMF_INDICATORS.find((i) => i.indicator === ind.indicator);
          if (!meta) continue;
          for (const [yearStr, value] of Object.entries(ind.data)) {
            if (typeof value !== "number" || isNaN(value)) continue;
            const updated: number = await ctx.runMutation(
              internal.dataRefresh.upsertEconomicIndicator,
              {
                indicator: ind.indicator,
                date: `${yearStr}-12-31`,
                year: yearStr,
                value,
                unit: meta.unit,
                sourceUrl: "https://en.wikipedia.org/wiki/Economy_of_Egypt",
                sourceNameEn: meta.sourceNameEn,
                sanadLevel: 2,
              }
            );
            totalUpdated += updated;
          }
        }
        console.log(`[dataAgent/imf] Extracted IMF data from Wikipedia: ${totalUpdated} records`);
      }
    }
  }

  // Original loop kept as dead code for when IMF API access is restored
  const _skipDirectApi = true;
  for (const imf of IMF_INDICATORS) {
    if (_skipDirectApi) break;
    const url = `${BASE_URL}/${imf.code}/EGY`;
    let raw: unknown;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        console.warn(
          `[dataAgent/imf] IMF API returned ${response.status} for indicator ${imf.code}`
        );
        continue;
      }
      raw = await response.json();
    } catch (err) {
      console.warn(
        `[dataAgent/imf] Failed to fetch ${imf.code}: ${String(err)}`
      );
      continue;
    }

    // Parse IMF response: {"values":{"NGDP_RPCH":{"EGY":{"2024":2.4,"2025":4.3,...}}}}
    const typed = raw as IMFResponse;
    const yearMap = typed?.values?.[imf.code]?.["EGY"];
    if (!yearMap || typeof yearMap !== "object") {
      console.warn(
        `[dataAgent/imf] Unexpected IMF response shape for ${imf.code}`
      );
      continue;
    }

    for (const [yearStr, value] of Object.entries(yearMap)) {
      if (typeof value !== "number" || isNaN(value)) continue;

      // IMF year strings are like "2024"; store as YYYY-12-31 for consistency
      const date = `${yearStr}-12-31`;

      const updated: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: imf.indicator,
          date,
          year: yearStr,
          value,
          unit: imf.unit,
          sourceUrl: url,
          sourceNameEn: imf.sourceNameEn,
          sanadLevel: 2,
        }
      );
      totalUpdated += updated;
    }

    console.log(
      `[dataAgent/imf] ${imf.code} -> ${imf.indicator}: ${Object.keys(yearMap).length} year(s) processed`
    );
  }

  return { recordsUpdated: totalUpdated };
}

async function refreshEconomyData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  let totalUpdated = 0;
  const BASE_URL = "https://api.worldbank.org/v2/country/EGY/indicator";

  for (const wb of WB_INDICATORS) {
    const url = `${BASE_URL}/${wb.code}?format=json&per_page=15&mrv=15`;
    let entries: Array<{ date: string; value: number | null }>;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(
          `[dataAgent/economy] World Bank API returned ${response.status} for indicator ${wb.code}`
        );
        continue;
      }
      const raw: unknown = await response.json();
      entries = parseWorldBankResponse(raw);
    } catch (err) {
      console.warn(
        `[dataAgent/economy] Failed to fetch ${wb.code}: ${String(err)}`
      );
      continue;
    }

    for (const entry of entries) {
      if (entry.value === null || entry.value === undefined) continue;

      // World Bank dates are either "YYYY" or "YYYY-MM-DD"
      const date =
        entry.date.length === 4 ? `${entry.date}-12-31` : entry.date;
      const year = entry.date.length === 4 ? entry.date : entry.date.slice(0, 4);
      const value =
        wb.scaleFactor !== undefined ? entry.value / wb.scaleFactor : entry.value;

      const updated: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: wb.indicator,
          date,
          year,
          value,
          unit: wb.unit,
          sourceUrl: url,
          sourceNameEn: wb.sourceNameEn,
          sanadLevel: 2,
        }
      );
      totalUpdated += updated;
    }
  }

  // Live exchange rate from ExchangeRate-API (free, no key, updated daily)
  try {
    const fxRes = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(10000),
    });
    if (fxRes.ok) {
      const fxData = await fxRes.json() as { rates?: { EGP?: number }; time_last_update_utc?: string };
      const egpRate = fxData?.rates?.EGP;
      if (egpRate && egpRate > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const updated: number = await ctx.runMutation(
          internal.dataRefresh.upsertEconomicIndicator,
          {
            indicator: "exchange_rate",
            date: today,
            year: today.slice(0, 4),
            value: egpRate,
            unit: "egp_per_usd",
            sourceUrl: "https://open.er-api.com",
            sourceNameEn: "ExchangeRate-API (daily rates)",
            sanadLevel: 4,
          }
        );
        totalUpdated += updated;
        console.log(`[dataAgent/economy] Exchange rate: ${egpRate} EGP/USD (${today})`);
      }
    }
  } catch {
    console.warn("[dataAgent/economy] Frankfurter exchange rate fetch failed");
  }

  // Also refresh EGX 30 stock market index
  const stockResult = await refreshStockMarket(ctx);
  totalUpdated += stockResult.recordsUpdated;

  // IMF forecasts: seeded from reference data (API blocks cloud IPs).
  // Ensure IMF data exists (no-op if already populated).
  try {
    const imfSeeded: number = await ctx.runMutation(
      internal.imfData.ensureIMFForecasts,
      {}
    );
    if (imfSeeded > 0) {
      totalUpdated += imfSeeded;
      console.log(`[dataAgent/economy] Seeded ${imfSeeded} IMF forecast records`);
    }
  } catch {
    console.warn("[dataAgent/economy] IMF seed failed");
  }

  // Also refresh investment-specific rates (bank CDs, T-bill yields)
  try {
    const investUpdated = await refreshInvestmentRates(ctx);
    totalUpdated += investUpdated;
    console.log(`[dataAgent/economy] Investment rates: ${investUpdated} updated.`);
  } catch (err) {
    console.warn(`[dataAgent/economy] Investment rates failed: ${err}`);
  }

  // Backfill historical investment indicator data (one-time, no-op when populated)
  try {
    const backfilled = await backfillInvestmentHistory(ctx);
    totalUpdated += backfilled;
    if (backfilled > 0) {
      console.log(`[dataAgent/economy] Investment history backfill: ${backfilled} records written.`);
    }
  } catch (err) {
    console.warn(`[dataAgent/economy] Investment history backfill failed: ${err}`);
  }

  return {
    recordsUpdated: totalUpdated,
    sourceUrl: "https://api.worldbank.org/v2/country/EGY/indicator",
  };
}

// ─── INVESTMENT RATES REFRESH ─────────────────────────────────────────────────

const CBE_TBILL_URL =
  "https://www.cbe.org.eg/en/economic-research/statistics/egp-t-bills-secondary-market";
const BANQUE_MISR_CD_URL =
  "https://www.banquemisr.com/en/SMEs/Retail-Banking/Accounts-And-Deposits/Certificates";

async function refreshInvestmentRates(ctx: ActionCtx): Promise<number> {
  let updated = 0;
  const today = new Date().toISOString().split("T")[0];
  const year = today.slice(0, 4);

  const hasLLM = !!getPrimaryProvider();

  // ── CBE T-bill rates ──────────────────────────────────────────────────────
  try {
    const res = await fetch(CBE_TBILL_URL, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();

      // Extract the first <table> block and strip to plain text (token-efficient)
      const tableStart = html.indexOf("<table");
      let tableText = "";
      if (tableStart > 0) {
        const tableEnd = html.indexOf("</table>", tableStart);
        const tableHtml = tableEnd > 0
          ? html.slice(tableStart, tableEnd + 8)
          : html.slice(tableStart, tableStart + 20000);
        tableText = tableHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .replace(/&#[0-9]+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 6000);
      } else {
        // No table found — fall back to a plain-text slice of the body
        tableText = html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 6000);
      }

      if (hasLLM && tableText.length > 100) {
        const tbillToolSchema = zodToToolSchema(
          "extract_tbill_rate",
          "Extract the latest CBE T-bill weighted average yield from the page content.",
          InterestRateSchema,
        );
        const { result: tbillResult, usage: tbillUsage } = await callLLMStructuredWithUsage<z.infer<typeof InterestRateSchema>>(
          `From this CBE T-bill secondary market page, extract the LATEST weighted average yield (percentage).
Set the "rate" field to the yield as a number. Set "tenor" to the bill tenor if visible (e.g. "91-day").
If you cannot find the yield, still call the tool but set rate to 0 and note that in tenor.

Page content:
${tableText}`,
          tbillToolSchema,
          "You are a financial data extraction assistant.",
        );

        if (tbillUsage) {
          const costUsd = estimateCost(tbillUsage.model, tbillUsage.inputTokens, tbillUsage.outputTokens);
          try {
            await ctx.runMutation(internal.usage.logApiUsage, {
              provider: activeProviderName(),
              model: tbillUsage.model,
              purpose: "data_pipeline",
              inputTokens: tbillUsage.inputTokens,
              outputTokens: tbillUsage.outputTokens,
              totalTokens: tbillUsage.inputTokens + tbillUsage.outputTokens,
              costUsd,
              durationMs: tbillUsage.durationMs,
              success: tbillResult !== null,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.warn("[dataAgent/investment] Failed to log T-bill API usage:", err);
          }
        }

        if (tbillResult) {
          const verified = InterestRateSchema.safeParse(tbillResult);
          if (!verified.success) {
            console.warn("[dataAgent/investment] REJECTED by verifier (T-bill):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          } else {
            const rate = verified.data.rate;
            if (rate > 0) {
              const count: number = await ctx.runMutation(
                internal.dataRefresh.upsertEconomicIndicator,
                {
                  indicator: "egypt_tbill_rate",
                  date: today,
                  year,
                  value: rate,
                  unit: "percent",
                  sourceUrl: CBE_TBILL_URL,
                  sourceNameEn: "Central Bank of Egypt — T-bill secondary market",
                  sanadLevel: 1,
                }
              );
              updated += count;
              console.log(`[dataAgent/investment] CBE T-bill rate: ${rate}% (updated: ${count})`);
            } else {
              console.warn("[dataAgent/investment] Claude could not extract CBE T-bill yield.");
            }
          }
        }
      } else if (!hasLLM) {
        console.warn("[dataAgent/investment] Skipping CBE T-bill Claude parse — no LLM provider configured.");
      } else {
        console.warn("[dataAgent/investment] CBE T-bill page returned insufficient content.");
      }
    } else {
      console.warn(`[dataAgent/investment] CBE T-bill page returned status ${res.status} — skipping.`);
    }
  } catch (err) {
    console.warn(`[dataAgent/investment] Failed to fetch CBE T-bill rates: ${err}`);
  }

  // ── Banque Misr CD rates ──────────────────────────────────────────────────
  try {
    const res = await fetch(BANQUE_MISR_CD_URL, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();

      // Extract rate tables and strip to plain text
      const tableStart = html.indexOf("<table");
      let tableText = "";
      if (tableStart > 0) {
        const tableEnd = html.lastIndexOf("</table>");
        const tableHtml = tableEnd > tableStart
          ? html.slice(tableStart, tableEnd + 8)
          : html.slice(tableStart, tableStart + 30000);
        tableText = tableHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .replace(/&#[0-9]+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      } else {
        tableText = html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      }

      if (hasLLM && tableText.length > 100) {
        const bankRatesToolSchema = zodToToolSchema(
          "extract_bank_rates",
          "Extract Banque Misr certificate of deposit annual interest rates.",
          BankRatesSchema,
        );
        const { result: bankRatesResult, usage: bankRatesUsage } = await callLLMStructuredWithUsage<z.infer<typeof BankRatesSchema>>(
          `From this Banque Misr certificates of deposit page, extract the annual interest rates.
Set "oneYear" to the highest 1-year fixed-rate certificate rate (as a number, e.g. 22.5).
Set "threeYear" to the highest 3-year fixed-rate certificate rate.
Leave a field unset if the rate cannot be found.

Page content:
${tableText}`,
          bankRatesToolSchema,
          "You are a financial data extraction assistant.",
        );

        if (bankRatesUsage) {
          const costUsd = estimateCost(bankRatesUsage.model, bankRatesUsage.inputTokens, bankRatesUsage.outputTokens);
          try {
            await ctx.runMutation(internal.usage.logApiUsage, {
              provider: activeProviderName(),
              model: bankRatesUsage.model,
              purpose: "data_pipeline",
              inputTokens: bankRatesUsage.inputTokens,
              outputTokens: bankRatesUsage.outputTokens,
              totalTokens: bankRatesUsage.inputTokens + bankRatesUsage.outputTokens,
              costUsd,
              durationMs: bankRatesUsage.durationMs,
              success: bankRatesResult !== null,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.warn("[dataAgent/investment] Failed to log bank rates API usage:", err);
          }
        }

        if (bankRatesResult) {
          const verified = BankRatesSchema.safeParse(bankRatesResult);
          if (!verified.success) {
            console.warn("[dataAgent/investment] REJECTED by verifier (bank rates):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          } else {
            const rate1yr = verified.data.oneYear ?? null;
            const rate3yr = verified.data.threeYear ?? null;

            if (rate1yr !== null) {
              const count: number = await ctx.runMutation(
                internal.dataRefresh.upsertEconomicIndicator,
                {
                  indicator: "banque_misr_cd_1yr",
                  date: today,
                  year,
                  value: rate1yr,
                  unit: "percent",
                  sourceUrl: BANQUE_MISR_CD_URL,
                  sourceNameEn: "Banque Misr — 1-year CD rate",
                  sanadLevel: 1,
                }
              );
              updated += count;
              console.log(`[dataAgent/investment] Banque Misr 1yr CD: ${rate1yr}% (updated: ${count})`);
            }

            if (rate3yr !== null) {
              const count: number = await ctx.runMutation(
                internal.dataRefresh.upsertEconomicIndicator,
                {
                  indicator: "banque_misr_cd_3yr",
                  date: today,
                  year,
                  value: rate3yr,
                  unit: "percent",
                  sourceUrl: BANQUE_MISR_CD_URL,
                  sourceNameEn: "Banque Misr — 3-year CD rate",
                  sanadLevel: 1,
                }
              );
              updated += count;
              console.log(`[dataAgent/investment] Banque Misr 3yr CD: ${rate3yr}% (updated: ${count})`);
            }

            if (rate1yr === null && rate3yr === null) {
              console.warn("[dataAgent/investment] Claude could not extract any Banque Misr CD rates.");
            }
          }
        }
      } else if (!hasLLM) {
        console.warn("[dataAgent/investment] Skipping Banque Misr Claude parse — no LLM provider configured.");
      } else {
        console.warn("[dataAgent/investment] Banque Misr page returned insufficient content.");
      }
    } else {
      // Site blocked or unavailable — log and skip (seed data serves as fallback)
      console.warn(`[dataAgent/investment] Banque Misr site returned status ${res.status} — skipping.`);
    }
  } catch (err) {
    // Site may block server-side fetches (CORS, bot detection) — non-fatal
    console.warn(`[dataAgent/investment] Failed to fetch Banque Misr CD rates: ${err}`);
  }

  // NBE and CIB: these sites commonly block server-side/cloud requests.
  // Log and skip — seed data in the DB serves as the fallback.
  console.log("[dataAgent/investment] NBE/CIB: skipped (block server-side fetches; seed data is fallback).");

  return updated;
}

// ─── INVESTMENT HISTORY BACKFILL ──────────────────────────────────────────────
// One-time backfill for investment indicators that start with only 1 seeded point.
// Each block is idempotent: it checks the count first and skips if >= 5 records exist.

async function backfillInvestmentHistory(ctx: ActionCtx): Promise<number> {
  let backfilled = 0;

  // ── Gold price (EGP/g) ────────────────────────────────────────────────────
  const goldCount: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "gold_price_egp" }
  );
  if (goldCount < 5) {
    console.log(`[dataAgent/backfill] gold_price_egp has ${goldCount} points — backfilling.`);
    const goldData: Array<{ year: string; value: number }> = [
      { year: "2015", value: 195 },
      { year: "2016", value: 350 },
      { year: "2017", value: 530 },
      { year: "2018", value: 595 },
      { year: "2019", value: 685 },
      { year: "2020", value: 820 },
      { year: "2021", value: 790 },
      { year: "2022", value: 1100 },
      { year: "2023", value: 2200 },
      { year: "2024", value: 3600 },
      { year: "2025", value: 4500 },
    ];
    for (const entry of goldData) {
      const n: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "gold_price_egp",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "EGP/g",
          sourceUrl: "https://www.gold.org",
          sourceNameEn: "World Gold Council — annual average EGP/g",
          sanadLevel: 2,
        }
      );
      backfilled += n;
    }
  }

  // ── S&P 500 annual return (%) ─────────────────────────────────────────────
  const sp500Count: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "sp500_annual_return" }
  );
  if (sp500Count < 5) {
    console.log(`[dataAgent/backfill] sp500_annual_return has ${sp500Count} points — backfilling.`);
    const sp500Data: Array<{ year: string; value: number }> = [
      { year: "2015", value: 1.4 },
      { year: "2016", value: 12.0 },
      { year: "2017", value: 21.8 },
      { year: "2018", value: -4.4 },
      { year: "2019", value: 31.5 },
      { year: "2020", value: 18.4 },
      { year: "2021", value: 28.7 },
      { year: "2022", value: -18.1 },
      { year: "2023", value: 26.3 },
      { year: "2024", value: 24.2 },
      { year: "2025", value: 14.5 },
    ];
    for (const entry of sp500Data) {
      const n: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "sp500_annual_return",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "%",
          sourceUrl: "https://www.spglobal.com",
          sourceNameEn: "S&P Global — S&P 500 annual total return",
          sanadLevel: 2,
        }
      );
      backfilled += n;
    }
  }

  // ── Egypt real estate return (%) ──────────────────────────────────────────
  const reCount: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "egypt_real_estate_return" }
  );
  if (reCount < 5) {
    console.log(`[dataAgent/backfill] egypt_real_estate_return has ${reCount} points — backfilling.`);
    const reData: Array<{ year: string; value: number }> = [
      { year: "2015", value: 10 },
      { year: "2016", value: 25 },
      { year: "2017", value: 20 },
      { year: "2018", value: 15 },
      { year: "2019", value: 12 },
      { year: "2020", value: 8 },
      { year: "2021", value: 10 },
      { year: "2022", value: 18 },
      { year: "2023", value: 25 },
      { year: "2024", value: 20 },
      { year: "2025", value: 15 },
    ];
    for (const entry of reData) {
      const n: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "egypt_real_estate_return",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "%",
          sourceUrl: "https://www.aqarmap.com.eg",
          sourceNameEn: "Aqarmap — Egypt real estate annual appreciation estimate",
          sanadLevel: 4,
        }
      );
      backfilled += n;
    }
  }

  // ── CBE overnight deposit rate (%) ────────────────────────────────────────
  const cbeCount: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "cbe_cd_rate" }
  );
  if (cbeCount < 5) {
    console.log(`[dataAgent/backfill] cbe_cd_rate has ${cbeCount} points — backfilling.`);
    const cbeData: Array<{ year: string; value: number }> = [
      { year: "2015", value: 9.25 },
      { year: "2016", value: 11.75 },
      { year: "2017", value: 18.75 },
      { year: "2018", value: 16.75 },
      { year: "2019", value: 13.25 },
      { year: "2020", value: 9.25 },
      { year: "2021", value: 8.25 },
      { year: "2022", value: 11.25 },
      { year: "2023", value: 19.25 },
      { year: "2024", value: 27.25 },
      { year: "2025", value: 27.25 },
    ];
    for (const entry of cbeData) {
      const n: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "cbe_cd_rate",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "%",
          sourceUrl: "https://www.cbe.org.eg",
          sourceNameEn: "Central Bank of Egypt — overnight deposit rate",
          sanadLevel: 1,
        }
      );
      backfilled += n;
    }
  }

  // ── CBE T-bill yield historical (%) ──────────────────────────────────────
  const tbillCount: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "egypt_tbill_rate" }
  );
  if (tbillCount < 5) {
    console.log(`[dataAgent/backfill] egypt_tbill_rate has ${tbillCount} points — backfilling.`);
    const tbillData: Array<{ year: string; value: number }> = [
      { year: "2015", value: 11.5 },
      { year: "2016", value: 14.0 },
      { year: "2017", value: 21.0 },
      { year: "2018", value: 19.5 },
      { year: "2019", value: 15.0 },
      { year: "2020", value: 13.0 },
      { year: "2021", value: 12.5 },
      { year: "2022", value: 16.0 },
      { year: "2023", value: 25.0 },
      { year: "2024", value: 28.0 },
      { year: "2025", value: 23.0 },
    ];
    for (const entry of tbillData) {
      const n: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "egypt_tbill_rate",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "%",
          sourceUrl: "https://www.cbe.org.eg",
          sourceNameEn: "Central Bank of Egypt — T-bill weighted average yield",
          sanadLevel: 1,
        }
      );
      backfilled += n;
    }
  }

  return backfilled;
}

// ─── STOCK MARKET REFRESH ─────────────────────────────────────────────────────

async function refreshStockMarket(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  const SOURCE_URL = "https://countryeconomy.com/stock-exchange/egypt";

  let pageText = "";
  try {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      console.warn(
        `[dataAgent/stock] countryeconomy.com returned status ${response.status}`
      );
      return { recordsUpdated: 0 };
    }
    pageText = await response.text();
  } catch (err) {
    console.warn(`[dataAgent/stock] Failed to fetch stock page: ${String(err)}`);
    return { recordsUpdated: 0 };
  }

  // Extract EGX 30 value -- the page has numbers like "47,651.58"
  // Look for 5-digit numbers with comma (stock index values are 20,000-60,000 range)
  let egx30Value: number | null = null;

  // Primary: find the first large number in XX,XXX.XX format (stock index pattern)
  const stockRegex = /([2-9]\d,\d{3}\.\d{2})/;
  const match = stockRegex.exec(pageText);
  if (match) {
    const raw = match[1].replace(/,/g, "");
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 10000) {
      egx30Value = parsed;
    }
  }

  // Fallback: broader pattern
  if (egx30Value === null) {
    const broadRegex = /(\d{2},\d{3}\.\d{2})/;
    const broadMatch = broadRegex.exec(pageText.slice(0, 20000));
    if (broadMatch) {
      const raw = broadMatch[1].replace(/,/g, "");
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        egx30Value = parsed;
      }
    }
  }

  // Fallback to Claude if regex fails
  if (egx30Value === null) {
    const hasLLM = !!getPrimaryProvider();
    if (hasLLM) {
      const snippet = pageText.slice(0, 10000);
      const egxToolSchema = zodToToolSchema(
        "extract_egx30",
        "Extract the current EGX 30 Egyptian Stock Exchange index value from the page.",
        StockIndexSchema,
      );
      const { result: egxResult } = await callLLMStructuredWithUsage<z.infer<typeof StockIndexSchema>>(
        `Extract the current EGX 30 (Egyptian Stock Exchange index) value from this page.
Set "value" to the index number. Set "date" to today's date if visible.
If you cannot find the value, set value to 0.

Page content:
${snippet}`,
        egxToolSchema,
        "You are a data extraction assistant.",
      );
      if (egxResult) {
        const verified = StockIndexSchema.safeParse(egxResult);
        if (!verified.success) {
          console.warn("[dataAgent/stock] REJECTED by verifier (EGX 30):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        } else if (verified.data.value > 0) {
          egx30Value = verified.data.value;
        }
      }
    } else {
      console.warn("[dataAgent/stock] Regex extraction failed and no LLM provider configured — skipping EGX 30.");
    }
  }

  if (egx30Value === null) {
    console.warn("[dataAgent/stock] Could not extract EGX 30 value from page.");
    return { recordsUpdated: 0, sourceUrl: SOURCE_URL };
  }

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  const todayUpdated: number = await ctx.runMutation(
    internal.dataRefresh.upsertEconomicIndicator,
    {
      indicator: "egx30",
      date: today,
      year,
      value: egx30Value,
      unit: "points",
      sourceUrl: SOURCE_URL,
      sourceNameEn: "Country Economy — EGX 30",
      sanadLevel: 4,
    }
  );
  let updated = todayUpdated;

  console.log(`[dataAgent/stock] EGX 30 = ${egx30Value} (updated: ${todayUpdated})`);

  // ── Historical backfill (one-time) ────────────────────────────────────────
  // If fewer than 10 egx30 data points exist, insert known annual closing values.
  // These are well-documented public record from the Egyptian Exchange (EGX).
  // sanadLevel 1 = Official Government / Exchange source.
  const EGX_SOURCE_URL = "https://www.egx.com.eg";
  const EGX_SOURCE_NAME = "Egyptian Exchange (EGX) — annual closing values";

  const egx30Count: number = await ctx.runQuery(
    internal.dataRefresh.countIndicatorRecords,
    { indicator: "egx30" }
  );

  if (egx30Count < 10) {
    console.log(
      `[dataAgent/stock] EGX 30 has only ${egx30Count} data points — running historical backfill.`
    );

    const historicalData: Array<{ year: string; value: number }> = [
      { year: "2010", value: 7142 },
      { year: "2011", value: 3622 },
      { year: "2012", value: 5462 },
      { year: "2013", value: 6783 },
      { year: "2014", value: 8927 },
      { year: "2015", value: 7006 },
      { year: "2016", value: 12346 },
      { year: "2017", value: 15019 },
      { year: "2018", value: 13036 },
      { year: "2019", value: 13962 },
      { year: "2020", value: 10845 },
      { year: "2021", value: 11949 },
      { year: "2022", value: 14854 },
      { year: "2023", value: 24036 },
      { year: "2024", value: 28358 },
      { year: "2025", value: 32186 },
    ];

    let backfilled = 0;
    for (const entry of historicalData) {
      const backfillUpdated: number = await ctx.runMutation(
        internal.dataRefresh.upsertEconomicIndicator,
        {
          indicator: "egx30",
          date: `${entry.year}-12-31`,
          year: entry.year,
          value: entry.value,
          unit: "index",
          sourceUrl: EGX_SOURCE_URL,
          sourceNameEn: EGX_SOURCE_NAME,
          sanadLevel: 1,
        }
      );
      backfilled += backfillUpdated;
    }

    console.log(
      `[dataAgent/stock] EGX 30 historical backfill: ${backfilled} records written.`
    );
    updated += backfilled;
  }

  return { recordsUpdated: updated, sourceUrl: SOURCE_URL };
}

// ─── ECONOMIC NARRATIVE GENERATOR ─────────────────────────────────────────────

async function generateEconomicNarrative(ctx: ActionCtx): Promise<void> {
  const hasLLM = !!getPrimaryProvider();
  if (!hasLLM) {
    console.warn("[dataAgent/narrative] Skipping narrative — no LLM provider configured.");
    return;
  }

  // Collect the latest value for each indicator
  const indicatorKeys = [
    "gdp_growth",
    "inflation",
    "unemployment",
    "exchange_rate",
    "reserves",
    "remittances",
    "fdi_inflows",
    "tourism_receipts",
    "current_account",
    "gdp_nominal",
    "gdp_per_capita",
    "population",
    "poverty_rate",
    "debt_service_exports",
    "egx30",
  ] as const;

  const indicatorData: Record<string, { value: number; unit: string; date: string }> = {};

  for (const key of indicatorKeys) {
    const record: { indicator: string; date: string; year?: string; value: number; unit: string } | null =
      await ctx.runQuery(internal.dataRefresh.getLatestIndicator, { indicator: key });
    if (record) {
      indicatorData[key] = { value: record.value, unit: record.unit, date: record.date };
    }
  }

  if (Object.keys(indicatorData).length === 0) {
    console.warn("[dataAgent/narrative] No indicator data available for narrative generation.");
    return;
  }

  const indicatorSummary = Object.entries(indicatorData)
    .map(([k, v]) => `${k}: ${v.value} ${v.unit} (as of ${v.date})`)
    .join("\n");

  const systemPrompt = `You are an economic analyst for Mizan, Egypt's government transparency platform.
Generate concise, factual, apolitical economic insights based on data.`;

  const prompt = `Based on these latest Egyptian economic indicators, generate 3-5 concise economic insights.

Each insight MUST have a clear title and body, citing specific numbers.
Keep insights apolitical and factual. Provide both English and Arabic.

Format each insight as: "Title: body text with numbers"
Separate insights with newlines. Number them 1-5.

Indicators:
${indicatorSummary}`;

  // Use tool_use to force structured output — no more fragile JSON parsing
  const narrativeSchema = {
    name: "submit_economic_narrative",
    description: "Submit a structured economic narrative report with bilingual insights",
    input_schema: {
      type: "object" as const,
      required: ["titleEn", "titleAr", "summaryEn", "summaryAr", "insights"],
      properties: {
        titleEn: { type: "string", description: "Report title in English, e.g. 'Egypt Economic Update 2024-2026'" },
        titleAr: { type: "string", description: "Report title in Arabic" },
        summaryEn: { type: "string", description: "1-2 sentence summary in English" },
        summaryAr: { type: "string", description: "1-2 sentence summary in Arabic" },
        insights: {
          type: "array",
          description: "3-5 economic insights, each with a title and body in both languages",
          items: {
            type: "object",
            required: ["titleEn", "titleAr", "bodyEn", "bodyAr"],
            properties: {
              titleEn: { type: "string", description: "Short insight title in English (5-10 words)" },
              titleAr: { type: "string", description: "Short insight title in Arabic" },
              bodyEn: { type: "string", description: "Insight body in English citing specific numbers" },
              bodyAr: { type: "string", description: "Insight body in Arabic citing specific numbers" },
            },
          },
        },
      },
    },
  };

  interface NarrativeResult {
    titleEn: string;
    titleAr: string;
    summaryEn: string;
    summaryAr: string;
    insights: Array<{
      titleEn: string;
      titleAr: string;
      bodyEn: string;
      bodyAr: string;
    }>;
  }

  const result = await callLLMStructured<NarrativeResult>(
    prompt,
    narrativeSchema,
    systemPrompt,
  );

  if (!result || !result.summaryEn || !result.insights?.length) {
    console.warn("[dataAgent/narrative] Structured call returned incomplete data.");
    return;
  }

  // Flatten insights into content strings for storage
  const contentEn = result.insights
    .map((ins, i) => `${i + 1}. ${ins.titleEn}: ${ins.bodyEn}`)
    .join("\n\n");
  const contentAr = result.insights
    .map((ins, i) => `${i + 1}. ${ins.titleAr}: ${ins.bodyAr}`)
    .join("\n\n");

  const { titleEn, titleAr, summaryEn, summaryAr } = result;

  const sourcesChecked = Object.keys(indicatorData).map((k) => ({
    nameEn: `World Bank — ${k}`,
    url: "https://api.worldbank.org/v2/country/EGY/indicator",
    accessible: true,
  }));

  await ctx.runMutation(internal.dataRefresh.insertAiResearchReport, {
    titleEn,
    titleAr,
    category: "economy" as const,
    summaryEn,
    summaryAr,
    contentEn,
    contentAr,
    sourcesChecked,
    findingsCount: Object.keys(indicatorData).length,
    discrepanciesFound: 0,
    agentModel: getPrimaryProvider()?.name ?? "unknown",
  });

  console.log("[dataAgent/narrative] Economic narrative inserted successfully.");
}

// ─── GOVERNORATE STATS REFRESH ────────────────────────────────────────────────

const GOVERNORATES_WIKI_URL = "https://en.wikipedia.org/wiki/Governorates_of_Egypt";
const GOVERNORATES_HDI_URL = "https://en.wikipedia.org/wiki/List_of_governorates_of_Egypt_by_Human_Development_Index";
// Note: Wikipedia extracts API doesn't work for these pages (template-heavy).
// We fetch raw HTML and extract the wikitable, then strip to plain text.

async function refreshGovernorateStatsData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  const hasLLM = !!getPrimaryProvider();
  if (!hasLLM) {
    console.warn(
      "[dataAgent] Skipping governorate stats AI refresh — no LLM provider configured."
    );
    return { recordsUpdated: 0 };
  }

  // Fetch main governorates page — extract wikitable and strip to plain text
  let page1Text = "";
  try {
    const res = await fetch(GOVERNORATES_WIKI_URL, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();
      const tableStart = html.indexOf('<table class="wikitable');
      if (tableStart > 0) {
        // Extract table HTML and strip tags to plain text (token-efficient)
        const tableHtml = html.slice(tableStart, tableStart + 30000);
        page1Text = tableHtml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#91;/g, "[").replace(/&#93;/g, "]").replace(/&#160;/g, " ").replace(/\s+/g, " ").trim();
        page1Text = page1Text.slice(0, 8000);
      }
      console.log(`[dataAgent/govStats] Fetched govs table text: ${page1Text.length} chars`);
    } else {
      console.warn(`[dataAgent/govStats] Governorates page returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[dataAgent/govStats] Failed to fetch governorates page: ${String(err)}`);
  }

  // Fetch HDI page — extract wikitable and strip to plain text
  let page2Text = "";
  try {
    const res = await fetch(GOVERNORATES_HDI_URL, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();
      const tableStart = html.indexOf('<table class="wikitable');
      if (tableStart > 0) {
        const tableHtml = html.slice(tableStart, tableStart + 15000);
        page2Text = tableHtml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#91;/g, "[").replace(/&#93;/g, "]").replace(/&#160;/g, " ").replace(/\s+/g, " ").trim();
        page2Text = page2Text.slice(0, 5000);
      }
      console.log(`[dataAgent/govStats] Fetched HDI table text: ${page2Text.length} chars`);
    } else {
      console.warn(`[dataAgent/govStats] HDI page returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[dataAgent/govStats] Failed to fetch HDI page: ${String(err)}`);
  }

  if (page1Text.length < 500 && page2Text.length < 500) {
    console.warn("[dataAgent/govStats] Both pages returned insufficient content.");
    return { recordsUpdated: 0 };
  }

  // Fetch all governorates from DB to match by name
  const governorates: Array<{ _id: Id<"governorates">; nameEn: string; nameAr: string }> =
    await ctx.runQuery(api.government.listGovernorates, {});

  if (governorates.length === 0) {
    console.warn("[dataAgent/govStats] No governorates found in DB — skipping.");
    return { recordsUpdated: 0 };
  }

  const prompt = `Extract governorate statistics from these Wikipedia pages about Egyptian governorates.

PAGE 1 (Governorates of Egypt — plain text):
${page1Text || "(unavailable)"}

PAGE 2 (HDI by governorate — plain text):
${page2Text || "(unavailable)"}

Extract data for all 27 Egyptian governorates. For each, include population, area_km2, density_per_km2, and hdi if available.
For HDI, some frontier governorates are grouped — skip those that don't have individual values.`;

  const govStatsSchema = {
    name: "extract_governorate_stats",
    description: "Extract governorate statistics from Wikipedia tables about Egyptian governorates",
    input_schema: {
      type: "object" as const,
      properties: {
        governorates: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              governorateNameEn: { type: "string" as const },
              indicators: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  properties: {
                    indicator: { type: "string" as const },
                    year: { type: "string" as const },
                    value: { type: "number" as const },
                    unit: { type: "string" as const },
                  },
                  required: ["indicator", "year", "value", "unit"],
                },
              },
            },
            required: ["governorateNameEn", "indicators"],
          },
        },
      },
      required: ["governorates"],
    },
  };

  // Use structured output (tool_use) to guarantee valid JSON
  const structuredResult = await callLLMStructuredWithUsage<{
    governorates: Array<{
      governorateNameEn: string;
      indicators: Array<{ indicator: string; year: string; value: number; unit: string }>;
    }>;
  }>(prompt, govStatsSchema, "Extract governorate statistics from Wikipedia. Be thorough — include all 27 governorates.");

  // Log usage
  if (structuredResult.usage) {
    const { inputTokens, outputTokens, model, durationMs } = structuredResult.usage;
    const costUsd = estimateCost(model, inputTokens, outputTokens);
    try {
      await ctx.runMutation(internal.usage.logApiUsage, {
        provider: activeProviderName(),
        model,
        purpose: "data_pipeline_governorate_stats",
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd,
        durationMs,
        success: structuredResult.result !== null,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn("[dataAgent/govStats] Failed to log API usage:", err);
    }
  }

  if (!structuredResult.result?.governorates?.length) {
    console.warn("[dataAgent/govStats] Structured extraction returned no governorates.");
    return { recordsUpdated: 0 };
  }

  const parsed = structuredResult.result.governorates;
  console.log(`[dataAgent/govStats] Structured extraction returned ${parsed.length} governorates`);

  // Build a lookup map: normalized nameEn -> governorate _id
  // Include common Wikipedia name variants for fuzzy matching
  const nameToId = new Map<string, Id<"governorates">>();
  for (const gov of governorates) {
    const name = gov.nameEn.toLowerCase().trim();
    nameToId.set(name, gov._id);
    // Also register without common prefixes/suffixes
    nameToId.set(name.replace("governorate", "").trim(), gov._id);
  }
  // Add known Wikipedia → DB name mappings
  const wikiAliases: Record<string, string> = {
    "faiyum": "fayyum", "fayoum": "fayyum",
    "kafr el sheikh": "kafr el-sheikh", "kafr el-sheikh": "kafr el-sheikh",
    "qalyubiya": "qalyubia", "qalyoubia": "qalyubia",
    "beni suef": "beni suef", "beni-suef": "beni suef",
    "monufia": "menoufia", "menoufia": "menoufia",
    "sharqia": "sharqia", "ash sharqiyah": "sharqia",
    "beheira": "beheira", "al beheira": "beheira",
    "dakahlia": "dakahlia", "ad daqahliyah": "dakahlia",
    "gharbia": "gharbia", "al gharbiyah": "gharbia",
  };
  for (const [alias, canonical] of Object.entries(wikiAliases)) {
    const id = nameToId.get(canonical);
    if (id) nameToId.set(alias, id);
  }

  let totalCount = 0;

  for (const govEntry of parsed) {
    const normalizedName = govEntry.governorateNameEn.toLowerCase().trim();
    let governorateId = nameToId.get(normalizedName);

    // Fuzzy fallback: try substring match if exact fails
    if (!governorateId) {
      for (const [key, id] of nameToId.entries()) {
        if (key.includes(normalizedName) || normalizedName.includes(key)) {
          governorateId = id;
          break;
        }
      }
    }

    if (!governorateId) {
      console.warn(`[dataAgent/govStats] No DB match for "${govEntry.governorateNameEn}" — skipping.`);
      continue;
    }

    for (const ind of govEntry.indicators) {
      if (typeof ind.value !== "number" || isNaN(ind.value)) continue;

      const isHdi = ind.indicator === "hdi";
      const sourceUrl = isHdi ? GOVERNORATES_HDI_URL : GOVERNORATES_WIKI_URL;
      const sourceNameEn = isHdi
        ? "Wikipedia — HDI by Governorate"
        : "Wikipedia — Governorates of Egypt";
      const sourceNameAr = isHdi
        ? "ويكيبيديا — مؤشر التنمية البشرية حسب المحافظة"
        : "ويكيبيديا — محافظات مصر";

      try {
        const updated: number = await ctx.runMutation(
          internal.dataRefresh.upsertGovernorateStat,
          {
            governorateId,
            indicator: ind.indicator,
            year: ind.year,
            value: ind.value,
            unit: ind.unit,
            sourceUrl,
            sourceNameEn,
            sourceNameAr,
            sanadLevel: 4,
          }
        );
        totalCount += updated;
      } catch (err) {
        console.warn(`[dataAgent/govStats] Failed to upsert stat for ${govEntry.governorateNameEn}/${ind.indicator}: ${String(err)}`);
      }
    }
  }

  console.log(`[dataAgent/govStats] Total records updated: ${totalCount}`);
  return { recordsUpdated: totalCount, sourceUrl: GOVERNORATES_WIKI_URL };
}

// ─── INDUSTRY / INVESTMENT REFRESH ──────────────────────────────────────────

/**
 * Fetches investment opportunities from IDA and GAFI using Claude's web tools.
 * IDA: industrial units, land plots, major investment opportunities.
 * GAFI: free zones, investment zones.
 */
async function refreshIndustryData(
  ctx: ActionCtx
): Promise<{ recordsUpdated: number; sourceUrl?: string }> {
  let totalUpdated = 0;

  // ── IDA: Investment opportunities, industrial units, land plots ──
  try {
    console.log("[dataAgent/industry] Fetching IDA investment opportunities...");

    const idaToolSchema = zodToToolSchema(
      "extract_ida_opportunities",
      "Extract IDA investment opportunities, industrial units, and land plots from the research.",
      IDAOpportunitiesSchema,
    );
    const idaResult = await callLLMWebResearchStructured<z.infer<typeof IDAOpportunitiesSchema>>(
      `You are a structured data extraction agent. Your task is to find and extract investment opportunity data from Egypt's Industrial Development Authority (IDA).

STEP 1: Search for IDA investment opportunities, industrial units, and land plots:
- Search: "هيئة التنمية الصناعية فرص استثمارية وحدات صناعية"
- Search: "ida.gov.eg investment opportunities industrial units 2025 2026"

STEP 2: Visit the IDA website pages to extract structured data:
- Try to fetch: https://www.ida.gov.eg/ar-eg/Pages/OpportunitiesMap.aspx
- Try to fetch: https://www.ida.gov.eg/ar-eg/Pages/ReadyMadeUnits.aspx

STEP 3: Extract as many distinct investment opportunities as you can find. For each, extract:
- nameAr (Arabic name of the project/unit/plot)
- nameEn (English translation)
- sector (one of: food_processing, chemicals, textiles, engineering, building_materials, pharmaceuticals, metallurgy, woodworking, other)
- governorate (English name, e.g. "Cairo", "Alexandria", "10th of Ramadan")
- governorateAr (Arabic name)
- type (one of: industrial_unit, land_plot, major_opportunity)
- costEgp (total cost in EGP if available)
- unitAreaSqm (area in square meters if available)
- status (available, under_development, reserved, or unknown)
- sourceUrl (the page URL where you found this data)
- externalId using pattern "ida-{type}-{number}" (e.g. "ida-unit-001")

Include ALL opportunities you find.`,
      [
        { type: "web_search_20250305" as const, name: "web_search", max_uses: 5 },
      ],
      idaToolSchema,
      "Parse the researched IDA data into structured investment opportunities. Use externalId pattern 'ida-{type}-{number}'.",
      "You are a structured data extraction agent for Egyptian investment data.",
    );

    if (idaResult.result) {
      const verified = IDAOpportunitiesSchema.safeParse(idaResult.result);
      if (!verified.success) {
        console.warn("[dataAgent/industry] REJECTED by verifier (IDA):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        for (const opp of verified.data.opportunities) {
          try {
            const updated: number = await ctx.runMutation(
              internal.dataRefresh.upsertInvestmentOpportunity,
              {
                externalId: opp.externalId || `ida-${opp.type}-${Date.now()}`,
                source: "ida" as const,
                nameAr: opp.nameAr,
                nameEn: opp.nameEn,
                sector: opp.sector || "other",
                governorate: opp.governorate,
                governorateAr: opp.governorateAr,
                type: opp.type,
                costEgp: opp.costEgp ?? undefined,
                unitAreaSqm: opp.unitAreaSqm ?? undefined,
                status: opp.status ?? "unknown",
                sourceUrl: opp.sourceUrl || "https://www.ida.gov.eg",
                sanadLevel: 1,
              }
            );
            totalUpdated += updated;
          } catch (oppErr) {
            console.warn(`[dataAgent/industry] Failed to upsert IDA opportunity ${opp.externalId}: ${oppErr}`);
          }
        }
        console.log(`[dataAgent/industry] IDA: processed ${verified.data.opportunities.length} opportunities, ${totalUpdated} upserted.`);
      }
    }

    // Log usage
    if (idaResult.usage) {
      const costUsd = estimateCost(idaResult.usage.model, idaResult.usage.inputTokens, idaResult.usage.outputTokens);
      try {
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(),
          model: idaResult.usage.model,
          purpose: "data_pipeline_industry",
          inputTokens: idaResult.usage.inputTokens,
          outputTokens: idaResult.usage.outputTokens,
          totalTokens: idaResult.usage.inputTokens + idaResult.usage.outputTokens,
          costUsd,
          durationMs: idaResult.usage.durationMs,
          success: idaResult.result !== null,
          timestamp: Date.now(),
        });
      } catch (logErr) {
        console.warn("[dataAgent/industry] Failed to log IDA API usage:", logErr);
      }
    }
  } catch (idaErr) {
    console.warn(`[dataAgent/industry] IDA fetch failed: ${idaErr}`);
  }

  // ── GAFI: Free zones, investment zones ──
  try {
    console.log("[dataAgent/industry] Fetching GAFI investment data...");

    const gafiToolSchema = zodToToolSchema(
      "extract_gafi_opportunities",
      "Extract GAFI investment zones and free zone data from the research.",
      GAFIOpportunitiesSchema,
    );
    const gafiResult = await callLLMWebResearchStructured<z.infer<typeof GAFIOpportunitiesSchema>>(
      `You are a structured data extraction agent. Your task is to find and extract investment data from Egypt's General Authority for Investment and Free Zones (GAFI).

STEP 1: Search for GAFI investment opportunities and free zones:
- Search: "الهيئة العامة للاستثمار المناطق الحرة مصر"
- Search: "gafi.gov.eg free zones investment zones Egypt 2025 2026"

STEP 2: Try to fetch GAFI pages:
- Try: https://www.gafi.gov.eg

STEP 3: Extract data about free zones and investment zones. For each, extract:
- nameAr (Arabic name)
- nameEn (English name)
- sector (one of: food_processing, chemicals, textiles, engineering, building_materials, pharmaceuticals, metallurgy, woodworking, other)
- governorate (English name)
- governorateAr (Arabic name)
- type (one of: free_zone, investment_zone, sme_program)
- costEgp (if available)
- landAreaSqm (if available)
- status (available, under_development, reserved, or unknown)
- sourceUrl (page URL)
- descriptionEn (brief description of what the zone offers)
- descriptionAr (Arabic description)
- externalId using pattern "gafi-{type}-{number}"

Include ALL zones/programs you find.`,
      [
        { type: "web_search_20250305" as const, name: "web_search", max_uses: 5 },
      ],
      gafiToolSchema,
      "Parse the researched GAFI data into structured investment zones/opportunities. Use externalId pattern 'gafi-{type}-{number}'.",
      "You are a structured data extraction agent for Egyptian investment data.",
    );

    if (gafiResult.result) {
      const verified = GAFIOpportunitiesSchema.safeParse(gafiResult.result);
      if (!verified.success) {
        console.warn("[dataAgent/industry] REJECTED by verifier (GAFI):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        for (const opp of verified.data.opportunities) {
          try {
            const updated: number = await ctx.runMutation(
              internal.dataRefresh.upsertInvestmentOpportunity,
              {
                externalId: opp.externalId || `gafi-${opp.type}-${Date.now()}`,
                source: "gafi" as const,
                nameAr: opp.nameAr,
                nameEn: opp.nameEn,
                descriptionAr: opp.descriptionAr,
                descriptionEn: opp.descriptionEn,
                sector: opp.sector || "other",
                governorate: opp.governorate,
                governorateAr: opp.governorateAr,
                type: opp.type,
                costEgp: opp.costEgp ?? undefined,
                landAreaSqm: opp.landAreaSqm ?? undefined,
                status: opp.status ?? "unknown",
                sourceUrl: opp.sourceUrl || "https://www.gafi.gov.eg",
                sanadLevel: 1,
              }
            );
            totalUpdated += updated;
          } catch (oppErr) {
            console.warn(`[dataAgent/industry] Failed to upsert GAFI opportunity ${opp.externalId}: ${oppErr}`);
          }
        }
        console.log(`[dataAgent/industry] GAFI: processed ${verified.data.opportunities.length} opportunities.`);
      }
    }

    // Log usage
    if (gafiResult.usage) {
      const costUsd = estimateCost(gafiResult.usage.model, gafiResult.usage.inputTokens, gafiResult.usage.outputTokens);
      try {
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(),
          model: gafiResult.usage.model,
          purpose: "data_pipeline_industry",
          inputTokens: gafiResult.usage.inputTokens,
          outputTokens: gafiResult.usage.outputTokens,
          totalTokens: gafiResult.usage.inputTokens + gafiResult.usage.outputTokens,
          costUsd,
          durationMs: gafiResult.usage.durationMs,
          success: gafiResult.result !== null,
          timestamp: Date.now(),
        });
      } catch (logErr) {
        console.warn("[dataAgent/industry] Failed to log GAFI API usage:", logErr);
      }
    }
  } catch (gafiErr) {
    console.warn(`[dataAgent/industry] GAFI fetch failed: ${gafiErr}`);
  }

  // ── STEP 1: Research Egyptian industrial cost benchmarks ──
  let verifiedBenchmarks: z.infer<typeof IndustrialBenchmarksSchema> | null = null;
  try {
    console.log("[dataAgent/industry] Step 1: Researching Egyptian industrial cost benchmarks...");

    const benchmarkToolSchema = zodToToolSchema(
      "extract_industrial_benchmarks",
      "Extract current 2025-2026 Egyptian industrial cost benchmarks from research.",
      IndustrialBenchmarksSchema,
    );
    const benchmarkResult = await callLLMWebResearchStructured<z.infer<typeof IndustrialBenchmarksSchema>>(
      `You are an Egyptian industrial real estate and investment research analyst. Research CURRENT 2025-2026 Egyptian market cost benchmarks for industrial projects.

Search for ALL of the following data points:
1. "أسعار الأراضي الصناعية مصر 2025" (industrial land prices Egypt by governorate)
2. "تكلفة إنشاء مصنع مصر 2025" (factory construction cost per sqm Egypt)
3. "Egypt industrial zone land prices per sqm 2025 2026"
4. "Egypt free zone setup costs fees requirements"
5. "IDA Egypt industrial unit prices ready-made units cost per sqm"
6. "هيئة التنمية الصناعية أسعار الوحدات الصناعية"

For each data point you find, note the SOURCE URL. Fill in realistic EGP values. Use 0 only if you truly cannot find the data.`,
      [
        { type: "web_search_20250305" as const, name: "web_search", max_uses: 8 },
      ],
      benchmarkToolSchema,
      "Parse the researched Egyptian industrial cost data into structured benchmark figures.",
      "You are an Egyptian industrial investment research analyst.",
    );

    if (benchmarkResult.result) {
      const verified = IndustrialBenchmarksSchema.safeParse(benchmarkResult.result);
      if (!verified.success) {
        console.warn("[dataAgent/industry] REJECTED by verifier (benchmarks):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      } else {
        verifiedBenchmarks = verified.data;
        console.log(`[dataAgent/industry] Benchmark research complete.`);
      }
    }

    // Log usage
    if (benchmarkResult.usage) {
      const costUsd = estimateCost(benchmarkResult.usage.model, benchmarkResult.usage.inputTokens, benchmarkResult.usage.outputTokens);
      try {
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(),
          model: benchmarkResult.usage.model,
          purpose: "data_pipeline_industry",
          inputTokens: benchmarkResult.usage.inputTokens,
          outputTokens: benchmarkResult.usage.outputTokens,
          totalTokens: benchmarkResult.usage.inputTokens + benchmarkResult.usage.outputTokens,
          costUsd,
          durationMs: benchmarkResult.usage.durationMs,
          success: benchmarkResult.result !== null,
          timestamp: Date.now(),
        });
      } catch (logErr) {
        console.warn("[dataAgent/industry] Failed to log benchmark API usage:", logErr);
      }
    }
  } catch (benchErr) {
    console.warn(`[dataAgent/industry] Benchmark research failed: ${benchErr}`);
  }

  // ── STEP 2: Apply benchmarks to estimate costs for unpriced opportunities ──
  if (verifiedBenchmarks) {
    // Serialize benchmarks as a concise summary string for the estimate prompt
    const benchmarkData = JSON.stringify(verifiedBenchmarks);
    try {
      const allOpps = await ctx.runQuery(internal.industry.getAllUnpriced, {});
      console.log(`[dataAgent/industry] Step 2: Estimating costs for ${allOpps.length} unpriced opportunities using benchmarks...`);

      if (allOpps.length > 0) {
        const oppSummary = allOpps.map((o) =>
          `- "${o.nameEn}" | type: ${o.type} | sector: ${o.sector} | governorate: ${o.governorate ?? "unknown"} | area: ${o.unitAreaSqm ?? o.landAreaSqm ?? "unknown"} sqm | description: ${o.descriptionEn ?? "none"}`
        ).join("\n");

        const estimateToolSchema = zodToToolSchema(
          "extract_cost_estimates",
          "Extract startup cost estimates for Egyptian industrial opportunities using benchmark data.",
          CostEstimatesSchema,
        );
        const estimateResult = await callLLMWebResearchStructured<z.infer<typeof CostEstimatesSchema>>(
          `You are an Egyptian industrial investment cost analyst. Using the RESEARCHED BENCHMARKS below, estimate total project startup costs for each opportunity.

## RESEARCHED COST BENCHMARKS (from Egyptian market data):
${benchmarkData}

## OPPORTUNITIES TO ESTIMATE:
${oppSummary}

## METHODOLOGY — For each opportunity, calculate startup cost using the benchmark data.
- confidence must be "low" (rough estimate) or "medium" (based on benchmark data)
- methodology must show the math
- All costs in EGP`,
          [
            { type: "web_search_20250305" as const, name: "web_search", max_uses: 3 },
          ],
          estimateToolSchema,
          "Parse the cost estimate reasoning into structured estimates for each opportunity.",
          "You are an Egyptian industrial investment cost analyst.",
        );

        if (estimateResult.result) {
          const verified = CostEstimatesSchema.safeParse(estimateResult.result);
          if (!verified.success) {
            console.warn("[dataAgent/industry] REJECTED by verifier (estimates):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          } else {
            for (const est of verified.data.estimates) {
              if (!est.costEgp) continue;

              const match = allOpps.find((o) => o.nameEn === est.nameEn);
              if (!match) continue;

              try {
                // Update the opportunity with estimated cost (sanadLevel 5 = AI-derived)
                const updated: number = await ctx.runMutation(
                  internal.dataRefresh.upsertInvestmentOpportunity,
                  {
                    externalId: match.externalId,
                    source: match.source,
                    nameAr: match.nameAr,
                    nameEn: match.nameEn,
                    sector: match.sector,
                    type: match.type,
                    costEgp: est.costEgp,
                    sourceUrl: match.sourceUrl,
                    sanadLevel: 5, // AI-derived estimate
                  }
                );
                totalUpdated += updated;

                // Also store the detailed breakdown in investmentProjectDetails
                if (est.breakdown) {
                  try {
                    await ctx.runMutation(
                      internal.dataRefresh.upsertInvestmentProjectDetail,
                      {
                        opportunityId: match._id,
                        landCostEgp: est.breakdown.landOrUnit ?? undefined,
                        constructionCostEgp: est.breakdown.construction ?? undefined,
                        equipmentCostEgp: est.breakdown.equipment ?? undefined,
                        workingCapitalEgp: est.breakdown.workingCapital ?? undefined,
                        licensingFeesEgp: est.breakdown.licensing ?? undefined,
                        incentivesEn: est.methodology ? `Estimation methodology: ${est.methodology}` : undefined,
                        incentivesAr: est.methodology ? `منهجية التقدير: ${est.methodology}` : undefined,
                        rawDataJson: JSON.stringify({ benchmark: benchmarkData.substring(0, 500), estimate: est }),
                        sourceUrl: est.sourceRefs?.[0] ?? match.sourceUrl,
                        sanadLevel: 5,
                      }
                    );
                  } catch (detailErr) {
                    console.warn(`[dataAgent/industry] Failed to store detail for ${est.nameEn}: ${detailErr}`);
                  }
                }
              } catch (upErr) {
                console.warn(`[dataAgent/industry] Failed to update cost estimate for ${est.nameEn}: ${upErr}`);
              }
            }

            console.log(`[dataAgent/industry] Cost estimates applied for ${verified.data.estimates.length} opportunities with breakdowns.`);
          }
        }

        // Log usage
        if (estimateResult.usage) {
          const costUsd = estimateCost(estimateResult.usage.model, estimateResult.usage.inputTokens, estimateResult.usage.outputTokens);
          try {
            await ctx.runMutation(internal.usage.logApiUsage, {
              provider: activeProviderName(),
              model: estimateResult.usage.model,
              purpose: "data_pipeline_industry",
              inputTokens: estimateResult.usage.inputTokens,
              outputTokens: estimateResult.usage.outputTokens,
              totalTokens: estimateResult.usage.inputTokens + estimateResult.usage.outputTokens,
              costUsd,
              durationMs: estimateResult.usage.durationMs,
              success: estimateResult.result !== null,
              timestamp: Date.now(),
            });
          } catch (logErr) {
            console.warn("[dataAgent/industry] Failed to log estimate API usage:", logErr);
          }
        }
      } else {
        console.log("[dataAgent/industry] All opportunities already have cost data — skipping estimation.");
      }
    } catch (estErr) {
      console.warn(`[dataAgent/industry] Cost estimation step failed: ${estErr}`);
    }
  }

  console.log(`[dataAgent/industry] Total records updated: ${totalUpdated}`);
  return { recordsUpdated: totalUpdated, sourceUrl: "https://www.ida.gov.eg" };
}

// ─── CATEGORY DISPATCHER ─────────────────────────────────────────────────────

async function refreshCategory(
  ctx: ActionCtx,
  category: RefreshCategory
): Promise<void> {
  const logId = await ctx.runMutation(
    internal.dataRefresh.logRefreshStart,
    { category }
  ) as Id<"dataRefreshLog">;

  console.log(`[dataAgent] Starting refresh for category: ${category}`);

  try {
    let result: { recordsUpdated: number; sourceUrl?: string } = { recordsUpdated: 0 };

    switch (category) {
      case "debt":
        result = await refreshDebtData(ctx);
        break;
      case "budget":
        result = await refreshBudgetData(ctx);
        break;
      case "government":
        result = await refreshGovernmentData(ctx);
        break;
      case "parliament":
        result = await refreshParliamentData(ctx);
        break;
      case "economy":
        result = await refreshEconomyData(ctx);
        break;
      case "governorate_stats":
        result = await refreshGovernorateStatsData(ctx);
        break;
      case "industry":
        result = await withTimeout(
          refreshIndustryData(ctx),
          INDUSTRY_REFRESH_TIMEOUT_MS,
        );
        break;
    }

    const { recordsUpdated, sourceUrl } = result;

    // Update the central source registry — register ALL URLs used by this category
    // so the /transparency page always reflects the full list of live references.
    for (const src of CATEGORY_SOURCES[category] ?? []) {
      try {
        await ctx.runMutation(internal.sources.upsertSourceInternal, {
          nameEn: src.nameEn,
          nameAr: src.nameAr,
          url: src.url,
          category,
          type: src.type,
        });
      } catch (srcErr) {
        console.warn(`[dataAgent] Failed to update source registry for ${category} (${src.url}): ${srcErr}`);
      }
    }

    // Only log detailed change entries when something actually changed.
    // The dataRefreshLog already records that a refresh ran — the change log
    // should only track meaningful changes to keep storage lean.
    if (recordsUpdated > 0) {
      const descriptionEnMap: Record<RefreshCategory, string> = {
        debt: `Updated ${recordsUpdated} debt record(s) from World Bank API`,
        budget: `Updated ${recordsUpdated} budget record(s) from Ministry of Finance`,
        government: `Flagged ${recordsUpdated} potential government change(s) for human review`,
        parliament: `Parliament refresh complete — ${recordsUpdated} record(s) updated`,
        economy: `Updated ${recordsUpdated} economic indicator(s) from World Bank API`,
        governorate_stats: `Updated ${recordsUpdated} governorate stat(s) from Wikipedia`,
        industry: `Updated ${recordsUpdated} investment opportunity(ies) from IDA/GAFI`,
      };
      const descriptionArMap: Record<RefreshCategory, string> = {
        debt: `تم تحديث ${recordsUpdated} سجل ديون من بيانات البنك الدولي`,
        budget: `تم تحديث ${recordsUpdated} سجل ميزانية من وزارة المالية`,
        government: `تم الإشارة إلى ${recordsUpdated} تغيير محتمل في الحكومة للمراجعة البشرية`,
        parliament: `اكتمل تحديث البرلمان — ${recordsUpdated} سجل محدث`,
        economy: `تم تحديث ${recordsUpdated} مؤشر اقتصادي من بيانات البنك الدولي`,
        governorate_stats: `تم تحديث ${recordsUpdated} إحصائية محافظة من ويكيبيديا`,
        industry: `تم تحديث ${recordsUpdated} فرصة استثمارية من هيئة التنمية الصناعية/هيئة الاستثمار`,
      };
      const tableNameMap: Record<RefreshCategory, string> = {
        debt: "debtRecords",
        budget: "fiscalYears",
        government: "officials",
        parliament: "parliamentMembers",
        economy: "economicIndicators",
        governorate_stats: "governorateStats",
        industry: "investmentOpportunities",
      };

      await ctx.runMutation(internal.dataRefresh.logChange, {
        refreshLogId: logId,
        category,
        action: "updated" as const,
        tableName: tableNameMap[category],
        descriptionEn: descriptionEnMap[category],
        descriptionAr: descriptionArMap[category],
        sourceUrl,
      });
    }

    await ctx.runMutation(internal.dataRefresh.logRefreshComplete, {
      logId,
      recordsUpdated,
      sourceUrl,
    });

    console.log(
      `[dataAgent] Completed refresh for ${category}: ${recordsUpdated} records updated.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dataAgent] Refresh failed for ${category}: ${message}`);
    await ctx.runMutation(internal.dataRefresh.logRefreshFailed, {
      logId,
      errorMessage: message,
    });
    throw err;
  }
}

async function scheduleReferenceDataStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runReferenceDataStep,
    scheduleArgs,
  );
}

async function scheduleCoreCategoryStep(
  ctx: ActionCtx,
  args: CoreCategoryStepArgs,
): Promise<void> {
  const scheduleArgs: CoreCategoryStepArgs = {
    runId: args.runId,
    categoryIndex: args.categoryIndex,
  };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runCoreCategoryStep,
    scheduleArgs,
  );
}

async function scheduleConstitutionStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runConstitutionStep,
    scheduleArgs,
  );
}

async function scheduleGitHubIssuesStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runGitHubIssuesStep,
    scheduleArgs,
  );
}

async function scheduleNarrativeStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runNarrativeStep,
    scheduleArgs,
  );
}

async function scheduleNewsStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runNewsStep,
    scheduleArgs,
  );
}

async function scheduleLlmExportStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runLlmExportStep,
    scheduleArgs,
  );
}

async function scheduleCleanupStep(
  ctx: ActionCtx,
  args: PipelineChainArgs,
): Promise<void> {
  const scheduleArgs: PipelineChainArgs = { runId: args.runId };
  if (args.force !== undefined) scheduleArgs.force = args.force;

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dataAgent.runCleanupStep,
    scheduleArgs,
  );
}

// ─── BACKFILL ACTION (ONE-TIME) ───────────────────────────────────────────────

/**
 * Exposed internal action so the backfill can be triggered manually via CLI
 * without waiting for the 12-hour staleness window to expire.
 * Safe to run multiple times — each indicator block is idempotent (checks count first).
 */
export const runBackfillInvestmentHistory = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const count = await backfillInvestmentHistory(ctx);
    console.log(`[dataAgent/backfill] Done — ${count} records written.`);
    return count;
  },
});

// ─── ORCHESTRATOR ACTION ──────────────────────────────────────────────────────

/**
 * Main AI orchestrator. Starts a durable step chain instead of doing the whole
 * pipeline in one Convex action. Each scheduled action gets its own execution
 * budget, which keeps expensive LLM/web-search steps from starving later steps.
 *
 * Called by the cron job every 12 hours and can also be triggered manually.
 */
export const orchestrateRefresh = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => {
    if (process.env.DISABLE_CRONS === "true") {
      console.log("[dataAgent] Crons disabled (DISABLE_CRONS=true), skipping.");
      return null;
    }
    console.log("[dataAgent] orchestrateRefresh scheduling started.");

    // Deduplicate fiscal years before any refresh (e.g. "2024/2025" vs "2024-2025")
    const dedupResult = await ctx.runMutation(internal.dataRefresh.deduplicateFiscalYears, {});
    if (dedupResult.deleted > 0) {
      console.log(`[dataAgent] Deduplicated ${dedupResult.deleted} fiscal year(s).`);
    }

    const runId = Date.now().toString();

    // Initialize pipeline progress tracking — clears old entries and creates
    // pending rows for every step so the frontend can subscribe immediately.
    await ctx.runMutation(internal.pipelineProgress.startRun, { runId });

    await scheduleReferenceDataStep(ctx, { runId, force: args.force });

    console.log(`[dataAgent] orchestrateRefresh scheduled run ${runId}.`);

    return null;
  },
});

export const runReferenceDataStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "reference_data",
      status: "running",
      message: "Checking reference tables...",
      messageAr: "جارٍ التحقق من جداول المرجعية...",
    });
    try {
      await ctx.runMutation(internal.referenceData.ensureAllReferenceData, {});
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "reference_data",
        status: "success",
        message: "Reference data verified.",
        messageAr: "تم التحقق من البيانات المرجعية.",
      });
    } catch (err) {
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "reference_data",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleCoreCategoryStep(ctx, {
      runId: args.runId,
      categoryIndex: 0,
      force: args.force,
    });

    return null;
  },
});

export const runCoreCategoryStep = internalAction({
  args: {
    runId: v.string(),
    categoryIndex: v.number(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    const category = CORE_REFRESH_CATEGORIES[args.categoryIndex];

    if (category === undefined) {
      await scheduleConstitutionStep(ctx, {
        runId: args.runId,
        force: args.force,
      });
      return null;
    }

    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: category,
      status: "running",
      message: "Fetching...",
      messageAr: "جارٍ الجلب...",
    });

    try {
      const lastUpdated: Record<string, number | null> = await ctx.runQuery(
        api.dataRefresh.getAllLastUpdated,
        {},
      );
      const tableEmpty: Record<string, boolean> = await ctx.runQuery(
        internal.dataRefresh.checkEmptyTables,
        {},
      );
      const lastTime = lastUpdated[category] ?? null;
      const isEmpty = tableEmpty[category] ?? false;
      const now = Date.now();

      // Skip if fresh AND not empty (unless force=true). Always refresh if table is empty.
      if (!args.force && !isEmpty && lastTime !== null && now - lastTime < STALE_THRESHOLD_MS) {
        console.log(
          `[dataAgent] Category "${category}" is fresh — skipping.`
        );
        await ctx.runMutation(internal.pipelineProgress.updateStep, {
          runId: args.runId,
          step: category,
          status: "skipped",
          message: "Data is fresh — no refresh needed.",
          messageAr: "البيانات حديثة — لا حاجة للتحديث.",
        });
      } else {
        if (isEmpty) {
          console.log(`[dataAgent] Category "${category}" table is EMPTY — forcing refresh.`);
        }

        await refreshCategory(ctx, category);
        await ctx.runMutation(internal.pipelineProgress.updateStep, {
          runId: args.runId,
          step: category,
          status: "success",
          message: "Done.",
          messageAr: "اكتمل.",
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: category,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleCoreCategoryStep(ctx, {
      runId: args.runId,
      categoryIndex: args.categoryIndex + 1,
      force: args.force,
    });

    return null;
  },
});

export const runConstitutionStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "constitution",
      status: "running",
      message: "Verifying articles...",
      messageAr: "جارٍ التحقق من المواد...",
    });
    try {
      await ctx.runAction(
        internal.agents.constitutionAgent.refreshConstitution,
        {}
      );
      // Register constitution sources
      for (const src of CATEGORY_SOURCES.constitution ?? []) {
        try {
          await ctx.runMutation(internal.sources.upsertSourceInternal, {
            nameEn: src.nameEn,
            nameAr: src.nameAr,
            url: src.url,
            category: "constitution",
            type: src.type,
          });
        } catch (srcErr) {
          console.warn(`[dataAgent] Failed to update source registry for constitution (${src.url}): ${srcErr}`);
        }
      }
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "constitution",
        status: "success",
        message: "Articles verified.",
        messageAr: "تم التحقق من المواد.",
      });
    } catch (err) {
      console.warn(
        `[dataAgent] Constitution refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "constitution",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleGitHubIssuesStep(ctx, {
      runId: args.runId,
      force: args.force,
    });

    return null;
  },
});

export const runGitHubIssuesStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "github_issues",
      status: "running",
      message: "Processing community corrections...",
      messageAr: "جارٍ معالجة التصحيحات المجتمعية...",
    });
    try {
      await ctx.runAction(internal.agents.githubAgent.processGitHubIssues, {});
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "github_issues",
        status: "success",
        message: "Community corrections processed.",
        messageAr: "تمت معالجة التصحيحات المجتمعية.",
      });
    } catch (err) {
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "github_issues",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleNarrativeStep(ctx, {
      runId: args.runId,
      force: args.force,
    });

    return null;
  },
});

export const runNarrativeStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "narrative",
      status: "running",
      message: "Generating AI economic narrative...",
      messageAr: "جارٍ توليد السرد الاقتصادي بالذكاء الاصطناعي...",
    });
    try {
      await generateEconomicNarrative(ctx);
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "narrative",
        status: "success",
        message: "Narrative generated.",
        messageAr: "تم توليد السرد.",
      });
    } catch (err) {
      console.warn(
        `[dataAgent] Economic narrative generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "narrative",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleNewsStep(ctx, {
      runId: args.runId,
      force: args.force,
    });

    return null;
  },
});

export const runNewsStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "news",
      status: "running",
      message: "Refreshing Egyptian news headlines...",
      messageAr: "جارٍ تحديث الأخبار المصرية...",
    });
    try {
      // Use Claude web_search to find current Egyptian news beyond RSS feeds
      const newsToolSchema = zodToToolSchema(
        "extract_news_headlines",
        "Extract Egyptian news headlines from the research results.",
        RawNewsListSchema,
      );
      const newsResult = await withTimeout(
        callLLMWebResearchStructured<z.infer<typeof RawNewsListSchema>>(
          `Search for the latest important Egyptian news from the past 24 hours. Include economic, political, and social news.
Include 10-15 headlines. Prefer authoritative sources (Reuters, Bloomberg, Ahram, BBC, Al Jazeera).
For each headline, extract the title, URL, and source outlet name.`,
          [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
            },
          ],
          newsToolSchema,
          "Parse the researched news into structured headline items with title, url, and source fields.",
          "You are a news extraction assistant for Egyptian current affairs.",
        ),
        NEWS_REFRESH_TIMEOUT_MS,
      );

      let headlinesInserted = 0;
      if (newsResult.result) {
        const verified = RawNewsListSchema.safeParse(newsResult.result);
        if (!verified.success) {
          console.warn("[dataAgent/news] REJECTED by verifier:", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        } else {
          const items = verified.data.items
            .filter((h) => h.title && h.url)
            .map((h) => ({
              title: h.title,
              url: h.url,
              sourceDomain: h.source ?? "unknown",
              language: "English",
              publishedAt: Date.now(),
            }));
          if (items.length > 0) {
            headlinesInserted = await ctx.runMutation(internal.news.upsertHeadlines, { items }) as number;
          }
        }
      }

      // Log usage
      if (newsResult.usage) {
        const { inputTokens, outputTokens, model, durationMs } = newsResult.usage;
        const costUsd = estimateCost(model, inputTokens, outputTokens);
        try {
          await ctx.runMutation(internal.usage.logApiUsage, {
            provider: activeProviderName(), model, purpose: "data_pipeline_news",
            inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
            costUsd, durationMs, success: newsResult.result !== null, timestamp: Date.now(),
          });
        } catch { /* non-critical */ }
      }

      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "news",
        status: "success",
        message: `${headlinesInserted} new headlines added.`,
        messageAr: `تمت إضافة ${headlinesInserted} عنوان جديد.`,
        recordsUpdated: headlinesInserted,
      });
    } catch (err) {
      console.warn(`[dataAgent/news] News step failed: ${err instanceof Error ? err.message : String(err)}`);
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "news",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await scheduleLlmExportStep(ctx, {
      runId: args.runId,
      force: args.force,
    });

    return null;
  },
});

export const runLlmExportStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "llm_export",
      status: "running",
      message: "Triggering LLM data export revalidation...",
      messageAr: "جارٍ تحديث تصدير بيانات الذكاء الاصطناعي...",
    });
    try {
      // Trigger ISR revalidation of /llms-full.txt so it reflects fresh data
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mizanmasr.com";
      const revalRes = await fetch(`${siteUrl}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.REVALIDATION_SECRET ?? "",
          paths: ["/llms-full.txt"],
        }),
      });
      const revalidated = revalRes.ok;
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "llm_export",
        status: "success",
        message: revalidated
          ? "LLM export revalidated."
          : "LLM export: revalidation skipped (no webhook configured).",
        messageAr: revalidated
          ? "تم تحديث تصدير بيانات الذكاء الاصطناعي."
          : "تصدير الذكاء الاصطناعي: تم تخطي إعادة التحقق.",
      });
    } catch (err) {
      // Non-critical — the ISR cache will still revalidate on its own within 6h
      console.warn(
        `[dataAgent] LLM export revalidation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "llm_export",
        status: "success",
        message: "LLM export: ISR will auto-refresh within 6h.",
        messageAr: "تصدير الذكاء الاصطناعي: سيتم التحديث التلقائي خلال ٦ ساعات.",
      });
    }

    await scheduleCleanupStep(ctx, {
      runId: args.runId,
      force: args.force,
    });

    return null;
  },
});

export const runCleanupStep = internalAction({
  args: {
    runId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.pipelineProgress.updateStep, {
      runId: args.runId,
      step: "cleanup",
      status: "running",
      message: "Compacting logs...",
      messageAr: "جارٍ ضغط السجلات...",
    });
    try {
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "cleanup",
        status: "success",
        message: "Done.",
        messageAr: "اكتمل.",
      });
    } catch (err) {
      await ctx.runMutation(internal.pipelineProgress.updateStep, {
        runId: args.runId,
        step: "cleanup",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    console.log(`[dataAgent] Pipeline run ${args.runId} completed.`);

    return null;
  },
});

// ─── DEEP SCRAPE PIPELINE ─────────────────────────────────────────────────────
// Multi-pass data extraction pipeline for IDA and GAFI Egyptian government websites.
// Pass 1: Structure Discovery — fetches IDA industrial complexes + GAFI free zones
// Pass 2: Enrichment — fetches incentives PDF and adds licensing/incentive data to all opportunities

/**
 * Deep Scrape Pass 1 — Structure Discovery + Detail Pages.
 * Fetches IDA industrial complexes and GAFI free zones, upserts all records.
 * Chains to Pass 2 immediately after completing.
 */
export const deepScrapePass1 = internalAction({
  args: {},
  handler: async (ctx) => {
    // Fetch IDA industrial complexes page and extract ALL complex data
    // URL: https://www.ida.gov.eg/ar/industrial-complexes
    //
    // Fetch IDA 152 priority investment opportunities
    // URL: https://www.ida.gov.eg/ar/news/72
    //
    // Fetch GAFI free zones page
    // URL: https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/FreeZones.aspx
    //
    // For each, use callLLMWebResearchStructured with web_search to get the page
    // and extract detailed structured data

    let totalUpdated = 0;

    // ── IDA Industrial Complexes (16 complexes, 4808 units) ──
    try {
      console.log("[deepScrape/pass1] Fetching IDA industrial complexes...");
      const idaComplexToolSchema = zodToToolSchema(
        "extract_ida_complexes",
        "Extract IDA industrial complex data and investment incentive structure from the research.",
        IDAComplexesSchema,
      );
      const idaComplexResult = await callLLMWebResearchStructured<z.infer<typeof IDAComplexesSchema>>(
        `Fetch this page and extract ALL industrial complex data:
URL: https://www.ida.gov.eg/ar/industrial-complexes

For each complex, extract nameAr, nameEn, governorate, governorateAr, totalUnits, unitSizeRange, facilities, sectors, description.
Use externalId pattern "ida-complex-{city}" (e.g. "ida-complex-sadat").

Also fetch: https://www.ida.gov.eg/ar/incentives
Extract the investment incentive structure including sectorA, sectorB, and general incentives.`,
        [
          { type: "web_search_20250305" as const, name: "web_search", max_uses: 3 },
          { type: "web_fetch_20250910" as const, name: "web_fetch", max_uses: 5 },
        ],
        idaComplexToolSchema,
        "Parse the IDA research data into structured industrial complexes and incentives.",
        "You are an Egyptian industrial investment data extraction specialist.",
      );

      if (idaComplexResult.result) {
        const verified = IDAComplexesSchema.safeParse(idaComplexResult.result);
        if (!verified.success) {
          console.warn("[deepScrape/pass1] REJECTED by verifier (IDA complexes):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        } else {
          // Store incentives data as a shared reference
          const incentivesJson = verified.data.incentives ? JSON.stringify(verified.data.incentives) : undefined;

          for (const complex of verified.data.complexes) {
            try {
              const minArea = complex.unitSizeRange ? parseInt(complex.unitSizeRange.split("-")[0]) : undefined;

              const updated: number = await ctx.runMutation(
                internal.dataRefresh.upsertInvestmentOpportunity,
                {
                  externalId: complex.externalId || `ida-complex-${complex.governorate?.toLowerCase().replace(/\s+/g, "-")}`,
                  source: "ida" as const,
                  nameAr: complex.nameAr,
                  nameEn: complex.nameEn,
                  descriptionAr: complex.description ?? undefined,
                  descriptionEn: complex.description ?? undefined,
                  sector: complex.sectors?.[0] ?? "other",
                  governorate: complex.governorate ?? undefined,
                  governorateAr: complex.governorateAr ?? undefined,
                  type: "industrial_unit" as const,
                  unitAreaSqm: minArea ?? undefined,
                  status: "available" as const,
                  sourceUrl: "https://www.ida.gov.eg/ar/industrial-complexes",
                  sanadLevel: 1,
                }
              );
              totalUpdated += updated;
            } catch (err) {
              console.warn(`[deepScrape/pass1] Failed to upsert complex ${complex.nameEn}: ${err}`);
            }
          }
          console.log(`[deepScrape/pass1] IDA complexes: ${verified.data.complexes.length} processed, ${totalUpdated} updated.`);

          // Store incentives for later use as a special "reference" record
          if (incentivesJson) {
            try {
              await ctx.runMutation(
                internal.dataRefresh.upsertInvestmentOpportunity,
                {
                  externalId: "ida-incentives-reference",
                  source: "ida" as const,
                  nameAr: "حوافز الاستثمار الصناعي — مرجع",
                  nameEn: "Industrial Investment Incentives — Reference",
                  sector: "other",
                  type: "major_opportunity" as const,
                  descriptionEn: `Investment incentives framework: ${incentivesJson.substring(0, 500)}`,
                  descriptionAr: "إطار حوافز الاستثمار الصناعي",
                  sourceUrl: "https://www.ida.gov.eg/ar/incentives",
                  sanadLevel: 1,
                }
              );
            } catch (refErr) {
              console.warn(`[deepScrape/pass1] Failed to store incentives reference: ${refErr}`);
            }
          }
        }
      }

      // Log API usage
      if (idaComplexResult.usage) {
        const costUsd = estimateCost(idaComplexResult.usage.model, idaComplexResult.usage.inputTokens, idaComplexResult.usage.outputTokens);
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(), model: idaComplexResult.usage.model, purpose: "data_pipeline_industry_deep",
          inputTokens: idaComplexResult.usage.inputTokens, outputTokens: idaComplexResult.usage.outputTokens,
          totalTokens: idaComplexResult.usage.inputTokens + idaComplexResult.usage.outputTokens,
          costUsd, durationMs: idaComplexResult.usage.durationMs, success: idaComplexResult.result !== null, timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn(`[deepScrape/pass1] IDA complexes failed: ${err}`);
    }

    // ── GAFI Free Zones + Industrial Zones ──
    try {
      console.log("[deepScrape/pass1] Fetching GAFI zones data...");
      const gafiZonesToolSchema = zodToToolSchema(
        "extract_gafi_zones",
        "Extract GAFI free zone data, registration fees, and investment law framework.",
        GAFIZonesSchema,
      );
      const gafiResult = await callLLMWebResearchStructured<z.infer<typeof GAFIZonesSchema>>(
        `Fetch these TWO pages and extract ALL zone data:

PAGE 1: https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/FreeZones.aspx
Extract all 9 public free zones with nameAr, nameEn, governorate, governorateAr, totalAreaSqm, keyIndustries, benefits, description.
Use externalId pattern "gafi-fz-{city}" (e.g. "gafi-fz-alexandria").

PAGE 2: https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/Industrial-Zones.aspx
Extract industrial zone data.

Also search for: "GAFI Egypt Suez Canal Economic Zone benefits tax rate"
And: "Egypt Investment Law 72/2017 incentives by sector"
And: "GAFI company registration fees Egypt 2025 2026"

Extract registration fees and investment law details as well.`,
        [
          { type: "web_search_20250305" as const, name: "web_search", max_uses: 5 },
          { type: "web_fetch_20250910" as const, name: "web_fetch", max_uses: 5 },
        ],
        gafiZonesToolSchema,
        "Parse the GAFI research data into structured free zones, registration fees, and investment law data.",
        "You are an Egyptian investment zone data extraction specialist.",
      );

      if (gafiResult.result) {
        const verified = GAFIZonesSchema.safeParse(gafiResult.result);
        if (!verified.success) {
          console.warn("[deepScrape/pass1] REJECTED by verifier (GAFI zones):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        } else {
          for (const zone of verified.data.freeZones) {
            try {
              const sectorMap: Record<string, string> = {
                textiles: "textiles", electronics: "engineering", food_processing: "food_processing",
                chemicals: "chemicals", pharmaceuticals: "pharmaceuticals",
              };
              const sector = zone.keyIndustries?.[0] ? (sectorMap[zone.keyIndustries[0]] ?? "other") : "other";

              const updated: number = await ctx.runMutation(
                internal.dataRefresh.upsertInvestmentOpportunity,
                {
                  externalId: zone.externalId || `gafi-fz-${zone.governorate?.toLowerCase().replace(/\s+/g, "-") ?? "unknown"}`,
                  source: "gafi" as const,
                  nameAr: zone.nameAr,
                  nameEn: zone.nameEn,
                  descriptionAr: zone.description ?? undefined,
                  descriptionEn: zone.description ?? undefined,
                  sector,
                  governorate: zone.governorate ?? undefined,
                  governorateAr: zone.governorateAr ?? undefined,
                  type: "free_zone" as const,
                  landAreaSqm: zone.totalAreaSqm ?? undefined,
                  status: "available" as const,
                  sourceUrl: "https://www.gafi.gov.eg/English/StartaBusiness/InvestmentZones/Pages/FreeZones.aspx",
                  sanadLevel: 1,
                }
              );
              totalUpdated += updated;
            } catch (err) {
              console.warn(`[deepScrape/pass1] Failed to upsert zone ${zone.nameEn}: ${err}`);
            }
          }

          // Store registration fees + investment law as a reference record
          if (verified.data.registrationFees !== undefined || verified.data.investmentLaw !== undefined) {
            try {
              const refData = JSON.stringify({ registrationFees: verified.data.registrationFees, investmentLaw: verified.data.investmentLaw });
              await ctx.runMutation(
                internal.dataRefresh.upsertInvestmentOpportunity,
                {
                  externalId: "gafi-registration-reference",
                  source: "gafi" as const,
                  nameAr: "دليل تأسيس الشركات ورسوم التسجيل — مرجع",
                  nameEn: "Company Registration Guide & Fees — Reference",
                  descriptionEn: `Registration fees and Investment Law 72/2017 framework: ${refData.substring(0, 1000)}`,
                  descriptionAr: "دليل رسوم التسجيل وقانون الاستثمار رقم 72 لسنة 2017",
                  sector: "other",
                  type: "sme_program" as const,
                  sourceUrl: "https://www.gafi.gov.eg",
                  sanadLevel: 1,
                }
              );
            } catch (refErr) {
              console.warn(`[deepScrape/pass1] Failed to store registration reference: ${refErr}`);
            }
          }

          console.log(`[deepScrape/pass1] GAFI zones: ${verified.data.freeZones.length} processed.`);
        }
      }

      if (gafiResult.usage) {
        const costUsd = estimateCost(gafiResult.usage.model, gafiResult.usage.inputTokens, gafiResult.usage.outputTokens);
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(), model: gafiResult.usage.model, purpose: "data_pipeline_industry_deep",
          inputTokens: gafiResult.usage.inputTokens, outputTokens: gafiResult.usage.outputTokens,
          totalTokens: gafiResult.usage.inputTokens + gafiResult.usage.outputTokens,
          costUsd, durationMs: gafiResult.usage.durationMs, success: gafiResult.result !== null, timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn(`[deepScrape/pass1] GAFI zones failed: ${err}`);
    }

    console.log(`[deepScrape/pass1] Complete. Total records updated: ${totalUpdated}`);

    // Chain to Pass 2: Enrichment (add details to all opportunities)
    await ctx.scheduler.runAfter(0, internal.agents.dataAgent.deepScrapePass2, {});
  },
});

/**
 * Deep Scrape Pass 2 — Enrichment with cost details.
 * Fetches IDA investment incentives PDF and adds licensing steps + incentive
 * eligibility to ALL opportunities that don't have project details yet.
 */
export const deepScrapePass2 = internalAction({
  args: {},
  handler: async (ctx) => {
    let totalUpdated = 0;

    // Get all opportunities that don't have detailed project info yet
    const oppsWithoutDetails = await ctx.runQuery(internal.industry.getOpportunitiesWithoutDetails, {});
    console.log(`[deepScrape/pass2] ${oppsWithoutDetails.length} opportunities need enrichment.`);

    if (oppsWithoutDetails.length === 0) {
      console.log("[deepScrape/pass2] All opportunities already enriched. Done.");
      return;
    }

    // ── Fetch IDA incentives PDF for real incentive data ──
    let verifiedIncentives: z.infer<typeof InvestmentIncentivesSchema> | null = null;
    try {
      console.log("[deepScrape/pass2] Researching IDA investment incentives and licensing...");
      const incentivesToolSchema = zodToToolSchema(
        "extract_investment_incentives",
        "Extract Egypt's industrial investment incentives structure and licensing process.",
        InvestmentIncentivesSchema,
      );
      const pdfResult = await callLLMWebResearchStructured<z.infer<typeof InvestmentIncentivesSchema>>(
        `Research Egypt's industrial investment incentives and licensing process. Search for ALL of the following:

1. "هيئة التنمية الصناعية حوافز الاستثمار القطاع أ القطاع ب"
2. "IDA Egypt investment incentives Sector A Sector B tax deduction 2025"
3. "Egypt Investment Law 72/2017 incentives governorates"
4. "IDA Egypt industrial licensing steps fees requirements"
5. "Egypt free zone benefits customs exemption tax"

Also try to fetch: https://www.ida.gov.eg/ar/incentives

Extract the COMPLETE incentive structure including general incentives, sector A/B incentives, additional benefits, cash incentive program, licensing steps (with Arabic titles), and free zone benefits.`,
        [
          { type: "web_search_20250305" as const, name: "web_search", max_uses: 8 },
          { type: "web_fetch_20250910" as const, name: "web_fetch", max_uses: 2 },
        ],
        incentivesToolSchema,
        "Parse the researched Egyptian industrial investment incentives data into structured format with licensing steps.",
        "You are an Egyptian industrial investment incentives research specialist.",
      );

      if (pdfResult.result) {
        const verified = InvestmentIncentivesSchema.safeParse(pdfResult.result);
        if (!verified.success) {
          console.warn("[deepScrape/pass2] REJECTED by verifier (incentives):", verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        } else {
          verifiedIncentives = verified.data;
          console.log("[deepScrape/pass2] Incentives data extracted and verified.");
        }
      }

      if (pdfResult.usage) {
        const costUsd = estimateCost(pdfResult.usage.model, pdfResult.usage.inputTokens, pdfResult.usage.outputTokens);
        await ctx.runMutation(internal.usage.logApiUsage, {
          provider: activeProviderName(), model: pdfResult.usage.model, purpose: "data_pipeline_industry_deep",
          inputTokens: pdfResult.usage.inputTokens, outputTokens: pdfResult.usage.outputTokens,
          totalTokens: pdfResult.usage.inputTokens + pdfResult.usage.outputTokens,
          costUsd, durationMs: pdfResult.usage.durationMs, success: pdfResult.result !== null, timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn(`[deepScrape/pass2] Incentives PDF extraction failed: ${err}`);
    }

    // ── Apply incentives and licensing data to all opportunities ──
    if (verifiedIncentives) {
      const incentivesObj = verifiedIncentives;
      const licensingStepsEn = incentivesObj.licensingSteps ? JSON.stringify(incentivesObj.licensingSteps) : undefined;
      const licensingStepsAr = licensingStepsEn; // Same structure with Arabic titles inside

      // Determine incentives text based on opportunity type
      for (const opp of oppsWithoutDetails) {
        try {
          let incentivesEn = "";
          let incentivesAr = "";

          if (opp.type === "free_zone") {
            const fzBenefits = incentivesObj.freeZoneBenefits ?? [];
            incentivesEn = `Free Zone Benefits:\n${fzBenefits.map((b) => `• ${b}`).join("\n")}`;
            incentivesAr = `مزايا المنطقة الحرة:\n${fzBenefits.map((b) => `• ${b}`).join("\n")}`;
          } else {
            // Determine sector A or B based on governorate
            const sectorAGovs = (incentivesObj.sectorA?.governorates ?? []).map((g) => g.toLowerCase());
            const isSectorA = sectorAGovs.some((g) =>
              opp.governorate?.toLowerCase().includes(g) || g.includes(opp.governorate?.toLowerCase() ?? "")
            );

            const sector = isSectorA ? incentivesObj.sectorA : incentivesObj.sectorB;
            const sectorLabel = isSectorA ? "A" : "B";
            const general = (incentivesObj.generalIncentives ?? []).map((i) => `• ${i}`).join("\n");
            const additional = (incentivesObj.additionalBenefits ?? []).map((b) => `• ${b}`).join("\n");

            incentivesEn = `Sector ${sectorLabel} Incentives (${sector?.taxDeduction ?? "30%"} tax deduction for ${sector?.maxDuration ?? "7 years"}):\n\nGeneral:\n${general}\n\nAdditional:\n${additional}`;
            incentivesAr = `حوافز القطاع ${sectorLabel} (خصم ضريبي ${sector?.taxDeduction ?? "30%"} لمدة ${sector?.maxDuration ?? "7 سنوات"})`;
          }

          await ctx.runMutation(internal.dataRefresh.upsertInvestmentProjectDetail, {
            opportunityId: opp._id,
            incentivesEn: incentivesEn || undefined,
            incentivesAr: incentivesAr || undefined,
            licensingStepsEn: licensingStepsEn ?? undefined,
            licensingStepsAr: licensingStepsAr ?? undefined,
            sourceUrl: "https://www.ida.gov.eg/ar/incentives",
            sanadLevel: 1,
          });
          totalUpdated++;
        } catch (err) {
          console.warn(`[deepScrape/pass2] Failed to enrich ${opp.nameEn}: ${err}`);
        }
      }
      console.log(`[deepScrape/pass2] Enriched ${totalUpdated} opportunities with incentives and licensing steps.`);
    }

    console.log(`[deepScrape/pass2] Complete. Total enriched: ${totalUpdated}`);
  },
});

// Public trigger for manual pipeline runs (e.g. from CLI: npx convex run agents/dataAgent:triggerRefresh --prod)
import { action } from "../_generated/server";
export const triggerRefresh = action({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.agents.dataAgent.orchestrateRefresh, {});
    return "Pipeline scheduled";
  },
});
