"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Renderer, StateProvider, ActionProvider, VisibilityProvider, defineRegistry } from "@json-render/react";
import {
  ArrowUp,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Landmark,
  MessageSquareText,
  RotateCcw,
  Scale,
  Users,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { AiPipelineStatus } from "@/components/ai-pipeline-status";
import { NewsTicker } from "@/components/news-ticker";
import { SanadBadge } from "@/components/sanad-badge";
import { Skeleton } from "@/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/components/providers";
import { fmtEGP, fmtUSD } from "@/lib/format";
import {
  makeFallbackSpec,
  makePromptFallbackSpec,
  mizanJsonCatalog,
  mizanJsonSpecSchema,
  suggestionPromptsForSpec,
  type InvestmentIndicatorKey,
  type Lang,
  type MetricKey,
  type MizanElement,
  type MizanJsonSpec,
  type SourceKey,
} from "@/lib/mizan-generative-spec";
import { cn } from "@/lib/utils";

type StatSource = {
  sourceUrl: string;
  sanadLevel: number;
};

type HomeStats = {
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

type InvestmentDefaults = Partial<Record<InvestmentIndicatorKey, {
  value: number;
  unit: string;
  date: string;
  sanadLevel: number;
  sourceUrl?: string;
}>>;

type Turn = {
  id: string;
  prompt: string;
  text: string | null;
  spec: MizanJsonSpec | null;
  suggestions: string[];
  status: "running" | "done" | "error";
  error?: string;
  createdAt: number;
};

type HarnessResponse = {
  text?: string;
  spec?: unknown;
  error?: string;
};

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

const TURN_STORAGE_KEY = "mizan-json-render-turns-v1";
const OLD_STORAGE_KEYS = [
  "mizan-ai-grid-turns-v1",
  "mizan-notation-turns-v2",
  "mizan-notation-turns",
  "mizan-ui-thread",
];

const COPY = {
  en: {
    title: "Mizan",
    subtitle: "Ask about Egypt's public data.",
    placeholder: "Ask about debt, budget, government, sources, or scenarios...",
    reset: "Reset",
    ask: "Ask",
    empty: "Ask a question and Mizan will render a sourced data view.",
    working: "Building view",
    rendered: "Rendered",
    failed: "Render failed",
    examples: [
      "Show debt status",
      "Show the budget gap",
      "Who runs what?",
      "Can I trust the sources?",
    ],
    labels: {
      dataView: "Data view",
      government: "Government",
      parliament: "Parliament",
      governorates: "Governorates",
      constitution: "Constitution",
      budget: "Budget",
      revenue: "Revenue",
      spending: "Spending",
      deficit: "Deficit",
      debt: "Debt",
      external: "External",
      domestic: "Domestic",
      ministries: "ministries",
      members: "members",
      regions: "regions",
      articles: "articles",
      debtToGdp: "Debt to GDP",
      totalDebt: "Total debt",
      source: "Source",
      page: "Page",
      pending: "Composing the interface...",
      noSource: "Source unavailable",
    },
  },
  ar: {
    title: "ميزان",
    subtitle: "اسأل عن بيانات مصر العامة.",
    placeholder: "اسأل عن الدين أو الموازنة أو الحكومة أو المصادر أو السيناريوهات...",
    reset: "إعادة",
    ask: "اسأل",
    empty: "اسأل سؤالا وسيعرض ميزان لوحة بيانات موثقة.",
    working: "يبني الواجهة",
    rendered: "تم العرض",
    failed: "تعذر العرض",
    examples: [
      "اعرض وضع الدين",
      "أظهر فجوة الموازنة",
      "من يدير ماذا؟",
      "هل المصادر موثوقة؟",
    ],
    labels: {
      dataView: "عرض بيانات",
      government: "الحكومة",
      parliament: "البرلمان",
      governorates: "المحافظات",
      constitution: "الدستور",
      budget: "الموازنة",
      revenue: "الإيرادات",
      spending: "المصروفات",
      deficit: "العجز",
      debt: "الدين",
      external: "خارجي",
      domestic: "محلي",
      ministries: "وزارة",
      members: "عضو",
      regions: "محافظة",
      articles: "مادة",
      debtToGdp: "الدين للناتج",
      totalDebt: "إجمالي الدين",
      source: "المصدر",
      page: "صفحة",
      pending: "أجهز الواجهة...",
      noSource: "المصدر غير متاح",
    },
  },
} as const;

function moneyBillions(value: number): string {
  return fmtEGP(value * 1_000_000_000, { compact: true, decimals: 1 });
}

function appHrefForMetric(metric: MetricKey): string {
  if (metric === "ministries") return "/government";
  if (metric === "parliament") return "/parliament";
  if (metric === "governorates") return "/governorate";
  if (metric === "constitutionArticles") return "/constitution";
  if (metric.startsWith("budget")) return "/budget";
  if (metric.includes("Debt") || metric === "debtGdp") return "/debt";
  return "/transparency";
}

function sourceForMetric(metric: MetricKey, stats: HomeStats | undefined): StatSource | null | undefined {
  switch (metric) {
    case "ministries":
      return stats?.ministries;
    case "parliament":
      return stats?.parliamentarians;
    case "governorates":
      return stats?.governorates;
    case "constitutionArticles":
      return stats?.constitutionArticles;
    case "externalDebt":
      return stats?.externalDebt;
    case "domesticDebt":
      return stats?.domesticDebt;
    case "debtTotal":
    case "debtGdp":
      return stats?.totalDebt;
    case "budgetRevenue":
    case "budgetSpending":
    case "budgetDeficit":
    case "budgetYear":
      return stats?.budget;
  }
}

function metricInfo(metric: MetricKey, stats: HomeStats | undefined, lang: Lang) {
  const c = COPY[lang].labels;
  switch (metric) {
    case "ministries":
      return { label: c.government, value: `${stats?.ministries.value.toLocaleString() ?? "..."} ${c.ministries}` };
    case "parliament":
      return { label: c.parliament, value: `${stats?.parliamentarians.value.toLocaleString() ?? "..."} ${c.members}` };
    case "governorates":
      return { label: c.governorates, value: `${stats?.governorates.value.toLocaleString() ?? "..."} ${c.regions}` };
    case "constitutionArticles":
      return { label: c.constitution, value: `${stats?.constitutionArticles.value.toLocaleString() ?? "..."} ${c.articles}` };
    case "externalDebt":
      return { label: c.external, value: stats?.externalDebt ? fmtUSD(stats.externalDebt.value, { compact: true, decimals: 1 }) : "..." };
    case "domesticDebt":
      return { label: c.domestic, value: stats?.domesticDebt ? fmtEGP(stats.domesticDebt.value, { compact: true, decimals: 1 }) : "..." };
    case "debtTotal":
      return { label: c.totalDebt, value: stats?.totalDebt ? fmtUSD(stats.totalDebt.value, { compact: true, decimals: 1 }) : "..." };
    case "debtGdp":
      return { label: c.debtToGdp, value: stats?.totalDebt?.debtToGdpRatio != null ? `${stats.totalDebt.debtToGdpRatio.toFixed(1)}%` : "..." };
    case "budgetRevenue":
      return { label: c.revenue, value: stats?.budget ? moneyBillions(stats.budget.totalRevenue) : "..." };
    case "budgetSpending":
      return { label: c.spending, value: stats?.budget ? moneyBillions(stats.budget.totalExpenditure) : "..." };
    case "budgetDeficit":
      return { label: c.deficit, value: stats?.budget ? moneyBillions(Math.abs(stats.budget.deficit)) : "..." };
    case "budgetYear":
      return { label: c.budget, value: stats?.budget?.year ?? "..." };
  }
}

function sourceForKey(
  sourceKey: SourceKey,
  stats: HomeStats | undefined,
  investmentDefaults: InvestmentDefaults | undefined,
): StatSource | null | undefined {
  switch (sourceKey) {
    case "ministries":
      return stats?.ministries;
    case "parliament":
      return stats?.parliamentarians;
    case "governorates":
      return stats?.governorates;
    case "constitutionArticles":
      return stats?.constitutionArticles;
    case "totalDebt":
      return stats?.totalDebt;
    case "externalDebt":
      return stats?.externalDebt;
    case "domesticDebt":
      return stats?.domesticDebt;
    case "budget":
      return stats?.budget;
    case "investmentIndicators": {
      const record = Object.values(investmentDefaults ?? {}).find((item) => item?.sourceUrl);
      return record?.sourceUrl ? { sourceUrl: record.sourceUrl, sanadLevel: record.sanadLevel } : null;
    }
  }
}

function sourceLabel(sourceKey: SourceKey, lang: Lang): string {
  const c = COPY[lang].labels;
  const labels: Record<SourceKey, string> = {
    ministries: c.government,
    parliament: c.parliament,
    governorates: c.governorates,
    constitutionArticles: c.constitution,
    totalDebt: c.totalDebt,
    externalDebt: c.external,
    domesticDebt: c.domestic,
    budget: c.budget,
    investmentIndicators: lang === "ar" ? "مؤشرات الاستثمار" : "Investment indicators",
  };
  return labels[sourceKey];
}

function chartHoverLabel(label: string, value: string, detail: string): string {
  return `${label}: ${value}. ${detail}`;
}

function EvidenceLinks({
  source,
  appHref,
  lang,
  className,
}: {
  source: StatSource | null | undefined;
  appHref: string;
  lang: Lang;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5", className)}>
      <Link
        href={appHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] border border-border/70 bg-background/70 px-2 text-[0.65rem] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary"
      >
        {COPY[lang].labels.page}
        <ArrowUpRight size={10} />
      </Link>
      {source && (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={lang === "ar" ? "افتح المصدر الأصلي" : "Open original source"}
          className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/70 px-2 text-[0.65rem] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary"
        >
          <SanadBadge sanadLevel={source.sanadLevel} showLabel focusable={false} />
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function formatIndicatorValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit.toLowerCase() === "egp/usd") return `${value.toFixed(1)} EGP/USD`;
  if (unit.toUpperCase() === "EGP") return fmtEGP(value, { compact: true, decimals: 1 });
  if (unit.toUpperCase() === "USD") return fmtUSD(value, { compact: true, decimals: 1 });
  return `${value.toLocaleString()} ${unit}`;
}

function indicatorLabel(key: InvestmentIndicatorKey, lang: Lang): string {
  const labels: Record<InvestmentIndicatorKey, { en: string; ar: string }> = {
    egx30_annual_return: { en: "EGX30 return", ar: "عائد EGX30" },
    egypt_real_estate_return: { en: "Real estate", ar: "العقار" },
    gold_annual_return: { en: "Gold", ar: "الذهب" },
    cbe_cd_rate: { en: "Bank CDs", ar: "شهادات البنوك" },
    egypt_tbill_rate: { en: "T-bills", ar: "أذون الخزانة" },
    inflation: { en: "Inflation", ar: "التضخم" },
    exchange_rate: { en: "Exchange rate", ar: "سعر الصرف" },
    egypt_mortgage_rate: { en: "Mortgage rate", ar: "تمويل عقاري" },
  };
  return labels[key][lang];
}

type SimulatorInputs = Extract<MizanElement, { type: "ToolSimulator" }>["props"]["inputs"];
type SimulatorProps = Extract<MizanElement, { type: "ToolSimulator" }>["props"] | Extract<MizanElement, { type: "ToolLaunch" }>["props"];
type SimulatorAssetKey = "tbills" | "cds" | "egx30" | "realEstate" | "gold";
type SimulatorStrategy = NonNullable<SimulatorInputs["strategy"]>;

const SIMULATOR_ASSETS: Array<{
  key: SimulatorAssetKey;
  indicator: InvestmentIndicatorKey;
  fallbackReturn: number;
  color: string;
  label: Record<Lang, string>;
}> = [
  { key: "tbills", indicator: "egypt_tbill_rate", fallbackReturn: 25.7, color: "#3FC380", label: { en: "T-bills", ar: "أذون خزانة" } },
  { key: "cds", indicator: "cbe_cd_rate", fallbackReturn: 16, color: "#6C8EEF", label: { en: "Bank CDs", ar: "شهادات بنكية" } },
  { key: "egx30", indicator: "egx30_annual_return", fallbackReturn: 18.5, color: "#C9A84C", label: { en: "EGX30", ar: "EGX30" } },
  { key: "realEstate", indicator: "egypt_real_estate_return", fallbackReturn: 15, color: "#2EC4B6", label: { en: "Real estate", ar: "عقار" } },
  { key: "gold", indicator: "gold_annual_return", fallbackReturn: 20, color: "#F59E0B", label: { en: "Gold", ar: "ذهب" } },
];

const SIMULATOR_STRATEGIES: Record<SimulatorStrategy, {
  label: Record<Lang, string>;
  allocation: Record<SimulatorAssetKey, number>;
}> = {
  conservative: {
    label: { en: "Conservative", ar: "محافظ" },
    allocation: { tbills: 35, cds: 35, egx30: 5, realEstate: 15, gold: 10 },
  },
  balanced: {
    label: { en: "Balanced", ar: "متوازن" },
    allocation: { tbills: 20, cds: 20, egx30: 20, realEstate: 20, gold: 20 },
  },
  aggressive: {
    label: { en: "Aggressive", ar: "هجومي" },
    allocation: { tbills: 5, cds: 10, egx30: 40, realEstate: 25, gold: 20 },
  },
  fixedIncome: {
    label: { en: "Fixed income", ar: "دخل ثابت" },
    allocation: { tbills: 45, cds: 45, egx30: 0, realEstate: 0, gold: 10 },
  },
  egyptianGrowth: {
    label: { en: "Egypt growth", ar: "نمو مصري" },
    allocation: { tbills: 10, cds: 15, egx30: 40, realEstate: 25, gold: 10 },
  },
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function investmentIndicatorValue(
  investmentDefaults: InvestmentDefaults | undefined,
  key: InvestmentIndicatorKey,
  fallback: number,
): number {
  const value = investmentDefaults?.[key]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function investmentSource(investmentDefaults: InvestmentDefaults | undefined): StatSource | null {
  const record = Object.values(investmentDefaults ?? {}).find((item) => item?.sourceUrl);
  return record?.sourceUrl ? { sourceUrl: record.sourceUrl, sanadLevel: record.sanadLevel } : null;
}

function simulatorLinePath(values: number[], width: number, height: number): string {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, max);
  const range = Math.max(max - min, max * 0.08, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - 8 - ((value - min) / range) * (height - 16);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function simulatorAreaPath(values: number[], width: number, height: number): string {
  const line = simulatorLinePath(values, width, height);
  return `${line} L${width},${height - 8} L0,${height - 8} Z`;
}

function comparisonStrategies(primary: SimulatorStrategy): SimulatorStrategy[] {
  const candidates: SimulatorStrategy[] = primary === "fixedIncome"
    ? ["fixedIncome", "balanced", "egyptianGrowth"]
    : [primary, "fixedIncome", "balanced"];
  return Array.from(new Set(candidates)).slice(0, 3);
}

function InvestmentSimulatorBlock({
  props,
  investmentDefaults,
  lang,
}: {
  props: SimulatorProps;
  investmentDefaults: InvestmentDefaults | undefined;
  lang: Lang;
}) {
  const initialInputs = props.inputs;
  const title = "href" in props
    ? (lang === "ar" ? "محاكي الاستثمار" : "Investment simulator")
    : props.title;
  const description = "href" in props
    ? (lang === "ar" ? "اضبط السيناريو داخل اللوحة وقارن العائد الاسمي والحقيقي." : "Adjust the scenario in this board and compare nominal and real outcomes.")
    : props.description;
  const mode = "mode" in props ? props.mode : "simulate";
  const [capital, setCapital] = useState(initialInputs.capitalEgp ?? 100_000);
  const [horizon, setHorizon] = useState(initialInputs.horizonYears ?? 5);
  const [strategy, setStrategy] = useState<SimulatorStrategy>(initialInputs.strategy ?? "balanced");
  const [inflation, setInflation] = useState(initialInputs.inflationPct ?? investmentIndicatorValue(investmentDefaults, "inflation", 12));
  const [depreciation, setDepreciation] = useState(initialInputs.egpDepreciationPct ?? 7);

  useEffect(() => {
    setCapital(initialInputs.capitalEgp ?? 100_000);
    setHorizon(initialInputs.horizonYears ?? 5);
    setStrategy(initialInputs.strategy ?? "balanced");
    setInflation(initialInputs.inflationPct ?? investmentIndicatorValue(investmentDefaults, "inflation", 12));
    setDepreciation(initialInputs.egpDepreciationPct ?? 7);
  }, [
    initialInputs.capitalEgp,
    initialInputs.egpDepreciationPct,
    initialInputs.horizonYears,
    initialInputs.inflationPct,
    initialInputs.strategy,
    investmentDefaults,
  ]);

  const projection = useMemo(() => {
    const exchangeRate = investmentIndicatorValue(investmentDefaults, "exchange_rate", 50);
    const returns = Object.fromEntries(SIMULATOR_ASSETS.map((asset) => [
      asset.key,
      investmentIndicatorValue(investmentDefaults, asset.indicator, asset.fallbackReturn),
    ])) as Record<SimulatorAssetKey, number>;

    function build(strategyKey: SimulatorStrategy) {
      const allocation = SIMULATOR_STRATEGIES[strategyKey].allocation;
      const rows = Array.from({ length: horizon + 1 }, (_, year) => {
        const nominal = SIMULATOR_ASSETS.reduce((sum, asset) => {
          const share = capital * ((allocation[asset.key] ?? 0) / 100);
          return sum + share * Math.pow(1 + (returns[asset.key] ?? 0) / 100, year);
        }, 0);
        return {
          year,
          nominal,
          real: nominal / Math.pow(1 + inflation / 100, year),
          usd: nominal / (exchangeRate * Math.pow(1 + depreciation / 100, year)),
        };
      });
      const final = rows.at(-1) ?? rows[0];
      const weightedReturn = SIMULATOR_ASSETS.reduce((sum, asset) => sum + ((allocation[asset.key] ?? 0) / 100) * (returns[asset.key] ?? 0), 0);
      return { strategy: strategyKey, allocation, final, rows, weightedReturn };
    }

    const current = build(strategy);
    const comparison = comparisonStrategies(strategy).map((strategyKey) => build(strategyKey));
    return { ...current, comparison, exchangeRate };
  }, [capital, depreciation, horizon, inflation, investmentDefaults, strategy]);

  const source = investmentSource(investmentDefaults);
  const nominalPath = simulatorLinePath(projection.rows.map((row) => row.nominal), 280, 90);
  const realPath = simulatorLinePath(projection.rows.map((row) => row.real), 280, 90);
  const nominalArea = simulatorAreaPath(projection.rows.map((row) => row.nominal), 280, 90);
  const maxComparisonValue = Math.max(...projection.comparison.map((item) => item.final.nominal), 1);

  return (
    <div className="workbench-tile min-w-0 rounded-[8px] border border-primary/55 bg-primary/10 p-4 animate-fade-up xl:col-span-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-primary">{title}</p>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-muted-foreground">{description}</p>
        </div>
        <EvidenceLinks source={source} appHref="/tools/invest" lang={lang} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-3 rounded-[8px] border border-border/70 bg-background/70 p-3">
          <label className="grid gap-2 text-xs font-semibold text-muted-foreground">
            {lang === "ar" ? "رأس المال" : "Capital"}
            <input
              type="number"
              min={10_000}
              max={1_000_000_000}
              step={10_000}
              value={capital}
              onChange={(event) => setCapital(clampNumber(Number(event.target.value) || 0, 10_000, 1_000_000_000))}
              className="h-10 rounded-[6px] border border-border/70 bg-card px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
              dir="ltr"
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-muted-foreground">
            {lang === "ar" ? `المدة: ${horizon} سنوات` : `Horizon: ${horizon} years`}
            <input
              type="range"
              min={1}
              max={30}
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value))}
              className="accent-primary"
            />
          </label>
          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "الاستراتيجية" : "Strategy"}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SIMULATOR_STRATEGIES) as SimulatorStrategy[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStrategy(key)}
                  className={cn(
                    "rounded-[6px] border px-2.5 py-1.5 text-[0.68rem] font-semibold transition-colors",
                    strategy === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/70 bg-card text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {SIMULATOR_STRATEGIES[key].label[lang]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[8px] border border-border/70 bg-background/70 p-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{lang === "ar" ? "القيمة الاسمية" : "Nominal"}</p>
              <p className="mt-3 font-mono text-xl font-black text-primary" dir="ltr">{fmtEGP(projection.final.nominal, { compact: true, decimals: 1 })}</p>
            </div>
            <div className="rounded-[8px] border border-border/70 bg-background/70 p-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{lang === "ar" ? "بقيمة اليوم" : "Real"}</p>
              <p className="mt-3 font-mono text-xl font-black text-chart-3" dir="ltr">{fmtEGP(projection.final.real, { compact: true, decimals: 1 })}</p>
            </div>
            <div className="rounded-[8px] border border-border/70 bg-background/70 p-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{lang === "ar" ? "بالدولار" : "USD view"}</p>
              <p className="mt-3 font-mono text-xl font-black text-chart-2" dir="ltr">{fmtUSD(projection.final.usd, { compact: true, decimals: 1 })}</p>
            </div>
          </div>

          <div className="rounded-[8px] border border-border/70 bg-background/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold">{lang === "ar" ? "مسار السيناريو" : "Scenario path"}</p>
              <p className="font-mono text-[0.68rem] text-muted-foreground" dir="ltr">
                {projection.weightedReturn.toFixed(1)}% / yr · {inflation.toFixed(1)}% inflation
              </p>
            </div>
            <svg viewBox="0 0 280 90" role="img" aria-label={lang === "ar" ? "رسم مسار الاستثمار" : "Investment projection chart"} className="h-32 w-full overflow-visible" preserveAspectRatio="none">
              {[18, 45, 72].map((y) => (
                <line key={y} x1="0" x2="280" y1={y} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={nominalArea} fill="currentColor" className="text-primary/15" />
              <path d={nominalPath} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" vectorEffect="non-scaling-stroke">
                <title>{lang === "ar" ? "القيمة الاسمية" : "Nominal value"}</title>
              </path>
              <path d={realPath} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" className="text-chart-3" vectorEffect="non-scaling-stroke">
                <title>{lang === "ar" ? "القيمة الحقيقية" : "Inflation-adjusted value"}</title>
              </path>
              <circle cx="280" cy={nominalPath.split(" ").at(-1)?.split(",").at(1) ?? 8} r="3.5" fill="currentColor" className="text-primary" />
              <circle cx="280" cy={realPath.split(" ").at(-1)?.split(",").at(1) ?? 8} r="3" fill="currentColor" className="text-chart-3" />
            </svg>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                { label: lang === "ar" ? "اسمي" : "Nominal", value: projection.final.nominal, color: "bg-primary" },
                { label: lang === "ar" ? "حقيقي" : "Real", value: projection.final.real, color: "bg-chart-3" },
              ].map((row) => (
                <div key={row.label} className="rounded-[6px] border border-border/60 bg-card/70 p-2">
                  <div className="flex items-center justify-between gap-2 text-[0.65rem] font-semibold text-muted-foreground">
                    <span>{row.label}</span>
                    <span className="font-mono" dir="ltr">{fmtEGP(row.value, { compact: true, decimals: 1 })}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-[3px] bg-muted">
                    <div className={cn("h-full rounded-[3px]", row.color)} style={{ width: `${Math.max(6, (row.value / Math.max(projection.final.nominal, 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-[4px] bg-muted">
              {SIMULATOR_ASSETS.map((asset) => {
                const pct = projection.allocation[asset.key] ?? 0;
                if (pct <= 0) return null;
                return (
                  <div key={asset.key} style={{ width: `${pct}%`, backgroundColor: asset.color }} title={`${asset.label[lang]}: ${pct}%`} />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {SIMULATOR_ASSETS.map((asset) => {
                const pct = projection.allocation[asset.key] ?? 0;
                if (pct <= 0) return null;
                return (
                  <span key={asset.key} className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground" title={`${asset.label[lang]}: ${pct}%`}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: asset.color }} />
                    {asset.label[lang]} {pct}%
                  </span>
                );
              })}
            </div>
          </div>

          {mode === "compare" && (
            <div className="rounded-[8px] border border-border/70 bg-background/70 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold">{lang === "ar" ? "مقارنة جانبية" : "Side-by-side comparison"}</p>
                <p className="text-[0.68rem] text-muted-foreground">{lang === "ar" ? "نهاية المدة" : "End of horizon"}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {projection.comparison.map((item) => (
                  <div key={item.strategy} className={cn(
                    "rounded-[8px] border p-3",
                    item.strategy === strategy ? "border-primary/60 bg-primary/10" : "border-border/60 bg-card/70",
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold">{SIMULATOR_STRATEGIES[item.strategy].label[lang]}</p>
                      <span className="font-mono text-[0.65rem] text-muted-foreground" dir="ltr">{item.weightedReturn.toFixed(1)}%</span>
                    </div>
                    <p className="mt-3 font-mono text-lg font-black text-primary" dir="ltr">{fmtEGP(item.final.nominal, { compact: true, decimals: 1 })}</p>
                    <p className="mt-1 font-mono text-sm font-bold text-chart-3" dir="ltr">{fmtEGP(item.final.real, { compact: true, decimals: 1 })} real</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-[3px] bg-muted">
                      <div className="h-full rounded-[3px] bg-primary" style={{ width: `${Math.max(8, (item.final.nominal / maxComparisonValue) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MizanMotionTitle({ lang }: { lang: Lang }) {
  const terms = lang === "ar"
    ? ["يجمع", "يعرض"]
    : ["collects", "visualizes"];

  return (
    <h1 className="mizan-motion-title" aria-label={lang === "ar" ? "ميزان يجمع ويعرض" : "Mizan collects and visualizes"}>
      <span>{COPY[lang].title}</span>
      <span className="mizan-slot-text" aria-hidden="true">
        {terms.map((term) => (
          <span key={term}>{term}</span>
        ))}
      </span>
    </h1>
  );
}

function PromptBox({
  input,
  lang,
  disabled,
  onInput,
  onSubmit,
}: {
  input: string;
  lang: Lang;
  disabled: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
}) {
  const copy = COPY[lang];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-[8px] border border-border bg-card/90 p-2 shadow-none transition-colors focus-within:border-primary"
    >
      <MessageSquareText size={17} className="ms-2 shrink-0 text-muted-foreground" />
      <input
        value={input}
        onChange={(event) => onInput(event.target.value)}
        placeholder={copy.placeholder}
        disabled={disabled}
        className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
      <button type="submit" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40" disabled={disabled || !input.trim()}>
        <ArrowUp size={17} />
      </button>
    </form>
  );
}

function MizanRenderer({
  spec,
  lang,
  stats,
  investmentDefaults,
  disabled,
  onSuggestion,
}: {
  spec: MizanJsonSpec;
  lang: Lang;
  stats: HomeStats | undefined;
  investmentDefaults: InvestmentDefaults | undefined;
  disabled: boolean;
  onSuggestion: (prompt: string) => void;
}) {
  const { registry } = useMemo(() => defineRegistry(mizanJsonCatalog, {
    components: {
      MizanBoard: ({ props, children }) => (
        <section className="workbench-panel relative rounded-[8px] bg-card/90 p-4 animate-fade-up md:p-5" dir={props.lang === "ar" ? "rtl" : "ltr"}>
          <div className="border-b border-border/80 pb-5">
            <span className="workbench-label rounded-[6px] border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
              {props.eyebrow}
            </span>
            <h2 className="mt-5 max-w-5xl text-2xl font-black leading-tight md:text-4xl">
              {props.title}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground md:text-base">
              {props.summary}
            </p>
          </div>
          <div className="py-5">{children}</div>
        </section>
      ),
      MizanGrid: ({ children }) => (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          {children}
        </div>
      ),
      MetricCard: ({ props }) => {
        const info = metricInfo(props.metric, stats, lang);
        const source = sourceForMetric(props.metric, stats);
        const toneClass = {
          primary: "text-primary",
          blue: "text-chart-2",
          teal: "text-chart-3",
          red: "text-destructive",
          purple: "text-chart-5",
        }[props.tone];

        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">{props.title || info.label}</p>
              <EvidenceLinks source={source} appHref={appHrefForMetric(props.metric)} lang={lang} />
            </div>
            <p className={cn("mt-5 font-mono text-2xl font-black tabular-nums", toneClass)} dir="ltr">
              {info.value}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{props.description}</p>
          </div>
        );
      },
      BudgetBars: ({ props }) => {
        const c = COPY[lang].labels;
        const budget = stats?.budget;
        const revenue = budget?.totalRevenue ?? 0;
        const spending = budget?.totalExpenditure ?? 0;
        const deficit = Math.abs(budget?.deficit ?? 0);
        const max = Math.max(revenue, spending, deficit, 1);
        const rows = [
          { label: c.revenue, value: revenue, color: "bg-chart-3" },
          { label: c.spending, value: spending, color: "bg-chart-4" },
          { label: c.deficit, value: deficit, color: "bg-destructive" },
        ];

        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{props.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
              </div>
              <EvidenceLinks source={budget} appHref="/budget" lang={lang} />
            </div>
            <div className="space-y-5">
              {rows.map((row, index) => {
                const relativePct = Math.max(5, (row.value / max) * 100);
                const valueLabel = budget ? moneyBillions(row.value) : "...";
                const detail = lang === "ar"
                  ? `${relativePct.toFixed(1)}% من أكبر بند ظاهر`
                  : `${relativePct.toFixed(1)}% of the largest visible line`;

                return (
                  <div key={row.label} style={{ animationDelay: `${index * 80}ms` }} className="animate-fade-up">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-sm font-bold" dir="ltr">{valueLabel}</span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={chartHoverLabel(row.label, valueLabel, detail)}
                          className="h-3 cursor-help overflow-hidden rounded-[4px] bg-muted outline-none ring-primary/0 transition-shadow hover:ring-2 focus-visible:ring-2"
                        >
                          <div
                            className={cn("h-full w-full rounded-[4px] transition-transform duration-700", row.color)}
                            style={{
                              transform: `scaleX(${relativePct / 100})`,
                              transformOrigin: lang === "ar" ? "right center" : "left center",
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-60 leading-5">
                        <span className="font-semibold">{row.label}</span>
                        <span className="ms-2 font-mono" dir="ltr">{valueLabel}</span>
                        <span className="block text-muted">{detail}</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>
        );
      },
      DebtSplit: ({ props }) => {
        const c = COPY[lang].labels;
        const external = stats?.externalDebt?.value ?? 0;
        const domestic = stats?.domesticDebt?.value ?? 0;
        const total = Math.max(external + domestic, 1);
        const externalPct = (external / total) * 100;
        const domesticPct = (domestic / total) * 100;

        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{props.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
              </div>
              <EvidenceLinks source={stats?.totalDebt} appHref="/debt" lang={lang} />
            </div>
            <div className="h-5 overflow-hidden rounded-[4px] bg-muted">
              <div className="flex h-full">
                {[
                  {
                    label: c.external,
                    value: stats?.externalDebt ? fmtUSD(external, { compact: true, decimals: 1 }) : "...",
                    pct: externalPct,
                    color: "bg-chart-2",
                  },
                  {
                    label: c.domestic,
                    value: stats?.domesticDebt ? fmtEGP(domestic, { compact: true, decimals: 1 }) : "...",
                    pct: domesticPct,
                    color: "bg-chart-5",
                  },
                ].map((segment) => {
                  const detail = lang === "ar"
                    ? `${segment.pct.toFixed(1)}% من الشريط`
                    : `${segment.pct.toFixed(1)}% of the bar`;

                  return (
                    <Tooltip key={segment.label}>
                      <TooltipTrigger asChild>
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={chartHoverLabel(segment.label, segment.value, detail)}
                          className={cn("h-full cursor-help outline-none transition-[filter] hover:brightness-125 focus-visible:brightness-125", segment.color)}
                          style={{ width: `${segment.pct}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-56 leading-5">
                        <span className="font-semibold">{segment.label}</span>
                        <span className="ms-2 font-mono" dir="ltr">{segment.value}</span>
                        <span className="block text-muted">{detail}</span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[6px] border border-border/60 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{c.external}</p>
                <p className="mt-2 font-mono font-bold" dir="ltr">{stats?.externalDebt ? fmtUSD(external, { compact: true, decimals: 1 }) : "..."}</p>
              </div>
              <div className="rounded-[6px] border border-border/60 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{c.domestic}</p>
                <p className="mt-2 font-mono font-bold" dir="ltr">{stats?.domesticDebt ? fmtEGP(domestic, { compact: true, decimals: 1 }) : "..."}</p>
              </div>
            </div>
          </div>
        );
      },
      EntityGrid: ({ props }) => {
        const c = COPY[lang].labels;
        const rows = [
          { label: c.government, metric: "ministries" as const, icon: Building2 },
          { label: c.parliament, metric: "parliament" as const, icon: Users },
          { label: c.governorates, metric: "governorates" as const, icon: Landmark },
          { label: c.constitution, metric: "constitutionArticles" as const, icon: Scale },
        ];

        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-8">
            <div className="mb-4">
              <p className="text-sm font-bold">{props.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((row) => {
                const Icon = row.icon;
                const info = metricInfo(row.metric, stats, lang);
                return (
                  <div key={row.metric} className="rounded-[6px] border border-border/60 bg-background/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Icon size={14} />
                        {row.label}
                      </span>
                      <EvidenceLinks source={sourceForMetric(row.metric, stats)} appHref={appHrefForMetric(row.metric)} lang={lang} />
                    </div>
                    <p className="mt-4 font-mono text-lg font-bold" dir="ltr">{info.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      },
      SourceList: ({ props }) => {
        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-12">
            <p className="text-sm font-bold">{props.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
            <div className="mt-4 grid gap-2">
              {props.sources.map((sourceKey) => {
                const source = sourceForKey(sourceKey, stats, investmentDefaults);
                return (
                  <div key={sourceKey} data-source-row className="grid min-w-0 gap-2 rounded-[6px] border border-border/50 bg-background/70 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <span className="block min-w-0 truncate text-xs text-muted-foreground" dir="ltr" title={source ? source.sourceUrl : sourceLabel(sourceKey, lang)}>
                      {source ? source.sourceUrl : `${sourceLabel(sourceKey, lang)}: ${COPY[lang].labels.noSource}`}
                    </span>
                    <EvidenceLinks source={source} appHref="/transparency" lang={lang} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      },
      IndicatorStrip: ({ props }) => {
        const isLoading = investmentDefaults === undefined;
        const indicators = isLoading
          ? props.indicators
          : props.indicators.filter((key) => investmentDefaults[key] !== undefined);
        return (
          <div className="workbench-tile min-w-0 rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up xl:col-span-12">
            <p className="text-sm font-bold">{props.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {indicators.map((key, index) => {
                const record = investmentDefaults?.[key];
                const badgeSource = record?.sourceUrl
                  ? { sourceUrl: record.sourceUrl, sanadLevel: record.sanadLevel }
                  : null;
                return (
                  <div key={key} className="rounded-[6px] border border-border/60 bg-background/70 p-3 animate-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">{indicatorLabel(key, lang)}</p>
                      <EvidenceLinks source={badgeSource} appHref="/economy" lang={lang} />
                    </div>
                    <p className="mt-4 font-mono text-xl font-black text-foreground" dir="ltr">
                      {record ? formatIndicatorValue(record.value, record.unit) : "..."}
                    </p>
                    {record?.date && (
                      <p className="mt-2 text-[0.65rem] text-muted-foreground">{record.date}</p>
                    )}
                  </div>
                );
              })}
              {!isLoading && indicators.length === 0 && (
                <div className="rounded-[6px] border border-border/60 bg-background/70 p-3 text-xs leading-5 text-muted-foreground sm:col-span-2 xl:col-span-4">
                  {lang === "ar" ? "لا توجد مؤشرات موثقة متاحة لهذا العرض حاليا." : "No sourced indicators are available for this view yet."}
                </div>
              )}
            </div>
          </div>
        );
      },
      InsightList: ({ props }) => {
        return (
          <div className="grid min-w-0 gap-3 xl:col-span-4">
            {props.items.map((item, index) => {
              const info = item.metric ? metricInfo(item.metric, stats, lang) : null;
              return (
                <div key={`${item.label}-${index}`} className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-primary">{item.label}</p>
                    {info && <p className="font-mono text-sm font-bold" dir="ltr">{info.value}</p>}
                  </div>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">{item.note}</p>
                </div>
              );
            })}
          </div>
        );
      },
      Callout: ({ props }) => {
        const toneClass = {
          primary: "border-primary/50 bg-primary/10 text-primary",
          blue: "border-chart-2/50 bg-chart-2/10 text-chart-2",
          teal: "border-chart-3/50 bg-chart-3/10 text-chart-3",
          red: "border-destructive/50 bg-destructive/10 text-destructive",
          purple: "border-chart-5/50 bg-chart-5/10 text-chart-5",
        }[props.tone];
        return (
          <div className={cn("min-w-0 rounded-[8px] border p-4 animate-fade-up xl:col-span-4", toneClass)}>
            <p className="text-sm font-bold">{props.title}</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{props.body}</p>
          </div>
        );
      },
      ActionLinks: ({ props }) => (
        <div className="grid min-w-0 gap-3 xl:col-span-4">
          <p className="text-sm font-bold">{props.title}</p>
          {props.links.map((linkItem, index) => (
            <Link
              key={linkItem.href}
              href={linkItem.href}
              className="group workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 no-underline transition-colors hover:border-primary animate-fade-up"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-foreground">{linkItem.label}</span>
                <ArrowUpRight size={14} className="text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{linkItem.description}</p>
            </Link>
          ))}
        </div>
      ),
      ToolSimulator: ({ props }) => (
        <InvestmentSimulatorBlock props={props} investmentDefaults={investmentDefaults} lang={lang} />
      ),
      ToolLaunch: ({ props }) => (
        <InvestmentSimulatorBlock props={props} investmentDefaults={investmentDefaults} lang={lang} />
      ),
      Suggestions: ({ props }) => (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {props.prompts.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              disabled={disabled}
              className="rounded-[6px] border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ),
    },
  }), [disabled, investmentDefaults, lang, onSuggestion, stats]);

  return (
    <StateProvider initialState={spec.state}>
      <ActionProvider handlers={{}}>
        <VisibilityProvider>
          <Renderer spec={spec} registry={registry} />
        </VisibilityProvider>
      </ActionProvider>
    </StateProvider>
  );
}

function ChatRail({
  turns,
  input,
  lang,
  disabled,
  onInput,
  onSubmit,
  onSuggestion,
  onReset,
}: {
  turns: Turn[];
  input: string;
  lang: Lang;
  disabled: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onSuggestion: (prompt: string) => void;
  onReset: () => void;
}) {
  const copy = COPY[lang];
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [turns]);

  return (
    <aside className="workbench-panel rounded-[8px] bg-card/90 p-3 animate-chat-rail lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-[6px] border border-border/70 bg-background/75 px-3 py-2">
          <div>
            <p className="workbench-label text-primary">Mizan</p>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "محادثة حية" : "Live chat"}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw size={12} />
            {copy.reset}
          </button>
        </div>

        <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[8px] border border-border/70 bg-background/70 p-3">
          {turns.map((turn) => {
            const status = turn.status === "running"
              ? copy.working
              : turn.status === "error"
                ? copy.failed
                : copy.rendered;
            return (
              <div key={turn.id} className="space-y-2">
                <div className="ms-auto max-w-[90%] rounded-[8px] border border-border bg-primary/15 px-3 py-2 text-start text-xs leading-5 text-foreground">
                  {turn.prompt}
                </div>
                <div className="rounded-[8px] border border-border/70 bg-card px-3 py-2">
                  <span className="workbench-label inline-flex items-center gap-2 text-primary">
                    <span className={cn("size-2 rounded-full bg-primary", turn.status === "running" && "animate-pulse")} />
                    {status}
                  </span>
                  <p className="mt-2 text-sm font-semibold leading-5">
                    {turn.status === "running" ? copy.labels.pending : turn.error ?? turn.text}
                  </p>
                  {turn.status === "done" && turn.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          data-chat-suggestion
                          onClick={() => onSuggestion(suggestion)}
                          disabled={disabled}
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                        >
                          <MessageSquareText size={12} />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex items-center gap-2 rounded-[8px] border border-border bg-background/80 p-2"
        >
          <MessageSquareText size={16} className="ms-2 text-muted-foreground" />
          <input
            value={input}
            onChange={(event) => onInput(event.target.value)}
            placeholder={copy.placeholder}
            disabled={disabled}
            className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <button type="submit" className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-primary bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40" disabled={disabled || !input.trim()}>
            <ArrowUp size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}

function PlanningCanvas({ prompt, lang }: { prompt: string; lang: Lang }) {
  const steps = lang === "ar"
    ? ["قراءة السؤال", "فحص بيانات ميزان", "تجهيز العرض", "مراجعة المصادر"]
    : ["Reading the question", "Checking Mizan data", "Preparing the view", "Reviewing sources"];

  return (
    <section className="workbench-panel rounded-[8px] bg-card/90 p-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <p className="workbench-label text-primary">{lang === "ar" ? "يبني العرض" : "Building view"}</p>
          <h2 className="mt-2 text-2xl font-black md:text-4xl">{prompt}</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-[6px] border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          {lang === "ar" ? "جار التحضير" : "Preparing"}
        </div>
      </div>
      <div className="grid gap-3 py-5 md:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step} className="workbench-tile rounded-[8px] border border-border/70 bg-background/70 p-4 animate-fade-up" style={{ animationDelay: `${index * 90}ms` }}>
            <div className="flex items-center gap-3">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/10 text-[0.65rem] font-bold text-primary">
                {index + 1}
              </span>
              <p className="text-sm font-semibold">{step}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StartCanvas({
  input,
  lang,
  stats,
  disabled,
  onInput,
  onSubmit,
  onExample,
}: {
  input: string;
  lang: Lang;
  stats: HomeStats | undefined;
  disabled: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onExample: (prompt: string) => void;
}) {
  const copy = COPY[lang];
  const c = copy.labels;
  const isStatsLoading = stats === undefined;
  const contextRows = [
    { label: c.government, metric: "ministries" as const, icon: Building2 },
    { label: c.parliament, metric: "parliament" as const, icon: Users },
    { label: c.budget, metric: "budgetYear" as const, icon: Landmark },
  ];

  return (
    <section className="mx-auto grid max-w-6xl gap-4">
      <div className="workbench-panel rounded-[8px] bg-card/90 p-5 md:p-6">
        <div className="min-w-0">
          <span className="mb-4 inline-flex size-11 items-center justify-center rounded-[8px] border border-primary/35 bg-primary/12 text-primary">
            <Scale size={24} strokeWidth={1.7} />
          </span>
          <p className="workbench-label text-primary">{lang === "ar" ? "واجهة محادثة" : "Chat workspace"}</p>
          <MizanMotionTitle lang={lang} />
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{copy.subtitle}</p>
        </div>

        <div className="mt-6">
          <PromptBox input={input} lang={lang} disabled={disabled} onInput={onInput} onSubmit={onSubmit} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {copy.examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onExample(example)}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-[6px] border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <MessageSquareText size={13} />
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {contextRows.map((row) => {
          const Icon = row.icon;
          const info = metricInfo(row.metric, stats, lang);
          return (
            <div key={row.metric} className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Icon size={15} />
                  {row.label}
                </span>
                <EvidenceLinks source={sourceForMetric(row.metric, stats)} appHref={appHrefForMetric(row.metric)} lang={lang} />
              </div>
              {isStatsLoading ? (
                <Skeleton className="mt-4 h-7 w-36 rounded-[6px]" />
              ) : (
                <p className="mt-4 font-mono text-lg font-bold" dir="ltr">{info.value}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function suggestionsFromSpec(spec: MizanJsonSpec | null): string[] {
  if (!spec) return [];
  return suggestionPromptsForSpec(spec);
}

function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(TURN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const restored: Turn[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.prompt !== "string" || typeof row.createdAt !== "number") continue;
      const status = row.status;
      if (status !== "running" && status !== "done" && status !== "error") continue;
      const specResult = row.spec === null || row.spec === undefined
        ? null
        : mizanJsonSpecSchema.safeParse(row.spec);
      if (specResult && !specResult.success) continue;
      const spec = specResult ? specResult.data : null;
      const rawSuggestions = row.suggestions;
      const suggestions = Array.isArray(rawSuggestions)
        ? rawSuggestions.filter((value): value is string => typeof value === "string").slice(0, 4)
        : suggestionsFromSpec(spec);
      restored.push({
        id: row.id,
        prompt: row.prompt,
        text: typeof row.text === "string" ? row.text : null,
        spec,
        suggestions,
        status,
        error: typeof row.error === "string" ? row.error : undefined,
        createdAt: row.createdAt,
      });
    }

    return restored.map((turn): Turn => (
      turn.status === "running"
        ? { ...turn, status: "error", error: "Interrupted before completion." }
        : turn
    ));
  } catch {
    return [];
  }
}

function buildDataContext(stats: HomeStats | undefined, investmentDefaults: InvestmentDefaults | undefined) {
  return {
    stats,
    investmentDefaults,
    generatedAt: new Date().toISOString(),
  };
}

export default function HomePage() {
  const { lang: appLang } = useLanguage();
  const stats = useQuery(api.government.getHomeStats) as HomeStats | undefined;
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeSpec, setActiveSpec] = useState<MizanJsonSpec | null>(null);
  const activeSpecRef = useRef<MizanJsonSpec | null>(null);
  const interactionLockedRef = useRef(false);
  const lang = appLang;
  const pageDir = lang === "ar" ? "rtl" : "ltr";
  const activeTurn = turns.at(-1) ?? null;
  const isInteractionLocked = turns.some((turn) => turn.status === "running");
  const investmentDefaults = useQuery(api.tools.getInvestmentDefaults, {}) as InvestmentDefaults | undefined;

  useEffect(() => {
    const storedTurns = loadTurns();
    setTurns(storedTurns);
    setActiveSpec(storedTurns.findLast((turn) => turn.spec)?.spec ?? null);
    for (const key of OLD_STORAGE_KEYS) localStorage.removeItem(key);
  }, []);

  useEffect(() => {
    activeSpecRef.current = activeSpec;
  }, [activeSpec]);

  useEffect(() => {
    interactionLockedRef.current = isInteractionLocked;
  }, [isInteractionLocked]);

  useEffect(() => {
    const durableTurns = turns.filter((turn) => turn.status !== "running").slice(-12);
    localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify(durableTurns));
  }, [turns]);

  const submit = useCallback((raw: string) => {
    if (interactionLockedRef.current) return;
    const prompt = raw.trim();
    if (!prompt) return;

    interactionLockedRef.current = true;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextTurn: Turn = {
      id,
      prompt,
      text: null,
      spec: null,
      suggestions: [],
      status: "running",
      createdAt: Date.now(),
    };
    const history: ChatHistoryItem[] = turns.slice(-6).flatMap((turn): ChatHistoryItem[] => {
      const assistant = turn.text
        ? [{ role: "assistant" as const, content: turn.text }]
        : [];
      return [
        { role: "user" as const, content: turn.prompt },
        ...assistant,
      ];
    });

    setTurns((existing) => [...existing, nextTurn].slice(-12));
    setInput("");

    void fetch("/api/generative-ui/harness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        lang,
        history,
        currentSpec: activeSpecRef.current,
        dataContext: buildDataContext(stats, investmentDefaults),
      }),
    })
      .then(async (response) => {
        const payload = await response.json() as HarnessResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "The UI harness failed.");
        }

        const specResult = mizanJsonSpecSchema.safeParse(payload.spec);
        const spec = specResult.success ? specResult.data : makeFallbackSpec(lang);
        const suggestions = suggestionsFromSpec(spec);
        setActiveSpec(spec);
        setTurns((existing) => existing.map((turn) => (
          turn.id === id
            ? {
                ...turn,
                text: payload.text ?? (lang === "ar" ? "تم تجهيز العرض." : "The view is ready."),
                spec,
                suggestions,
                status: "done",
                error: undefined,
              }
            : turn
        )));
      })
      .catch(() => {
        const spec = makePromptFallbackSpec(lang, prompt);
        const suggestions = suggestionsFromSpec(spec);
        setActiveSpec(spec);
        setTurns((existing) => existing.map((turn) => (
          turn.id === id
            ? {
                ...turn,
                text: lang === "ar" ? "تم تجهيز عرض بديل." : "A fallback view is ready.",
                spec,
                suggestions,
                status: "done",
                error: undefined,
              }
            : turn
        )));
      });
  }, [investmentDefaults, lang, stats, turns]);

  const reset = useCallback(() => {
    setTurns([]);
    setActiveSpec(null);
    activeSpecRef.current = null;
    setInput("");
    localStorage.removeItem(TURN_STORAGE_KEY);
    for (const key of OLD_STORAGE_KEYS) localStorage.removeItem(key);
    interactionLockedRef.current = false;
  }, []);

  return (
    <div className="mizan-workbench page-content min-h-screen" dir={pageDir}>
      <section className="container-page pb-8 pt-8">
        <div className="mx-auto mb-5 max-w-7xl">
          <NewsTicker />
        </div>
        <div className={cn("mx-auto grid max-w-7xl gap-6", activeTurn ? "lg:grid-cols-[340px_minmax(0,1fr)]" : "grid-cols-1")}>
          {activeTurn && (
            <ChatRail
              turns={turns}
              input={input}
              lang={lang}
              disabled={isInteractionLocked}
              onInput={setInput}
              onSubmit={() => submit(input)}
              onSuggestion={submit}
              onReset={reset}
            />
          )}

          <main className="min-w-0">
            {activeTurn && (
              <div className="mb-5 text-start">
                <h1 className="text-3xl font-black leading-tight">{COPY[lang].title}</h1>
                <p className="mt-3 text-sm text-muted-foreground">{COPY[lang].subtitle}</p>
              </div>
            )}

            {activeSpec ? (
              <MizanRenderer
                spec={activeSpec}
                lang={lang}
                stats={stats}
                investmentDefaults={investmentDefaults}
                disabled={isInteractionLocked}
                onSuggestion={submit}
              />
            ) : activeTurn ? (
              <PlanningCanvas prompt={activeTurn.prompt} lang={lang} />
            ) : (
              <StartCanvas
                input={input}
                lang={lang}
                stats={stats}
                disabled={isInteractionLocked}
                onInput={setInput}
                onSubmit={() => submit(input)}
                onExample={submit}
              />
            )}
          </main>
        </div>
      </section>
      <AiPipelineStatus />
    </div>
  );
}
