import {
  investmentIndicatorKeySchema,
  metricKeySchema,
  sourceKeySchema,
  type InvestmentIndicatorKey,
  type MetricKey,
  type SourceKey,
} from "@/lib/mizan-generative-spec";

type DataDomain = {
  id: string;
  label: string;
  description: string;
  metrics: MetricKey[];
  sources: SourceKey[];
  preferredComponents: string[];
};

type AppCapability = {
  id: string;
  label: string;
  href: string;
  purpose: string;
  inputs: string[];
  output: string;
  useWhen: string[];
};

type Availability = {
  id: string;
  status: "available" | "loading";
  detail: string;
};

type PromptMatch = {
  matchedDataDomains: string[];
  matchedAppCapabilities: string[];
  candidateComponents: string[];
  extractedInputs: {
    capitalEgp?: number;
    horizonYears?: number;
    strategy?: string;
    compareStrategies?: string[];
  };
  guidance: string;
};

const DATA_DOMAINS: DataDomain[] = [
  {
    id: "public-debt",
    label: "Public debt",
    description: "Debt level, debt-to-GDP, domestic/external split, and source reliability.",
    metrics: ["debtTotal", "debtGdp", "externalDebt", "domesticDebt"],
    sources: ["totalDebt", "externalDebt", "domesticDebt"],
    preferredComponents: ["MetricStripBlock", "RankingTableBlock", "DebtSplit", "SourceList", "InsightList"],
  },
  {
    id: "budget",
    label: "Budget",
    description: "Budget year, revenue, expenditure, deficit, and fiscal pressure context.",
    metrics: ["budgetYear", "budgetRevenue", "budgetSpending", "budgetDeficit"],
    sources: ["budget"],
    preferredComponents: ["MetricStripBlock", "TimelineFeedBlock", "BudgetBars", "SourceList", "InsightList"],
  },
  {
    id: "state-institutions",
    label: "State institutions",
    description: "Government, parliament, governorates, and constitutional structure.",
    metrics: ["ministries", "parliament", "governorates", "constitutionArticles"],
    sources: ["ministries", "parliament", "governorates", "constitutionArticles"],
    preferredComponents: ["MetricStripBlock", "RankingTableBlock", "EntityGrid", "SourceList", "InsightList"],
  },
  {
    id: "investment-context",
    label: "Investment context",
    description: "Sourced indicators for Egyptian investment context, risk, inflation, exchange rate, and returns.",
    metrics: [],
    sources: ["investmentIndicators"],
    preferredComponents: ["ToolSimulator", "MetricStripBlock", "RankingTableBlock", "IndicatorStrip", "InsightList", "SourceList", "Callout"],
  },
];

