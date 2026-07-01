import type { ToolSpec } from "@openuidev/lang-core";
import { fmtEGP, fmtUSD } from "@/lib/format";

export type Lang = "en" | "ar";

export type StatSource = {
  sourceUrl: string;
  sanadLevel: number;
};

export type HomeStats = {
  parliamentarians: StatSource & { value: number; house: number; senate: number };
  governorates: StatSource & { value: number };
  constitutionArticles: StatSource & { value: number };
  ministries: StatSource & { value: number };
  externalDebt: (StatSource & { value: number }) | null;
  domesticDebt: (StatSource & { value: number }) | null;
  totalDebt: (StatSource & { value: number; debtToGdpRatio: number | null }) | null;
  budget: (StatSource & {
    year: string;
    totalRevenue: number;
    totalExpenditure: number;
    deficit: number;
  }) | null;
};

export const investmentIndicatorKeys = [
  "egx30_annual_return",
  "egypt_real_estate_return",
  "gold_annual_return",
  "cbe_cd_rate",
  "egypt_tbill_rate",
  "inflation",
  "exchange_rate",
  "egypt_mortgage_rate",
] as const;

export type InvestmentIndicatorKey = (typeof investmentIndicatorKeys)[number];

export type InvestmentDefaults = Partial<Record<InvestmentIndicatorKey, {
  value: number;
  unit: string;
  date: string;
  sanadLevel: number;
  sourceUrl?: string;
}>>;

type MizanToolContext = {
  stats: HomeStats | undefined;
  investmentDefaults: InvestmentDefaults | undefined;
  lang: Lang;
};

type DataConfidence = "official" | "secondary" | "estimated" | "unverified";

type SourceRow = {
  id: string;
  label: string;
  url: string;
  publisher: string;
  lastUpdated?: string;
  confidence: DataConfidence;
  sanadLevel: number;
};

type MetricRow = {
  id: string;
  label: string;
  value: string;
  detail: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  confidence: DataConfidence;
};

type TableRow = Record<string, string | number | null>;

type SeriesRow = {
  label: string;
  value: number;
  displayValue: string;
  sourceId: string;
};

type InsightRow = {
  label: string;
  detail: string;
  tone: "default" | "warning" | "positive";
};

type IndicatorRow = TableRow & {
  id: InvestmentIndicatorKey;
  indicator: string;
  value: string;
  rawValue: number;
  unit: string;
  date: string;
  source: string;
  sourceId: InvestmentIndicatorKey;
  confidence: DataConfidence;
};

type IndicatorsResult = {
  title: string;
  summary: string;
  rows: IndicatorRow[];
  sources: SourceRow[];
  prompts: string[];
};

type SearchResult = {
  title: string;
  summary: string;
  metrics: MetricRow[];
  rows: TableRow[];
  series: SeriesRow[];
  sources: SourceRow[];
  insights: InsightRow[];
  prompts: string[];
};

const domainValues = ["auto", "debt", "budget", "institutions", "investment", "sources"] as const;
type Domain = (typeof domainValues)[number];

const strategyValues = ["conservative", "balanced", "aggressive", "fixedIncome", "egyptianGrowth"] as const;
type Strategy = (typeof strategyValues)[number];

const sourceRowSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    url: { type: "string" },
    publisher: { type: "string" },
    lastUpdated: { type: "string" },
    confidence: { type: "string", enum: ["official", "secondary", "estimated", "unverified"] },
    sanadLevel: { type: "number" },
  },
  required: ["id", "label", "url", "publisher", "confidence", "sanadLevel"],
} as const;

const metricRowSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    value: { type: "string" },
    detail: { type: "string" },
    sourceId: { type: "string" },
    sourceLabel: { type: "string" },
    sourceUrl: { type: "string" },
    confidence: { type: "string", enum: ["official", "secondary", "estimated", "unverified"] },
  },
  required: ["id", "label", "value", "detail", "sourceId", "sourceLabel", "sourceUrl", "confidence"],
} as const;

const insightRowSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    detail: { type: "string" },
    tone: { type: "string", enum: ["default", "warning", "positive"] },
  },
  required: ["label", "detail", "tone"],
} as const;

const seriesRowSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    value: { type: "number" },
    displayValue: { type: "string" },
    sourceId: { type: "string" },
  },
  required: ["label", "value", "displayValue", "sourceId"],
} as const;

const searchOutputSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    metrics: { type: "array", items: metricRowSchema },
    rows: { type: "array", items: { type: "object", additionalProperties: true } },
    series: { type: "array", items: seriesRowSchema },
    sources: { type: "array", items: sourceRowSchema },
    insights: { type: "array", items: insightRowSchema },
    prompts: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "metrics", "rows", "series", "sources", "insights", "prompts"],
} as const;