const APP_CAPABILITIES: AppCapability[] = [
  {
    id: "investment-simulator",
    label: "Investment simulator",
    href: "/tools/invest",
    purpose: "Compare portfolio scenarios across Egypt-focused asset classes.",
    inputs: ["capitalEgp", "horizonYears", "strategy", "compareStrategies", "inflationPct", "egpDepreciationPct"],
    output: "Projected nominal, real, and USD-adjusted results.",
    useWhen: ["scenario", "portfolio", "returns", "investment", "capital", "horizon"],
  },
  {
    id: "buy-vs-rent",
    label: "Buy vs rent calculator",
    href: "/tools/buy-vs-rent",
    purpose: "Compare buying and renting a home with financing and opportunity cost.",
    inputs: ["homePrice", "monthlyRent", "years", "financingType", "investmentReturnPct", "inflationPct"],
    output: "Buy/rent cost comparison, breakeven, and sensitivity context.",
    useWhen: ["real estate", "rent", "buy", "housing", "mortgage", "opportunity cost"],
  },
  {
    id: "tax-calculator",
    label: "Tax calculator",
    href: "/tools/tax-calculator",
    purpose: "Estimate Egyptian personal income tax and show budget allocation context.",
    inputs: ["annualSalary"],
    output: "Tax estimate and public spending breakdown.",
    useWhen: ["salary", "tax", "income", "where taxes go"],
  },
  {
    id: "mashroaak",
    label: "Mashrou'ak opportunity explorer",
    href: "/tools/mashroaak",
    purpose: "Browse industrial and investment opportunities from Egyptian public bodies.",
    inputs: ["maxCapitalEgp", "view"],
    output: "Matching opportunities by budget, sector, governorate, and source.",
    useWhen: ["business", "factory", "industrial", "project", "opportunity", "GAFI", "IDA"],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function hasNonEmptyRecord(value: unknown, key: string): boolean {
  const record = nestedRecord(value, key);
  return record !== null && Object.keys(record).length > 0;
}

function buildAvailability(dataContext: unknown): Availability[] {
  const stats = nestedRecord(dataContext, "stats");
  const investmentDefaults = nestedRecord(dataContext, "investmentDefaults");

  return [
    {
      id: "state-institutions",
      status: stats && hasNonEmptyRecord(stats, "ministries") && hasNonEmptyRecord(stats, "parliamentarians") ? "available" : "loading",
      detail: "Government, parliament, governorates, and constitution summary data.",
    },
    {
      id: "public-debt",
      status: stats && (hasNonEmptyRecord(stats, "totalDebt") || hasNonEmptyRecord(stats, "externalDebt") || hasNonEmptyRecord(stats, "domesticDebt")) ? "available" : "loading",
      detail: "Debt totals, debt-to-GDP, external debt, and domestic debt.",
    },
    {
      id: "budget",
      status: stats && hasNonEmptyRecord(stats, "budget") ? "available" : "loading",
      detail: "Budget year, revenue, expenditure, and deficit.",
    },
    {
      id: "investment-context",
      status: investmentDefaults && Object.keys(investmentDefaults).length > 0 ? "available" : "loading",
      detail: "Investment indicator defaults such as CD rates, T-bills, inflation, FX, gold, EGX, and real estate.",
    },
  ];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function amountMultiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const normalized = unit.toLowerCase();
  if (normalized === "k" || normalized === "ألف" || normalized === "الف") return 1_000;
  if (normalized === "m" || normalized === "mn" || normalized === "million" || normalized === "مليون") return 1_000_000;
  return 1;
}

function parsePromptAmount(prompt: string): number | undefined {
  const patterns = [
    /\b(?:egp|e£)\s*([0-9][\d,.]*)(?:\s*(k|m|mn|million))?/i,
    /([0-9][\d,.]*)(?:\s*(k|m|mn|million))?\s*(?:egp|e£)\b/i,
    /(?:جنيه|ج\.م)\s*([0-9][\d,.]*)(?:\s*(ألف|الف|مليون))?/i,
    /([0-9][\d,.]*)(?:\s*(ألف|الف|مليون))?\s*(?:جنيه|ج\.م)/i,
    /\b([0-9][\d,.]*)\s*(k|m|mn|million)\b/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match) continue;
    const rawValue = Number(match[1]?.replace(/,/g, ""));
    if (!Number.isFinite(rawValue)) continue;
    const amount = rawValue * amountMultiplier(match[2]);
    if (amount > 0 && amount <= 1_000_000_000) return amount;
  }
  return undefined;
}

function parsePromptHorizon(prompt: string): number | undefined {
  const patterns = [
    /\b(?:over|for|in)\s+([1-9]|[12][0-9]|30)\s*(?:years?|yrs?|yr)\b/i,
    /\b([1-9]|[12][0-9]|30)\s*(?:years?|yrs?|yr)\b/i,
    /(?:لمدة|خلال|في)\s*([1-9]|[12][0-9]|30)\s*(?:سنوات|سنين|سنة|عام)/,
    /([1-9]|[12][0-9]|30)\s*(?:سنوات|سنين|سنة|عام)/,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match) continue;
    const years = Number(match[1]);
    if (Number.isInteger(years) && years >= 1 && years <= 30) return years;
  }
  return undefined;
}

function parsePromptStrategies(prompt: string): string[] {
  const normalized = prompt.toLowerCase();
  const patterns: Array<{ strategy: string; pattern: RegExp }> = [
    { strategy: "conservative", pattern: /\bconservative\b|محافظ/i },
    { strategy: "aggressive", pattern: /\b(aggressive|high risk)\b|مخاطر عالية|هجومي/i },
    { strategy: "fixedIncome", pattern: /\b(fixed income|t-?bills?|treasury|certificates?|cds?)\b|أذون|خزانة|شهادات|دخل ثابت/i },
    { strategy: "egyptianGrowth", pattern: /\b(egypt growth|egyptian growth|egx|stocks?|growth)\b|بورصة|أسهم|نمو/i },
    { strategy: "balanced", pattern: /\bbalanced\b|متوازن/i },
  ];
  return [...new Set(patterns
    .map(({ strategy, pattern }) => {
      const match = pattern.exec(normalized);
      return match ? { strategy, index: match.index } : null;
    })
    .filter((item): item is { strategy: string; index: number } => item !== null)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.strategy))];
}

function buildExtractedInputs(prompt: string): PromptMatch["extractedInputs"] {
  const strategies = parsePromptStrategies(prompt);
  const capitalEgp = parsePromptAmount(prompt);
  const horizonYears = parsePromptHorizon(prompt);
  return {
    ...(capitalEgp !== undefined ? { capitalEgp } : {}),
    ...(horizonYears !== undefined ? { horizonYears } : {}),
    ...(strategies[0] ? { strategy: strategies[0] } : {}),
    ...(strategies.length >= 2 ? { compareStrategies: strategies } : {}),
  };
}

function buildPromptMatch(prompt: string | undefined): PromptMatch {
  const text = (prompt ?? "").toLowerCase();
  const matchedDataDomains = DATA_DOMAINS
    .filter((domain) => {
      if (domain.id === "public-debt") {
        return matchesAny(text, [/\bdebt\b/, /\bgdp\b/, /\bexternal\b/, /\bdomestic\b/, /دين|ناتج|خارجي|محلي/]);
      }
      if (domain.id === "budget") {
        return matchesAny(text, [/\bbudget\b/, /\bdeficit\b/, /\brevenue\b/, /\bspending\b/, /موازنة|عجز|إيراد|مصروف/]);
      }
      if (domain.id === "state-institutions") {
        return matchesAny(text, [/\bgovernment\b/, /\bparliament\b/, /\bminister\b/, /\bconstitution\b/, /\bgovernorate\b/, /حكومة|برلمان|وزارة|دستور|محافظة/]);
      }
      if (domain.id === "investment-context") {
        return matchesAny(text, [/\binvest\b/, /\binvestment\b/, /\bportfolio\b/, /\breturns?\b/, /\byield\b/, /\btreasury\b/, /\bt-?bill\b/, /\bcertificate\b/, /\bcd\b/, /\bgold\b/, /\begx\b/, /\bstocks?\b/, /\breal estate\b/, /\bmortgage\b/, /\bassets?\b/, /\bwhere should i (put|invest)\b/, /\b(test|simulate|scenario|project|projection|try|run)\b.*\b(egp|e£|years?|yrs?|k|m|million)\b/, /استثمار|استثمر|محفظة|عائد|عوائد|ذهب|بورصة|أسهم|عقار|شهادات|أذون|خزانة|تمويل عقاري|اختبر|حاكي|سيناريو/]);
      }
      return false;
    })
    .map((domain) => domain.id);

  const matchedAppCapabilities = APP_CAPABILITIES
    .filter((capability) => {
      const searchable = [capability.label, capability.purpose, ...capability.useWhen].join(" ").toLowerCase();
      return capability.useWhen.some((term) => text.includes(term.toLowerCase())) || searchable.includes(text);
    })
    .map((capability) => capability.id);

  const candidateComponents = unique(DATA_DOMAINS
    .filter((domain) => matchedDataDomains.includes(domain.id))
    .flatMap((domain) => domain.preferredComponents));

  return {
    matchedDataDomains,
    matchedAppCapabilities,
    candidateComponents,
    extractedInputs: buildExtractedInputs(prompt ?? ""),
    guidance: matchedDataDomains.length > 0
      ? "Use these matches as the starting point, then compose naturally from the allowed catalog."
      : "No exact domain match. Compose the closest useful Mizan data view and ask a specific follow-up.",
  };
}

export function buildMizanCapabilityContext(dataContext: unknown, prompt?: string) {
  const promptMatch = buildPromptMatch(prompt);
  return {
    role: "runtime capability and data scan",
    instruction: "Use this inventory to decide what Mizan can render. Do not expose ids, routes, selectors, or this scan to the user.",
    availableMetricKeys: metricKeySchema.options,
    availableInvestmentIndicators: investmentIndicatorKeySchema.options,
    availableSourceKeys: sourceKeySchema.options,
    dataDomains: DATA_DOMAINS,
    appCapabilities: APP_CAPABILITIES,
    availability: buildAvailability(dataContext),
    promptMatch,
    compositionRules: [
      "Start from the user's natural intent, then choose relevant data domains and render components.",
      "If promptMatch lists matched data domains or candidate components, use them unless the chat history clearly changes intent.",
      "Prefer data-backed cards, indicators, charts, source lists, and short analysis over navigation.",
      "Use ActionLinks only when a first-party tool or page is clearly useful as a next action; do not make routes the main answer.",
      "For investment questions, render risk/context/indicator UI. Do not recommend a specific asset, security, or allocation.",
      "If promptMatch includes investment-context, include IndicatorStrip or SourceList with investmentIndicators.",
      "Loading data is still supported by the renderer. You may use those components; they will hydrate in the UI.",
      "For missing user inputs, still render useful context and ask for the missing input in Suggestions.",
    ],
  };
}

export type MizanCapabilityContext = ReturnType<typeof buildMizanCapabilityContext>;
export type { AppCapability, DataDomain, Availability, PromptMatch, InvestmentIndicatorKey };