export const MIZAN_OPENUI_TOOL_SPECS: ToolSpec[] = [
  {
    name: "mizan_search",
    description:
      "Read already-ingested Mizan public data and return a sourced UI-ready bundle of metrics, rows, chart series, sources, insights, and follow-up prompts. Use this for most user questions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The user's natural-language question or focused data need." },
        lang: { type: "string", enum: ["en", "ar"], description: "UI language." },
        domain: { type: "string", enum: domainValues, description: "Optional focus area. Use auto when unsure." },
      },
      required: ["query"],
    },
    outputSchema: searchOutputSchema,
    annotations: { readOnlyHint: true },
  },
  {
    name: "mizan_indicators",
    description:
      "Return sourced investment/economy indicators from Mizan's ingested Convex data. Use for inflation, exchange rate, EGX, gold, T-bills, bank CDs, real estate, and mortgage context.",
    inputSchema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["en", "ar"] },
        indicators: { type: "array", items: { type: "string", enum: investmentIndicatorKeys } },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        rows: { type: "array", items: { type: "object", additionalProperties: true } },
        sources: { type: "array", items: sourceRowSchema },
        prompts: { type: "array", items: { type: "string" } },
      },
      required: ["title", "summary", "rows", "sources", "prompts"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "mizan_simulate_investment",
    description:
      "Run an Egypt-focused scenario calculation using ingested indicator rates as inputs. This is scenario context, not investment advice.",
    inputSchema: {
      type: "object",
      properties: {
        capitalEgp: { type: "number" },
        horizonYears: { type: "number" },
        strategies: { type: "array", items: { type: "string", enum: strategyValues } },
        lang: { type: "string", enum: ["en", "ar"] },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        rows: { type: "array", items: { type: "object", additionalProperties: true } },
        series: { type: "array", items: seriesRowSchema },
        sources: { type: "array", items: sourceRowSchema },
        insights: { type: "array", items: insightRowSchema },
        prompts: { type: "array", items: { type: "string" } },
      },
      required: ["title", "summary", "rows", "series", "sources", "insights", "prompts"],
    },
    annotations: { readOnlyHint: true },
  },
];

const indicatorLabels: Record<InvestmentIndicatorKey, Record<Lang, string>> = {
  egx30_annual_return: { en: "EGX30 return", ar: "عائد EGX30" },
  egypt_real_estate_return: { en: "Real estate return", ar: "عائد العقار" },
  gold_annual_return: { en: "Gold return", ar: "عائد الذهب" },
  cbe_cd_rate: { en: "Bank CD rate", ar: "عائد الشهادات" },
  egypt_tbill_rate: { en: "T-bill rate", ar: "عائد أذون الخزانة" },
  inflation: { en: "Inflation", ar: "التضخم" },
  exchange_rate: { en: "Exchange rate", ar: "سعر الصرف" },
  egypt_mortgage_rate: { en: "Mortgage rate", ar: "تمويل عقاري" },
};

const strategyLabels: Record<Strategy, Record<Lang, string>> = {
  conservative: { en: "Conservative", ar: "محافظ" },
  balanced: { en: "Balanced", ar: "متوازن" },
  aggressive: { en: "Aggressive", ar: "هجومي" },
  fixedIncome: { en: "Fixed income", ar: "دخل ثابت" },
  egyptianGrowth: { en: "Egyptian growth", ar: "نمو مصري" },
};

const strategyAllocation: Record<Strategy, Partial<Record<InvestmentIndicatorKey, number>>> = {
  conservative: {
    egypt_tbill_rate: 35,
    cbe_cd_rate: 35,
    egx30_annual_return: 5,
    egypt_real_estate_return: 15,
    gold_annual_return: 10,
  },
  balanced: {
    egypt_tbill_rate: 20,
    cbe_cd_rate: 20,
    egx30_annual_return: 20,
    egypt_real_estate_return: 20,
    gold_annual_return: 20,
  },
  aggressive: {
    egypt_tbill_rate: 5,
    cbe_cd_rate: 10,
    egx30_annual_return: 40,
    egypt_real_estate_return: 25,
    gold_annual_return: 20,
  },
  fixedIncome: {
    egypt_tbill_rate: 45,
    cbe_cd_rate: 45,
    gold_annual_return: 10,
  },
  egyptianGrowth: {
    egypt_tbill_rate: 10,
    cbe_cd_rate: 15,
    egx30_annual_return: 40,
    egypt_real_estate_return: 25,
    gold_annual_return: 10,
  },
};

function langFromUnknown(value: unknown, fallback: Lang): Lang {
  return value === "ar" || value === "en" ? value : fallback;
}

function stringFromUnknown(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function confidenceForSanad(level: number | undefined): DataConfidence {
  if (level === 1) return "official";
  if (level === 2) return "secondary";
  if (level === 3) return "estimated";
  return "unverified";
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function sourceRow(id: string, label: string, source: StatSource | null | undefined): SourceRow | null {
  if (!source?.sourceUrl) return null;
  return {
    id,
    label,
    url: source.sourceUrl,
    publisher: sourceHost(source.sourceUrl),
    confidence: confidenceForSanad(source.sanadLevel),
    sanadLevel: source.sanadLevel,
  };
}

function sourceFromRows(rows: Array<SourceRow | null>): SourceRow[] {
  const map = new Map<string, SourceRow>();
  for (const row of rows) {
    if (!row) continue;
    map.set(row.id, row);
  }
  return [...map.values()];
}

function metricRow(
  id: string,
  label: string,
  value: string,
  detail: string,
  source: SourceRow | null,
): MetricRow | null {
  if (!source) return null;
  return {
    id,
    label,
    value,
    detail,
    sourceId: source.id,
    sourceLabel: source.label,
    sourceUrl: source.url,
    confidence: source.confidence,
  };
}

function compactEgpBillions(value: number): string {
  return fmtEGP(value * 1_000_000_000, { compact: true, decimals: 1 });
}

function compactUsdBillions(value: number): string {
  return fmtUSD(value * 1_000_000_000, { compact: true, decimals: 1 });
}

function debtExchangeRate(ctx: MizanToolContext): number | null {
  const value = ctx.investmentDefaults?.exchange_rate?.value;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function totalDebtUsdValue(ctx: MizanToolContext): number | null {
  const external = ctx.stats?.externalDebt?.value;
  const domestic = ctx.stats?.domesticDebt?.value;
  const exchangeRate = debtExchangeRate(ctx);
  if (typeof external !== "number" || typeof domestic !== "number" || exchangeRate === null) return null;
  return (external * 1_000_000_000) + ((domestic * 1_000_000_000) / exchangeRate);
}

function formatIndicatorValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit.toLowerCase() === "egp/usd") return `${value.toFixed(1)} EGP/USD`;
  if (unit.toUpperCase() === "EGP") return fmtEGP(value, { compact: true, decimals: 1 });
  if (unit.toUpperCase() === "USD") return fmtUSD(value, { compact: true, decimals: 1 });
  return `${value.toLocaleString()} ${unit}`;
}

function inferDomain(query: string, requested: unknown): Domain {
  if (domainValues.includes(requested as Domain) && requested !== "auto") return requested as Domain;
  const text = query.toLowerCase();
  if (/\b(debt|gdp|external|domestic)\b|دين|ناتج|خارجي|محلي/.test(text)) return "debt";
  if (/\b(budget|deficit|revenue|spending)\b|موازنة|عجز|إيراد|مصروف/.test(text)) return "budget";
  if (/\b(invest|investment|investing|portfolio|return|yield|inflation|exchange|gold|egx|t-?bill|certificate|asset|simulate|simulation|simulations|scenario|scenarios)\b|استثمار|محفظة|عائد|تضخم|صرف|ذهب|بورصة|شهادات|أذون|محاكاة|حاكي|سيناريو/.test(text)) return "investment";
  if (/\b(source|trust|citation|audit|methodology)\b|مصدر|ثقة|توثيق|منهجية/.test(text)) return "sources";
  if (/\b(government|parliament|minister|governorate|constitution)\b|حكومة|برلمان|وزارة|محافظة|دستور/.test(text)) return "institutions";
  return "auto";
}

function emptyResult(lang: Lang, query: string): SearchResult {
  return {
    title: lang === "ar" ? "بيانات ميزان" : "Mizan data",
    summary: lang === "ar"
      ? "استخدم أداة ميزان المناسبة لعرض بيانات موثقة من قاعدة البيانات."
      : "Use the relevant Mizan tool to render sourced data from the database.",
    metrics: [],
    rows: [],
    series: [],
    sources: [],
    insights: [{
      label: lang === "ar" ? "السؤال" : "Question",
      detail: query,
      tone: "default",
    }],
    prompts: lang === "ar"
      ? ["اعرض المصادر", "قارن بالدين", "أضف سياق الموازنة"]
      : ["Show sources", "Compare with debt", "Add budget context"],
  };
}

function buildDebtResult(ctx: MizanToolContext, _query: string): SearchResult {
  const lang = ctx.lang;
  const stats = ctx.stats;
  const exchangeRate = debtExchangeRate(ctx);
  const approximateTotal = totalDebtUsdValue(ctx);
  const total = sourceRow("totalDebt", lang === "ar" ? "إجمالي الدين" : "Total debt", stats?.totalDebt);
  const external = sourceRow("externalDebt", lang === "ar" ? "الدين الخارجي" : "External debt", stats?.externalDebt);
  const domestic = sourceRow("domesticDebt", lang === "ar" ? "الدين المحلي" : "Domestic debt", stats?.domesticDebt);
  const sources = sourceFromRows([total, external, domestic]);
  const metrics = [
    metricRow(
      "totalDebt",
      lang === "ar" ? "إجمالي الدين" : "Total debt",
      approximateTotal !== null ? fmtUSD(approximateTotal, { compact: true, decimals: 1 }) : "",
      exchangeRate !== null
        ? lang === "ar"
          ? "تقريب بالدولار من الدين الخارجي والدين المحلي باستخدام سعر الصرف المتاح في ميزان."
          : "Approximate USD total from external and domestic debt using Mizan's available exchange rate."
        : lang === "ar"
          ? "يتطلب إجمالي موحد سعر صرف موثقا لتحويل الدين المحلي."
          : "A unified total needs a sourced exchange rate to convert domestic debt.",
      total,
    ),
    metricRow(
      "debtToGdp",
      lang === "ar" ? "الدين إلى الناتج" : "Debt to GDP",
      stats?.totalDebt?.debtToGdpRatio != null ? `${stats.totalDebt.debtToGdpRatio.toFixed(1)}%` : "",
      lang === "ar" ? "نسبة الدين إلى حجم الاقتصاد." : "Debt measured against the size of the economy.",
      total,
    ),
    metricRow(
      "externalDebt",
      lang === "ar" ? "الدين الخارجي" : "External debt",
      stats?.externalDebt ? compactUsdBillions(stats.externalDebt.value) : "",
      lang === "ar" ? "التزامات مرتبطة بالعملة الأجنبية." : "Foreign-currency-linked obligations.",
      external,
    ),
    metricRow(
      "domesticDebt",
      lang === "ar" ? "الدين المحلي" : "Domestic debt",
      stats?.domesticDebt ? compactEgpBillions(stats.domesticDebt.value) : "",
      lang === "ar" ? "التزامات بالعملة المحلية." : "Local-currency obligations.",
      domestic,
    ),
  ].filter((row): row is MetricRow => row !== null && row.value.length > 0);

  const rows = metrics.map((metric) => ({
    metric: metric.label,
    value: metric.value,
    source: metric.sourceLabel,
    confidence: metric.confidence,
  }));

  const series: SeriesRow[] = [
    stats?.externalDebt && external
      ? { label: external.label, value: stats.externalDebt.value, displayValue: compactUsdBillions(stats.externalDebt.value), sourceId: external.id }
      : null,
    stats?.domesticDebt && domestic
      ? {
          label: domestic.label,
          value: exchangeRate !== null ? stats.domesticDebt.value / exchangeRate : stats.domesticDebt.value,
          displayValue: compactEgpBillions(stats.domesticDebt.value),
          sourceId: domestic.id,
        }
      : null,
  ].filter((row): row is SeriesRow => row !== null);

  return {
    title: lang === "ar" ? "وضع الدين العام" : "Public debt status",
    summary: lang === "ar"
      ? "قراءة مولدة من بيانات الدين المتاحة في ميزان مع روابط المصادر."
      : "A generated view from Mizan's ingested debt data with source links.",
    metrics,
    rows,
    series,
    sources,
    insights: [{
      label: lang === "ar" ? "اقرأ المصدر أولا" : "Start with the source",
      detail: lang === "ar"
        ? "أي مقارنة يجب أن تميز بين الدين المحلي والخارجي ووحدة القياس."
        : "Any comparison should separate domestic and external debt and keep units visible.",
      tone: "warning",
    }],
    prompts: lang === "ar"
      ? ["أضف فجوة الموازنة", "اعرض جودة المصادر", "قارن المحلي والخارجي"]
      : ["Add the budget gap", "Show source quality", "Compare domestic and external"],
  };
}

function buildBudgetResult(ctx: MizanToolContext): SearchResult {
  const lang = ctx.lang;
  const budgetSource = sourceRow("budget", lang === "ar" ? "الموازنة" : "Budget", ctx.stats?.budget);
  const budget = ctx.stats?.budget;
  const metrics = [
    metricRow("budgetYear", lang === "ar" ? "سنة الموازنة" : "Budget year", budget?.year ?? "", lang === "ar" ? "أحدث سنة مالية في قاعدة ميزان." : "Latest fiscal year in Mizan.", budgetSource),
    metricRow("revenue", lang === "ar" ? "الإيرادات" : "Revenue", budget ? compactEgpBillions(budget.totalRevenue) : "", lang === "ar" ? "الإيرادات المقدرة." : "Projected revenue.", budgetSource),
    metricRow("spending", lang === "ar" ? "المصروفات" : "Spending", budget ? compactEgpBillions(budget.totalExpenditure) : "", lang === "ar" ? "المصروفات المقدرة." : "Projected spending.", budgetSource),
    metricRow("deficit", lang === "ar" ? "العجز" : "Deficit", budget ? compactEgpBillions(Math.abs(budget.deficit)) : "", lang === "ar" ? "الفجوة بين المصروفات والإيرادات." : "Gap between spending and revenue.", budgetSource),
  ].filter((row): row is MetricRow => row !== null && row.value.length > 0);

  return {
    title: lang === "ar" ? "فجوة الموازنة" : "Budget gap",
    summary: lang === "ar"
      ? "عرض مولد للإيرادات والمصروفات والعجز من بيانات ميزان."
      : "A generated view of revenue, spending, and deficit from Mizan data.",
    metrics,
    rows: metrics.map((metric) => ({ line: metric.label, value: metric.value, source: metric.sourceLabel })),
    series: budget && budgetSource ? [
      { label: lang === "ar" ? "الإيرادات" : "Revenue", value: budget.totalRevenue, displayValue: compactEgpBillions(budget.totalRevenue), sourceId: budgetSource.id },
      { label: lang === "ar" ? "المصروفات" : "Spending", value: budget.totalExpenditure, displayValue: compactEgpBillions(budget.totalExpenditure), sourceId: budgetSource.id },
      { label: lang === "ar" ? "العجز" : "Deficit", value: Math.abs(budget.deficit), displayValue: compactEgpBillions(Math.abs(budget.deficit)), sourceId: budgetSource.id },
    ] : [],
    sources: sourceFromRows([budgetSource]),
    insights: [{
      label: lang === "ar" ? "العجز قراءة نسبية" : "Deficit is relative",
      detail: lang === "ar"
        ? "العجز يصبح أوضح عند قراءته بجانب الدين والناتج المحلي."
        : "The deficit is clearer when read next to debt and GDP context.",
      tone: "default",
    }],
    prompts: lang === "ar"
      ? ["اربطها بالدين", "اعرض المصادر", "ما أكبر ضغط؟"]
      : ["Connect it to debt", "Show sources", "What is the pressure point?"],
  };
}

function buildInstitutionsResult(ctx: MizanToolContext): SearchResult {
  const lang = ctx.lang;
  const stats = ctx.stats;
  const ministries = sourceRow("ministries", lang === "ar" ? "الوزارات" : "Ministries", stats?.ministries);
  const parliament = sourceRow("parliament", lang === "ar" ? "البرلمان" : "Parliament", stats?.parliamentarians);
  const governorates = sourceRow("governorates", lang === "ar" ? "المحافظات" : "Governorates", stats?.governorates);
  const constitution = sourceRow("constitution", lang === "ar" ? "الدستور" : "Constitution", stats?.constitutionArticles);
  const metrics = [
    metricRow("ministries", ministries?.label ?? "Ministries", stats?.ministries ? `${stats.ministries.value.toLocaleString()}` : "", lang === "ar" ? "عدد الوزارات في البيانات." : "Ministry count in the data.", ministries),
    metricRow("parliament", parliament?.label ?? "Parliament", stats?.parliamentarians ? `${stats.parliamentarians.value.toLocaleString()}` : "", lang === "ar" ? "أعضاء مجلسي النواب والشيوخ." : "House and Senate members.", parliament),
    metricRow("governorates", governorates?.label ?? "Governorates", stats?.governorates ? `${stats.governorates.value.toLocaleString()}` : "", lang === "ar" ? "المحافظات المسجلة." : "Governorates in the data.", governorates),
    metricRow("constitution", constitution?.label ?? "Constitution", stats?.constitutionArticles ? `${stats.constitutionArticles.value.toLocaleString()}` : "", lang === "ar" ? "مواد الدستور المفهرسة." : "Indexed constitutional articles.", constitution),
  ].filter((row): row is MetricRow => row !== null && row.value.length > 0);
  const rows: TableRow[] = [];
  if (stats?.parliamentarians) {
    rows.push(
      { body: lang === "ar" ? "النواب" : "House", count: stats.parliamentarians.house },
      { body: lang === "ar" ? "الشيوخ" : "Senate", count: stats.parliamentarians.senate },
    );
  }

  return {
    title: lang === "ar" ? "خريطة المؤسسات" : "Institutions map",
    summary: lang === "ar"
      ? "نظرة مولدة على بنية الحكومة والبرلمان والمحافظات والدستور من بيانات ميزان."
      : "A generated overview of government, parliament, governorates, and constitution data.",
    metrics,
    rows,
    series: metrics.map((metric) => ({
      label: metric.label,
      value: Number(metric.value.replace(/,/g, "")) || 0,
      displayValue: metric.value,
      sourceId: metric.sourceId,
    })),
    sources: sourceFromRows([ministries, parliament, governorates, constitution]),
    insights: [{
      label: lang === "ar" ? "واجهة قابلة للتوسع" : "Expandable surface",
      detail: lang === "ar"
        ? "يمكن للواجهة التالية أن تفصل أي مؤسسة أو محافظة أو مصدر بدون تغيير مسار الصفحة."
        : "Follow-ups can focus any institution, governorate, or source without changing page routes.",
      tone: "positive",
    }],
    prompts: lang === "ar"
      ? ["ركز على البرلمان", "اعرض المصادر", "اربطها بالموازنة"]
      : ["Focus parliament", "Show sources", "Connect to the budget"],
  };
}

function indicatorSourceRows(ctx: MizanToolContext, keys: readonly InvestmentIndicatorKey[]): SourceRow[] {
  const sources = keys.map((key) => {
    const record = ctx.investmentDefaults?.[key];
    return record?.sourceUrl
      ? sourceRow(key, indicatorLabels[key][ctx.lang], { sourceUrl: record.sourceUrl, sanadLevel: record.sanadLevel })
      : null;
  });
  return sourceFromRows(sources);
}

function buildIndicatorsResult(ctx: MizanToolContext, selectedKeys?: readonly InvestmentIndicatorKey[]): IndicatorsResult {
  const lang = ctx.lang;
  const keys = selectedKeys && selectedKeys.length > 0 ? selectedKeys : [...investmentIndicatorKeys];
  const rows = keys
    .map((key) => {
      const record = ctx.investmentDefaults?.[key];
      if (!record) return null;
      return {
        id: key,
        indicator: indicatorLabels[key][lang],
        value: formatIndicatorValue(record.value, record.unit),
        rawValue: record.value,
        unit: record.unit,
        date: record.date,
        source: record.sourceUrl ? sourceHost(record.sourceUrl) : "",
        sourceId: key,
        confidence: confidenceForSanad(record.sanadLevel),
      };
    })
    .filter((row): row is IndicatorRow => row !== null);
  return {
    title: lang === "ar" ? "مؤشرات الاستثمار والاقتصاد" : "Investment and economy indicators",
    summary: lang === "ar"
      ? "المؤشرات المتاحة من بيانات ميزان لتأطير السيناريوهات، بدون توصية بشراء أصل محدد."
      : "Available Mizan indicators for scenario framing, without recommending a specific asset.",
    rows,
    sources: indicatorSourceRows(ctx, keys),
    prompts: lang === "ar"
      ? ["قارن بالتضخم", "شغل سيناريو", "اعرض مخاطر العملة"]
      : ["Compare with inflation", "Run a scenario", "Show currency risk"],
  };
}

function buildInvestmentResult(ctx: MizanToolContext): SearchResult {
  const indicators = buildIndicatorsResult(ctx);
  const lang = ctx.lang;
  const metrics = indicators.rows.slice(0, 6).map((row) => {
    const source = indicators.sources.find((candidate) => candidate.id === row.id);
    return source
      ? metricRow(
          String(row.id),
          String(row.indicator),
          String(row.value),
          lang === "ar" ? "مؤشر من بيانات ميزان." : "Indicator from Mizan data.",
          source,
        )
      : null;
  }).filter((row): row is MetricRow => row !== null);

  return {
    title: indicators.title,
    summary: indicators.summary,
    metrics,
    rows: indicators.rows,
    series: indicators.rows
      .filter((row) => typeof row.rawValue === "number")
      .map((row) => ({
        label: String(row.indicator),
        value: Number(row.rawValue),
        displayValue: String(row.value),
        sourceId: String(row.id),
      })),
    sources: indicators.sources,
    insights: [{
      label: lang === "ar" ? "ليست توصية مالية" : "Not financial advice",
      detail: lang === "ar"
        ? "استخدم المبلغ والمدة وتحمل المخاطر لتوليد سيناريو، وليس توصية شراء."
        : "Use amount, horizon, and risk tolerance to generate a scenario, not a buy recommendation.",
      tone: "warning",
    }],
    prompts: indicators.prompts,
  };
}

function buildSourcesResult(ctx: MizanToolContext, query: string): SearchResult {
  const parts = [
    buildDebtResult(ctx, query),
    buildBudgetResult(ctx),
    buildInstitutionsResult(ctx),
    buildInvestmentResult(ctx),
  ];
  const sources = sourceFromRows(parts.flatMap((part) => part.sources));
  return {
    title: ctx.lang === "ar" ? "مصادر بيانات ميزان" : "Mizan data sources",
    summary: ctx.lang === "ar"
      ? "قائمة مولدة من المصادر المستخدمة في العرض الحالي والبيانات المتاحة."
      : "A generated list of sources used by the current view and available data.",
    metrics: [],
    rows: sources.map((source) => ({
      source: source.label,
      publisher: source.publisher,
      confidence: source.confidence,
      sanadLevel: source.sanadLevel,
      url: source.url,
    })),
    series: sources.map((source) => ({
      label: source.label,
      value: source.sanadLevel,
      displayValue: `Sanad ${source.sanadLevel}`,
      sourceId: source.id,
    })),
    sources,
    insights: [{
      label: ctx.lang === "ar" ? "كل رقم يحتاج مصدرا" : "Every number needs a source",
      detail: ctx.lang === "ar"
        ? "الواجهة لا تحتاج مسارا محددا لعرض مصدر؛ كل كتلة تحمل رابطها."
        : "The UI does not need a fixed route to show provenance; each block carries its source link.",
      tone: "positive",
    }],
    prompts: ctx.lang === "ar"
      ? ["اعرض الدين فقط", "اعرض الموازنة فقط", "ما مستوى الثقة؟"]
      : ["Show debt only", "Show budget only", "What is the confidence level?"],
  };
}

function searchMizan(ctx: MizanToolContext, args: Record<string, unknown>): SearchResult {
  const query = stringFromUnknown(args.query, "");
  const lang = langFromUnknown(args.lang, ctx.lang);
  const scoped = { ...ctx, lang };
  const domain = inferDomain(query, args.domain);

  if (!ctx.stats && !ctx.investmentDefaults) return emptyResult(lang, query);
  if (domain === "debt") return buildDebtResult(scoped, query);
  if (domain === "budget") return buildBudgetResult(scoped);
  if (domain === "institutions") return buildInstitutionsResult(scoped);
  if (domain === "investment") {
    return /\b(simulate|simulation|simulations|scenario|scenarios)\b|محاكاة|حاكي|سيناريو/.test(query.toLowerCase())
      ? simulateInvestment(scoped, { lang })
      : buildInvestmentResult(scoped);
  }
  if (domain === "sources") return buildSourcesResult(scoped, query);

  const overview = buildInstitutionsResult(scoped);
  const debt = buildDebtResult(scoped, query);
  const budget = buildBudgetResult(scoped);
  return {
    title: lang === "ar" ? "لوحة ميزان المولدة" : "Generated Mizan board",
    summary: lang === "ar"
      ? "واجهة مركبة من أدوات بيانات ميزان؛ يمكن للمتابعة أن تركز أي جزء."
      : "A surface composed from Mizan data tools; follow-ups can focus any part.",
    metrics: [...overview.metrics.slice(0, 4), ...debt.metrics.slice(0, 2), ...budget.metrics.slice(0, 2)],
    rows: [...overview.rows, ...budget.rows, ...debt.rows].slice(0, 12),
    series: [...overview.series, ...budget.series, ...debt.series].slice(0, 12),
    sources: sourceFromRows([...overview.sources, ...debt.sources, ...budget.sources]),
    insights: [{
      label: lang === "ar" ? "توليد من البيانات" : "Data-driven generation",
      detail: lang === "ar"
        ? "كل كتلة يمكن أن تتغير مع السؤال لكنها تقرأ من أدوات بيانات ميزان."
        : "Each block can change with the prompt while reading from Mizan tools.",
      tone: "positive",
    }],
    prompts: lang === "ar"
      ? ["ركز على الدين", "اعرض فجوة الموازنة", "اعرض المصادر"]
      : ["Focus debt", "Show budget gap", "Show sources"],
  };
}

function selectedIndicatorKeys(value: unknown): InvestmentIndicatorKey[] | undefined {
  const parsed = arrayFromUnknown(value).filter((item): item is InvestmentIndicatorKey => (
    typeof item === "string" && investmentIndicatorKeys.includes(item as InvestmentIndicatorKey)
  ));
  return parsed.length > 0 ? parsed : undefined;
}

function selectedStrategies(value: unknown): Strategy[] {
  const parsed = arrayFromUnknown(value).filter((item): item is Strategy => (
    typeof item === "string" && strategyValues.includes(item as Strategy)
  ));
  return parsed.length > 0 ? [...new Set(parsed)].slice(0, 5) : ["balanced", "fixedIncome", "egyptianGrowth"];
}

function weightedReturn(ctx: MizanToolContext, strategy: Strategy): { value: number; missing: string[] } {
  const allocation = strategyAllocation[strategy];
  let totalWeight = 0;
  let weighted = 0;
  const missing: string[] = [];

  for (const [key, weight] of Object.entries(allocation) as Array<[InvestmentIndicatorKey, number]>) {
    const record = ctx.investmentDefaults?.[key];
    if (!record) {
      missing.push(indicatorLabels[key][ctx.lang]);
      continue;
    }
    totalWeight += weight;
    weighted += record.value * (weight / 100);
  }

  if (totalWeight === 0) return { value: 0, missing };
  return {
    value: weighted / (totalWeight / 100),
    missing,
  };
}

function simulateInvestment(ctx: MizanToolContext, args: Record<string, unknown>) {
  const lang = langFromUnknown(args.lang, ctx.lang);
  const scoped = { ...ctx, lang };
  const capital = Math.min(1_000_000_000, Math.max(1_000, numberFromUnknown(args.capitalEgp) ?? 100_000));
  const horizon = Math.min(30, Math.max(1, Math.round(numberFromUnknown(args.horizonYears) ?? 5)));
  const strategies = selectedStrategies(args.strategies);
  const inflation = ctx.investmentDefaults?.inflation?.value ?? 0;
  const rows = strategies.map((strategy) => {
    const result = weightedReturn(scoped, strategy);
    const nominal = capital * Math.pow(1 + result.value / 100, horizon);
    const real = inflation > 0 ? nominal / Math.pow(1 + inflation / 100, horizon) : nominal;
    return {
      strategyId: strategy,
      strategy: strategyLabels[strategy][lang],
      weightedReturn: `${result.value.toFixed(1)}%`,
      weightedReturnRaw: Number(result.value.toFixed(4)),
      nominalValue: fmtEGP(nominal, { compact: true, decimals: 1 }),
      nominalValueRaw: Math.round(nominal),
      realValue: fmtEGP(real, { compact: true, decimals: 1 }),
      realValueRaw: Math.round(real),
      capitalEgp: capital,
      horizonYears: horizon,
      inflationRate: inflation,
      missingInputs: result.missing.join(", "),
      source: lang === "ar" ? "مؤشرات ميزان" : "Mizan indicators",
    };
  });
  return {
    title: lang === "ar" ? "سيناريو استثمار" : "Investment scenario",
    summary: lang === "ar"
      ? "حساب سيناريو من المؤشرات الموجودة في ميزان؛ ليس توصية شخصية."
      : "A scenario calculation from Mizan's ingested indicators; not personal advice.",
    metrics: [],
    rows,
    series: rows.map((row, index) => ({
      label: String(row.strategy),
      value: row.nominalValueRaw ?? index + 1,
      displayValue: String(row.nominalValue),
      sourceId: "investmentIndicators",
    })),
    sources: indicatorSourceRows(scoped, investmentIndicatorKeys),
    insights: [{
      label: lang === "ar" ? "سيناريو لا توصية" : "Scenario, not advice",
      detail: lang === "ar"
        ? "غير المبلغ والمدة أو اطلب مقارنة مختلفة لتغيير الفرضيات."
        : "Change amount, horizon, or ask for another comparison to change assumptions.",
      tone: "warning" as const,
    }],
    prompts: lang === "ar"
      ? ["قارن بالتضخم", "اعرض المؤشرات", "غير المدة"]
      : ["Compare with inflation", "Show indicators", "Change horizon"],
  };
}

export function buildMizanOpenUiToolProvider(ctx: MizanToolContext) {
  return {
    mizan_search: async (args: Record<string, unknown>) => searchMizan(ctx, args),
    mizan_indicators: async (args: Record<string, unknown>) => {
      const lang = langFromUnknown(args.lang, ctx.lang);
      return buildIndicatorsResult({ ...ctx, lang }, selectedIndicatorKeys(args.indicators));
    },
    mizan_simulate_investment: async (args: Record<string, unknown>) => simulateInvestment(ctx, args),
  };
}

export function buildOpenUiDataContext(stats: HomeStats | undefined, investmentDefaults: InvestmentDefaults | undefined) {
  return {
    hasStats: stats !== undefined,
    availableDomains: {
      institutions: Boolean(stats?.ministries && stats?.parliamentarians && stats?.governorates),
      debt: Boolean(stats?.totalDebt || stats?.externalDebt || stats?.domesticDebt),
      budget: Boolean(stats?.budget),
      investment: Object.keys(investmentDefaults ?? {}).length > 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
