import {
  createLibrary,
  defineComponent,
  useIsQueryLoading,
  useTriggerAction,
} from "@openuidev/react-lang";
import {
  Calculator,
  ExternalLink,
  MessageSquareText,
  RefreshCcw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { SanadBadge } from "@/components/sanad-badge";
import { Skeleton } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card as UiCard,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtEGP } from "@/lib/format";

type Primitive = string | number | boolean | null;
type DataRow = Record<string, Primitive>;

const toneSchema = z.enum(["default", "primary", "warning", "positive", "danger"]);
const confidenceSchema = z.enum(["official", "secondary", "estimated", "unverified"]);
const childrenSchema = z.array(z.unknown()).default([]);
const dataRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
const tabRowSchema = z.object({
  label: z.string(),
  title: z.string().default(""),
  body: z.string().default(""),
});

function nodeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function renderNodes(children: unknown, renderNode: (value: unknown) => ReactNode): ReactNode {
  return nodeList(children).map((child, index) => (
    <Fragment key={index}>{renderNode(child)}</Fragment>
  ));
}

function isDataRow(value: unknown): value is DataRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dataRows(value: unknown): DataRow[] {
  return Array.isArray(value) ? value.filter(isDataRow) : [];
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentValue(value: unknown): number {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace("%", "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatYears(value: number, isArabic: boolean): string {
  if (isArabic) return `${value.toLocaleString("ar-EG")} ${value === 1 ? "سنة" : "سنوات"}`;
  return `${value} ${value === 1 ? "year" : "years"}`;
}

type ScenarioOption = {
  id: string;
  label: string;
  returnRate: number;
  missingInputs: string;
  source: string;
};

function scenarioOptions(rows: DataRow[]): ScenarioOption[] {
  return rows
    .map((row, index) => {
      const label = stringValue(row.strategy, stringValue(row.label, `Scenario ${index + 1}`));
      return {
        id: stringValue(row.strategyId, label.toLowerCase().replace(/[^a-z0-9]+/g, "-")) || `scenario-${index}`,
        label,
        returnRate: percentValue(row.weightedReturnRaw ?? row.weightedReturn ?? row.return),
        missingInputs: stringValue(row.missingInputs),
        source: stringValue(row.source),
      };
    })
    .filter((row) => row.label.trim().length > 0);
}

function computeScenario(option: ScenarioOption, capital: number, horizon: number, inflationRate: number) {
  const nominal = capital * Math.pow(1 + option.returnRate / 100, horizon);
  const real = inflationRate > 0 ? nominal / Math.pow(1 + inflationRate / 100, horizon) : nominal;
  const gain = nominal - capital;
  return { ...option, nominal, real, gain };
}

function chartColor(index: number): string {
  const colorIndex = (index % 5) + 1;
  return `var(--chart-${colorIndex})`;
}

function visibleColumn(column: string): boolean {
  return !["id", "sourceId", "sourceUrl", "rawValue", "confidence"].includes(column);
}

function columnLabel(column: string, isArabic: boolean): string {
  const labels: Record<string, { en: string; ar: string }> = {
    metric: { en: "Metric", ar: "المؤشر" },
    line: { en: "Line", ar: "البند" },
    value: { en: "Value", ar: "القيمة" },
    source: { en: "Source", ar: "المصدر" },
    body: { en: "Body", ar: "الجهة" },
    count: { en: "Count", ar: "العدد" },
    indicator: { en: "Indicator", ar: "المؤشر" },
    unit: { en: "Unit", ar: "الوحدة" },
    date: { en: "Date", ar: "التاريخ" },
    strategy: { en: "Strategy", ar: "السيناريو" },
    weightedReturn: { en: "Return", ar: "العائد" },
    nominalValue: { en: "Nominal value", ar: "القيمة الاسمية" },
    realValue: { en: "Real value", ar: "القيمة الحقيقية" },
    missingInputs: { en: "Missing inputs", ar: "مدخلات ناقصة" },
  };
  const label = labels[column];
  if (label) return isArabic ? label.ar : label.en;
  return column
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function confidenceTone(confidence: z.infer<typeof confidenceSchema>): string {
  if (confidence === "official") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (confidence === "secondary") return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (confidence === "estimated") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-muted-foreground/30 bg-muted text-muted-foreground";
}

function toneClass(tone: z.infer<typeof toneSchema>): string {
  if (tone === "primary") return "border-primary/50 bg-primary/10 text-primary";
  if (tone === "warning") return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (tone === "positive") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (tone === "danger") return "border-destructive/50 bg-destructive/10 text-destructive";
  return "border-border/70 bg-card/85 text-foreground";
}

function SourceAnchor({
  label,
  url,
  confidence,
  sanadLevel,
}: {
  label: string;
  url?: string;
  confidence?: z.infer<typeof confidenceSchema>;
  sanadLevel?: number;
}) {
  if (!url) {
    return (
      <span className="inline-flex min-h-8 items-center rounded-[6px] border border-border/60 bg-background/70 px-2 text-[0.68rem] font-semibold text-muted-foreground">
        {label}
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/70 px-2 text-[0.68rem] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary"
          >
            {typeof sanadLevel === "number" ? (
              <SanadBadge sanadLevel={sanadLevel} showLabel={false} focusable={false} />
            ) : confidence ? (
              <span className={cn("h-2 w-2 rounded-full border", confidenceTone(confidence))} aria-hidden="true" />
            ) : null}
            <span className="max-w-32 truncate">{label || hostFromUrl(url)}</span>
            <ExternalLink size={11} />
          </a>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          <span dir="ltr">{hostFromUrl(url)}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const Workspace = defineComponent({
  name: "Workspace",
  description: "Root generative workspace. Put all generated sections inside children.",
  props: z.object({
    children: childrenSchema,
    title: z.string().default("Mizan"),
    summary: z.string().default("Sourced Mizan data."),
    lang: z.enum(["en", "ar"]).default("en"),
  }),
  component: ({ props, renderNode }) => (
    <section className="workbench-panel min-w-0 overflow-hidden rounded-[8px] bg-card/90 p-4 animate-fade-up md:p-5" dir={props.lang === "ar" ? "rtl" : "ltr"}>
      <div className="border-b border-border/80 pb-5">
        <span className="workbench-label rounded-[6px] border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
          {props.lang === "ar" ? "ميزان" : "Mizan"}
        </span>
        <h2 className="mt-5 max-w-5xl text-2xl font-black leading-tight text-balance md:text-4xl">
          {stringValue(props.title, "Mizan")}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground md:text-base">
          {stringValue(props.summary)}
        </p>
      </div>
      <div className="grid gap-4 py-5">{renderNodes(props.children, renderNode)}</div>
    </section>
  ),
});

const Section = defineComponent({
  name: "Section",
  description: "Unframed section with a title, short summary, and child content.",
  props: z.object({
    title: z.string(),
    summary: z.string().default(""),
    children: childrenSchema,
    tone: toneSchema.default("default"),
  }),
  component: ({ props, renderNode }) => (
    <section className={cn("min-w-0 rounded-[8px] border p-4 animate-fade-up", toneClass(props.tone))}>
      <div className="mb-4">
        <h3 className="text-base font-black leading-tight md:text-xl">{stringValue(props.title)}</h3>
        {stringValue(props.summary) && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{stringValue(props.summary)}</p>}
      </div>
      <div className="grid gap-3">{renderNodes(props.children, renderNode)}</div>
    </section>
  ),
});

const Grid = defineComponent({
  name: "Grid",
  description: "Responsive grid for metrics, cards, charts, and data blocks.",
  props: z.object({
    children: childrenSchema,
    columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  component: ({ props, renderNode }) => (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        props.columns === 1 && "grid-cols-1",
        props.columns === 2 && "md:grid-cols-2",
        props.columns === 3 && "md:grid-cols-2 xl:grid-cols-3",
        props.columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {renderNodes(props.children, renderNode)}
    </div>
  ),
});

const Card = defineComponent({
  name: "Card",
  description: "Sourced shadcn-style card. Use for focused narrative or grouped controls.",
  props: z.object({
    title: z.string(),
    summary: z.string().default(""),
    children: childrenSchema,
    tone: toneSchema.default("default"),
  }),
  component: ({ props, renderNode }) => (
    <div className={cn("min-w-0 rounded-[8px] border p-4 animate-fade-up", toneClass(props.tone))}>
      <p className="text-sm font-bold">{props.title}</p>
      {props.summary && <p className="mt-2 text-xs leading-5 text-muted-foreground">{props.summary}</p>}
      {nodeList(props.children).length > 0 && <div className="mt-4 grid gap-3">{renderNodes(props.children, renderNode)}</div>}
    </div>
  ),
});

const Metric = defineComponent({
  name: "Metric",
  description: "One sourced metric. Prefer values from Query results, not hardcoded literals.",
  props: z.object({
    label: z.string(),
    value: z.string(),
    detail: z.string().default(""),
    sourceLabel: z.string().default("Source"),
    sourceUrl: z.string().default(""),
    confidence: confidenceSchema.default("secondary"),
  }),
  component: ({ props }) => (
    <div className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">{props.label}</p>
        <SourceAnchor label={props.sourceLabel} url={props.sourceUrl} confidence={props.confidence} />
      </div>
      <p className="mizan-text-safe mt-5 font-mono text-2xl font-black leading-tight text-primary" dir="ltr">
        {props.value}
      </p>
      {props.detail && <p className="mt-3 text-xs leading-5 text-muted-foreground">{props.detail}</p>}
    </div>
  ),
});

const TextBlock = defineComponent({
  name: "TextBlock",
  description: "Short prose block. Keep text concise and use data blocks for facts.",
  props: z.object({
    title: z.string().default(""),
    body: z.string(),
    tone: toneSchema.default("default"),
  }),
  component: ({ props }) => (
    <div className={cn("min-w-0 rounded-[8px] border p-4 text-sm leading-6 animate-fade-up", toneClass(props.tone))}>
      {props.title && <p className="mb-2 font-bold">{props.title}</p>}
      <p className="text-muted-foreground">{props.body}</p>
    </div>
  ),
});

const DataTable = defineComponent({
  name: "DataTable",
  description: "Compact table for sourced rows. Pass rows from Query results.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    emptyText: z.string().default("No rows available."),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows);
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row).filter(visibleColumn)))].slice(0, 6);
    const isArabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
    return (
      <div className="min-w-0 overflow-hidden rounded-[8px] border border-border/70 bg-card/85 animate-fade-up">
        <div className="border-b border-border/70 px-4 py-3">
          <p className="text-sm font-bold">{props.title}</p>
        </div>
        {rows.length === 0 || columns.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <Table className="min-w-[34rem]">
            <TableHeader className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <TableRow>
                {columns.map((column) => <TableHead key={column} className="px-4 py-3 text-start font-bold">{columnLabel(column, isArabic)}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 12).map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column) => (
                    <TableCell key={column} className="max-w-72 px-4 py-3 align-top text-xs leading-5 text-muted-foreground">
                      <span className="line-clamp-3">{stringValue(row[column], "-")}</span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    );
  },
});

const BarChart = defineComponent({
  name: "BarChart",
  description: "Clean shadcn/Recharts horizontal bar chart. Use numeric series from Query results whenever a visual comparison is available.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    labelKey: z.string().default("label"),
    valueKey: z.string().default("value"),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows)
      .map((row, index) => {
        const value = numberValue(row[props.valueKey]);
        if (value === null) return null;
        return {
          label: stringValue(row[props.labelKey], `Row ${index + 1}`),
          value,
          displayValue: stringValue(row.displayValue, value.toLocaleString()),
        };
      })
      .filter((row): row is { label: string; value: number; displayValue: string } => row !== null)
      .slice(0, 8);

    if (rows.length === 0) return null;

    const config = {
      value: {
        label: props.title,
        color: "var(--chart-1)",
      },
    } satisfies ChartConfig;

    return (
      <div className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-bold">{props.title}</p>
          <Badge variant="outline" className="rounded-[6px]">{rows.length}</Badge>
        </div>
        <div className="mt-4">
          <ChartContainer config={config} className="h-64 w-full">
            <RechartsBarChart
              accessibilityLayer
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                dataKey="label"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={120}
                className="text-xs"
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)" }}
                content={<ChartTooltipContent hideLabel indicator="line" />}
              />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
            </RechartsBarChart>
          </ChartContainer>
        </div>
        <div className="mt-3 grid gap-1">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
              <span className="font-mono font-bold" dir="ltr">{row.displayValue}</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

type ScenarioToolProps = {
  title?: string | null;
  summary?: string | null;
  rows?: DataRow[] | null;
  series?: DataRow[] | null;
  sources?: DataRow[] | null;
  insights?: DataRow[] | null;
  capitalEgp?: number | null;
  minCapitalEgp?: number | null;
  maxCapitalEgp?: number | null;
  capitalStep?: number | null;
  horizonYears?: number | null;
  minHorizonYears?: number | null;
  maxHorizonYears?: number | null;
};

function ScenarioToolComponent({ props }: { props: ScenarioToolProps }) {
  const isArabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const rows = useMemo(() => dataRows(props.rows), [props.rows]);
  const sources = useMemo(() => dataRows(props.sources), [props.sources]);
  const insights = useMemo(() => dataRows(props.insights), [props.insights]);
  const minCapital = Math.max(1_000, props.minCapitalEgp ?? 10_000);
  const maxCapital = Math.max(minCapital, props.maxCapitalEgp ?? 5_000_000);
  const minHorizon = Math.max(1, props.minHorizonYears ?? 1);
  const maxHorizon = Math.max(minHorizon, props.maxHorizonYears ?? 30);
  const initialCapital = clampNumber(props.capitalEgp ?? 100_000, minCapital, maxCapital);
  const initialHorizon = clampNumber(Math.round(props.horizonYears ?? 5), minHorizon, maxHorizon);
  const inflationRate = percentValue(rows.find((row) => row.inflationRate != null)?.inflationRate);
  const options = useMemo(() => scenarioOptions(rows), [rows]);
  const [capital, setCapital] = useState(initialCapital);
  const [capitalInput, setCapitalInput] = useState(String(initialCapital));
  const [horizon, setHorizon] = useState(initialHorizon);
  const [focus, setFocus] = useState("all");

  useEffect(() => {
    setCapital(initialCapital);
    setCapitalInput(String(initialCapital));
    setHorizon(initialHorizon);
    setFocus("all");
  }, [initialCapital, initialHorizon]);

  const computed = options.map((option) => computeScenario(option, capital, horizon, inflationRate));
  const visible = focus === "all" ? computed : computed.filter((option) => option.id === focus);
  const maxNominal = Math.max(...computed.map((option) => option.nominal), 1);
  const projectionOptions = visible.slice(0, 5);
  const projectionRows: Array<Record<string, number>> = Array.from({ length: horizon + 1 }, (_, year) => {
    const point: Record<string, number> = { year };
    for (const option of projectionOptions) {
      point[option.id] = capital * Math.pow(1 + option.returnRate / 100, year);
    }
    return point;
  });
  const projectionConfig = projectionOptions.reduce<ChartConfig>((config, option, index) => ({
    ...config,
    [option.id]: {
      label: option.label,
      color: chartColor(index),
    },
  }), {});
  const best = computed.reduce<typeof computed[number] | null>((current, option) => (
    current === null || option.real > current.real ? option : current
  ), null);
  const reset = () => {
    setCapital(initialCapital);
    setCapitalInput(String(initialCapital));
    setHorizon(initialHorizon);
    setFocus("all");
  };
  const labels = isArabic
    ? {
        capital: "رأس المال",
        horizon: "المدة",
        focus: "السيناريو",
        all: "الكل",
        reset: "إعادة",
        results: "النتائج",
        assumptions: "الفرضيات",
        sources: "المصادر",
        nominal: "القيمة الاسمية",
        real: "بعد التضخم",
        returnRate: "العائد",
        missing: "مدخلات ناقصة",
        noRows: "لا توجد سيناريوهات متاحة.",
        best: "أفضل قيمة حقيقية",
        noSources: "لا توجد مصادر متاحة بعد.",
        inflation: "التضخم",
        tune: "اضبط الفرضيات",
        projection: "مسار القيمة",
      }
    : {
        capital: "Capital",
        horizon: "Horizon",
        focus: "Scenario",
        all: "All scenarios",
        reset: "Reset",
        results: "Results",
        assumptions: "Assumptions",
        sources: "Sources",
        nominal: "Nominal value",
        real: "Inflation-adjusted",
        returnRate: "Return",
        missing: "Missing inputs",
        noRows: "No scenarios available.",
        best: "Best real value",
        noSources: "No source rows available yet.",
        inflation: "Inflation",
        tune: "Tune assumptions",
        projection: "Value path",
      };

  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-primary/35 bg-card/90 animate-fade-up">
      <div className="border-b border-border/70 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="outline" className="rounded-[6px] border-primary/40 text-primary">
              <Calculator size={12} />
              {isArabic ? "أداة سيناريو" : "Scenario tool"}
            </Badge>
            <h3 className="mt-4 text-xl font-black leading-tight md:text-2xl">{stringValue(props.title, "Investment scenario")}</h3>
            {props.summary ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{props.summary}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RefreshCcw size={14} />
            {labels.reset}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.6fr)] md:p-5">
        <div className="grid content-start gap-4 rounded-[8px] border border-border/70 bg-background/55 p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <SlidersHorizontal size={16} className="text-primary" />
            {labels.tune}
          </div>
          <Separator />
          <label className="grid gap-2">
            <span className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              {labels.capital}
              <span className="font-mono text-foreground" dir="ltr">{fmtEGP(capital, { compact: true, decimals: 1 })}</span>
            </span>
            <Slider
              value={[capital]}
              min={minCapital}
              max={maxCapital}
              step={props.capitalStep ?? 10_000}
              onValueChange={(value) => {
                const next = value[0] ?? capital;
                setCapital(next);
                setCapitalInput(String(next));
              }}
            />
            <Input
              value={capitalInput}
              inputMode="numeric"
              onChange={(event) => {
                const nextValue = event.target.value.replace(/[^\d]/g, "");
                setCapitalInput(nextValue);
                const parsed = Number(nextValue);
                if (Number.isFinite(parsed) && parsed > 0) {
                  setCapital(clampNumber(parsed, minCapital, maxCapital));
                }
              }}
              onBlur={() => setCapitalInput(String(capital))}
              className="h-9 bg-background/80 font-mono"
            />
          </label>

          <label className="grid gap-2">
            <span className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              {labels.horizon}
              <span className="font-mono text-foreground">{formatYears(horizon, isArabic)}</span>
            </span>
            <Slider
              value={[horizon]}
              min={minHorizon}
              max={maxHorizon}
              step={1}
              onValueChange={(value) => setHorizon(value[0] ?? horizon)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{labels.focus}</span>
            <Select value={focus} onValueChange={setFocus}>
              <SelectTrigger className="w-full bg-background/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.all}</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {best ? (
            <div className="rounded-[8px] border border-emerald-500/35 bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{labels.best}</p>
              <p className="mt-1 font-mono text-lg font-black text-foreground" dir="ltr">{fmtEGP(best.real, { compact: true, decimals: 1 })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{best.label}</p>
            </div>
          ) : null}
        </div>

        <Tabs defaultValue="results" className="min-w-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="results">{labels.results}</TabsTrigger>
            <TabsTrigger value="assumptions">{labels.assumptions}</TabsTrigger>
            <TabsTrigger value="sources">{labels.sources}</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="mt-4">
            <div className="grid gap-3">
              {projectionOptions.length > 0 ? (
                <div className="rounded-[8px] border border-border/70 bg-background/55 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">{labels.projection}</p>
                    <Badge variant="outline" className="rounded-[6px]">
                      {formatYears(horizon, isArabic)}
                    </Badge>
                  </div>
                  <ChartContainer config={projectionConfig} className="mt-4 h-64 w-full">
                    <RechartsLineChart
                      accessibilityLayer
                      data={projectionRows}
                      margin={{ top: 8, right: 12, bottom: 0, left: 12 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="year"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => `${value}`}
                      />
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <ChartTooltip
                        cursor={{ stroke: "var(--border)" }}
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      {projectionOptions.map((option, index) => (
                        <Line
                          key={option.id}
                          type="monotone"
                          dataKey={option.id}
                          stroke={`var(--color-${option.id})`}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={index < 3}
                        />
                      ))}
                    </RechartsLineChart>
                  </ChartContainer>
                </div>
              ) : null}
              {visible.length === 0 ? (
                <div className="rounded-[8px] border border-border/70 p-4 text-sm text-muted-foreground">{labels.noRows}</div>
              ) : visible.map((option) => (
                <div key={option.id} className="rounded-[8px] border border-border/70 bg-background/55 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{labels.returnRate}: {option.returnRate.toFixed(1)}%</p>
                    </div>
                    <Badge variant="outline" className="rounded-[6px]">
                      <TrendingUp size={12} />
                      {fmtEGP(option.gain, { compact: true, decimals: 1 })}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{labels.nominal}</p>
                      <p className="mt-1 font-mono text-xl font-black text-primary" dir="ltr">{fmtEGP(option.nominal, { compact: true, decimals: 1 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{labels.real}</p>
                      <p className="mt-1 font-mono text-xl font-black text-foreground" dir="ltr">{fmtEGP(option.real, { compact: true, decimals: 1 })}</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-[4px] bg-muted">
                    <div
                      className="h-full rounded-[4px] bg-primary transition-transform duration-500"
                      style={{ transform: `scaleX(${Math.max(0.04, option.nominal / maxNominal)})`, transformOrigin: "left center" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="assumptions" className="mt-4">
            <div className="grid gap-3 rounded-[8px] border border-border/70 bg-background/55 p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Badge variant="outline" className="justify-start rounded-[6px]">{labels.capital}: {fmtEGP(capital, { compact: true, decimals: 1 })}</Badge>
                <Badge variant="outline" className="justify-start rounded-[6px]">{labels.horizon}: {formatYears(horizon, isArabic)}</Badge>
                <Badge variant="outline" className="justify-start rounded-[6px]">{labels.inflation}: {inflationRate.toFixed(1)}%</Badge>
              </div>
              <Separator />
              {computed.map((option) => (
                <div key={option.id} className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                  <span className="font-semibold">{option.label}</span>
                  <span className="font-mono text-muted-foreground">{option.returnRate.toFixed(1)}%</span>
                  {option.missingInputs ? <span className="text-xs text-muted-foreground sm:col-span-2">{labels.missing}: {option.missingInputs}</span> : null}
                </div>
              ))}
              {insights.slice(0, 2).map((insight, index) => (
                <div key={index} className="rounded-[6px] border border-amber-500/35 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  <span className="font-bold">{stringValue(insight.label)}</span>
                  {stringValue(insight.detail) ? <span className="block text-muted-foreground">{stringValue(insight.detail)}</span> : null}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <div className="grid gap-2 rounded-[8px] border border-border/70 bg-background/55 p-4">
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">{labels.noSources}</p>
              ) : sources.slice(0, 8).map((source, index) => {
                const url = stringValue(source.url);
                const label = stringValue(source.label, hostFromUrl(url));
                const sanadLevel = numberValue(source.sanadLevel);
                return (
                  <div key={`${label}-${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border/60 bg-card/70 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{label}</span>
                      <span className="block truncate text-[0.68rem] text-muted-foreground" dir="ltr">{stringValue(source.publisher, hostFromUrl(url))}</span>
                    </span>
                    <SourceAnchor label={label} url={url} sanadLevel={sanadLevel ?? undefined} />
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

const ScenarioTool = defineComponent({
  name: "ScenarioTool",
  description: "Interactive shadcn-backed investment scenario tool with sliders, projection chart, strategy focus, comparison results, assumptions, and sources. Use this for capital, horizon, simulation, testing scenarios, and investment what-if prompts.",
  props: z.object({
    title: z.string(),
    summary: z.string().default(""),
    rows: z.array(dataRowSchema).default([]),
    series: z.array(dataRowSchema).default([]),
    sources: z.array(dataRowSchema).default([]),
    insights: z.array(dataRowSchema).default([]),
    capitalEgp: z.number().default(100000),
    minCapitalEgp: z.number().default(10000),
    maxCapitalEgp: z.number().default(5000000),
    capitalStep: z.number().default(10000),
    horizonYears: z.number().default(5),
    minHorizonYears: z.number().default(1),
    maxHorizonYears: z.number().default(30),
  }),
  component: ScenarioToolComponent,
});

const AssumptionPanel = defineComponent({
  name: "AssumptionPanel",
  description: "shadcn-style assumption summary. Use for model inputs, caveats, rates, and confidence notes returned by tools.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    tone: toneSchema.default("default"),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows);
    return (
      <div className={cn("min-w-0 rounded-[8px] border p-4 animate-fade-up", toneClass(props.tone))}>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} />
          <p className="text-sm font-bold">{props.title}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {rows.length === 0 ? <Skeleton className="h-10 w-full rounded-[6px]" /> : rows.slice(0, 10).map((row, index) => (
            <Badge key={index} variant="outline" className="rounded-[6px] px-2 py-1">
              {stringValue(row.label, stringValue(row.metric, `#${index + 1}`))}
              {row.value != null ? <span className="font-mono">{stringValue(row.value)}</span> : null}
            </Badge>
          ))}
        </div>
      </div>
    );
  },
});

const ComparisonMatrix = defineComponent({
  name: "ComparisonMatrix",
  description: "Dense shadcn-style comparison matrix. Use for comparing strategies, institutions, budget lines, or source quality.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    labelKey: z.string().default("label"),
    valueKey: z.string().default("value"),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows).slice(0, 8);
    return (
      <div className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
        <p className="text-sm font-bold">{props.title}</p>
        <div className="mt-4 grid gap-2">
          {rows.length === 0 ? <Skeleton className="h-20 rounded-[6px]" /> : rows.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-[6px] border border-border/60 bg-background/60 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <span className="min-w-0 text-sm font-semibold">{stringValue(row[props.labelKey], stringValue(row.strategy, `Row ${index + 1}`))}</span>
              <Badge variant="outline" className="rounded-[6px] font-mono">{stringValue(row[props.valueKey], stringValue(row.value, "-"))}</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

const NarrativeTabs = defineComponent({
  name: "NarrativeTabs",
  description: "shadcn tabs for short alternate readings, views, or methodological notes. Use for Overview / Assumptions / Sources style switches.",
  props: z.object({
    tabs: z.array(tabRowSchema).default([]),
    defaultValue: z.string().default(""),
  }),
  component: ({ props }) => {
    const tabs = props.tabs.filter((tab) => tab.label.trim().length > 0).slice(0, 5);
    const defaultValue = props.defaultValue || tabs[0]?.label || "tab";
    if (tabs.length === 0) return null;
    return (
      <Tabs defaultValue={defaultValue} className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
        <TabsList className="mb-4 flex w-full flex-wrap justify-start">
          {tabs.map((tab) => <TabsTrigger key={tab.label} value={tab.label}>{tab.label}</TabsTrigger>)}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.label} value={tab.label} className="text-sm leading-6">
            {tab.title ? <p className="font-bold">{tab.title}</p> : null}
            {tab.body ? <p className="mt-2 text-muted-foreground">{tab.body}</p> : null}
          </TabsContent>
        ))}
      </Tabs>
    );
  },
});

const EvidencePanel = defineComponent({
  name: "EvidencePanel",
  description: "shadcn card and scroll-area evidence panel. Use for source-backed rows, caveats, methodology notes, and compact evidence trails.",
  props: z.object({
    title: z.string(),
    summary: z.string().default(""),
    rows: z.array(dataRowSchema).default([]),
    sources: z.array(dataRowSchema).default([]),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows).slice(0, 12);
    const sources = dataRows(props.sources);
    return (
      <UiCard className="min-w-0 gap-0 overflow-hidden rounded-[8px] border-border/70 bg-card/85 py-0 shadow-none animate-fade-up">
        <CardHeader className="border-b border-border/70 px-4 py-4">
          <CardTitle className="text-base font-black">{props.title}</CardTitle>
          {props.summary ? <CardDescription className="max-w-3xl leading-6">{props.summary}</CardDescription> : null}
          <CardAction>
            <Badge variant="outline" className="rounded-[6px]">{rows.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-80">
            <div className="grid gap-2 p-4">
              {rows.length === 0 ? <Skeleton className="h-24 rounded-[6px]" /> : rows.map((row, index) => {
                const label = stringValue(row.label, stringValue(row.metric, stringValue(row.line, `Evidence ${index + 1}`)));
                const detail = stringValue(row.detail, stringValue(row.summary, stringValue(row.value)));
                const sourceLabel = stringValue(row.source, stringValue(row.sourceLabel));
                const source = sources.find((item) => stringValue(item.label) === sourceLabel || stringValue(item.id) === stringValue(row.sourceId));
                return (
                  <div key={`${label}-${index}`} className="grid gap-2 rounded-[6px] border border-border/60 bg-background/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-bold">{label}</p>
                      {row.confidence ? <Badge variant="outline" className="rounded-[6px]">{stringValue(row.confidence)}</Badge> : null}
                    </div>
                    {detail ? <p className="text-xs leading-5 text-muted-foreground">{detail}</p> : null}
                    {source ? (
                      <div>
                        <SourceAnchor
                          label={stringValue(source.label, sourceLabel)}
                          url={stringValue(source.url)}
                          sanadLevel={numberValue(source.sanadLevel) ?? undefined}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </UiCard>
    );
  },
});

const Timeline = defineComponent({
  name: "Timeline",
  description: "shadcn marker-based timeline. Use for dated updates, process steps, audit trail events, or ordered evidence.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
  }),
  component: ({ props }) => {
    const rows = dataRows(props.rows).slice(0, 10);
    return (
      <div className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
        <p className="text-sm font-bold">{props.title}</p>
        <div className="mt-4 grid gap-3">
          {rows.length === 0 ? <Skeleton className="h-24 rounded-[6px]" /> : rows.map((row, index) => {
            const label = stringValue(row.label, stringValue(row.event, stringValue(row.metric, `Step ${index + 1}`)));
            const detail = stringValue(row.detail, stringValue(row.summary, stringValue(row.value)));
            const date = stringValue(row.date, stringValue(row.eventDate));
            return (
              <Marker key={`${label}-${index}`} variant="default" className="items-start rounded-[6px] border border-border/60 bg-background/60 px-3 py-2">
                <MarkerIcon className="mt-0.5 text-primary">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[0.65rem] font-black">
                    {index + 1}
                  </span>
                </MarkerIcon>
                <MarkerContent>
                  <span className="block text-sm font-bold text-foreground">{label}</span>
                  {date ? <span className="mt-0.5 block font-mono text-[0.68rem] text-muted-foreground">{date}</span> : null}
                  {detail ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span> : null}
                </MarkerContent>
              </Marker>
            );
          })}
        </div>
      </div>
    );
  },
});

function SourceQualityPanelComponent({ props }: { props: { title?: string | null; sources?: DataRow[] | null } }) {
  const [filter, setFilter] = useState<"all" | "official" | "review">("all");
  const isArabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const labels = isArabic
    ? {
        title: "جودة المصادر",
        description: "صف مصادر هذا العرض.",
        all: "الكل",
        official: "رسمية",
        review: "تحتاج مراجعة",
        empty: "لا توجد مصادر في هذا المرشح.",
      }
    : {
        title: "Source quality",
        description: "Filter the sources for this view.",
        all: "All",
        official: "Official",
        review: "Review",
        empty: "No sources in this filter.",
      };
  const sources = dataRows(props.sources);
  const visible = sources.filter((source) => {
    if (filter === "all") return true;
    const confidence = stringValue(source.confidence);
    if (filter === "official") return confidence === "official";
    return confidence !== "official";
  });
  const officialCount = sources.filter((source) => stringValue(source.confidence) === "official").length;
  const reviewCount = Math.max(0, sources.length - officialCount);
  return (
    <UiCard className="min-w-0 gap-0 overflow-hidden rounded-[8px] border-border/70 bg-card/85 py-0 shadow-none animate-fade-up">
      <CardHeader className="border-b border-border/70 px-4 py-4">
        <CardTitle className="text-base font-black">{stringValue(props.title, labels.title)}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-2">
          <Toggle pressed={filter === "all"} variant="outline" size="sm" onPressedChange={() => setFilter("all")}>
            {labels.all} <span className="font-mono">{sources.length}</span>
          </Toggle>
          <Toggle pressed={filter === "official"} variant="outline" size="sm" onPressedChange={() => setFilter("official")}>
            {labels.official} <span className="font-mono">{officialCount}</span>
          </Toggle>
          <Toggle pressed={filter === "review"} variant="outline" size="sm" onPressedChange={() => setFilter("review")}>
            {labels.review} <span className="font-mono">{reviewCount}</span>
          </Toggle>
        </div>
        <div className="mt-4 grid gap-2">
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : visible.slice(0, 8).map((source, index) => {
            const url = stringValue(source.url);
            const label = stringValue(source.label, hostFromUrl(url));
            const confidence = confidenceSchema.safeParse(source.confidence).success
              ? source.confidence as z.infer<typeof confidenceSchema>
              : "secondary";
            return (
              <div key={`${label}-${index}`} className="grid gap-2 rounded-[6px] border border-border/60 bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{label}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">{stringValue(source.publisher, hostFromUrl(url))}</p>
                </div>
                <SourceAnchor
                  label={label}
                  url={url}
                  confidence={confidence}
                  sanadLevel={numberValue(source.sanadLevel) ?? undefined}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </UiCard>
  );
}

const SourceQualityPanel = defineComponent({
  name: "SourceQualityPanel",
  description: "Interactive shadcn toggle panel for filtering source quality. Use when the user asks if sources are reliable, official, or need review.",
  props: z.object({
    title: z.string().default("Source quality"),
    sources: z.array(dataRowSchema).default([]),
  }),
  component: SourceQualityPanelComponent,
});

const SourceList = defineComponent({
  name: "SourceList",
  description: "Source and provenance list. Use source rows returned by Mizan tools.",
  props: z.object({
    title: z.string(),
    sources: z.array(dataRowSchema).default([]),
  }),
  component: ({ props }) => {
    const sources = dataRows(props.sources);
    return (
      <div className="min-w-0 rounded-[8px] border border-border/70 bg-card/85 p-4 animate-fade-up">
        <p className="text-sm font-bold">{props.title}</p>
        <div className="mt-4 grid gap-2">
          {sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">No source rows available yet.</p>
          ) : sources.slice(0, 10).map((source, index) => {
            const url = stringValue(source.url);
            const label = stringValue(source.label, hostFromUrl(url));
            const confidence = confidenceSchema.safeParse(source.confidence).success
              ? source.confidence as z.infer<typeof confidenceSchema>
              : "secondary";
            const sanadLevel = numberValue(source.sanadLevel);
            return (
              <div key={`${label}-${index}`} className="grid min-w-0 gap-2 rounded-[6px] border border-border/60 bg-background/70 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{label}</span>
                  <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground" dir="ltr">
                    {stringValue(source.publisher, hostFromUrl(url))}
                  </span>
                </span>
                <SourceAnchor label={label} url={url} confidence={confidence} sanadLevel={sanadLevel ?? undefined} />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});

const InsightList = defineComponent({
  name: "InsightList",
  description: "Short generated insights. Use only insights derived from tool results.",
  props: z.object({
    title: z.string(),
    insights: z.array(dataRowSchema).default([]),
  }),
  component: ({ props }) => {
    const insights = dataRows(props.insights);
    return (
      <div className="grid min-w-0 gap-3">
        <p className="text-sm font-bold">{props.title}</p>
        {insights.length === 0 ? <Skeleton className="h-20 rounded-[8px]" /> : insights.slice(0, 5).map((insight, index) => {
          const tone = toneSchema.safeParse(insight.tone).success ? insight.tone as z.infer<typeof toneSchema> : "default";
          return (
            <div key={index} className={cn("rounded-[8px] border p-4 animate-fade-up", toneClass(tone))}>
              <p className="text-sm font-bold">{stringValue(insight.label, "Insight")}</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{stringValue(insight.detail)}</p>
            </div>
          );
        })}
      </div>
    );
  },
});

const Callout = defineComponent({
  name: "Callout",
  description: "Concise limitation, warning, or next-step note.",
  props: z.object({
    title: z.string(),
    body: z.string(),
    tone: toneSchema.default("default"),
  }),
  component: ({ props }) => (
    <div className={cn("rounded-[8px] border p-4 animate-fade-up", toneClass(props.tone))}>
      <p className="text-sm font-bold">{props.title}</p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{props.body}</p>
    </div>
  ),
});

function PromptActionsComponent({ props }: { props: { prompts?: string[] | null } }) {
  const triggerAction = useTriggerAction();
  const prompts = stringList(props.prompts);
  if (prompts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
      {prompts.slice(0, 4).map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => void triggerAction(prompt)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <MessageSquareText size={12} />
          {prompt}
        </button>
      ))}
    </div>
  );
}

const PromptActions = defineComponent({
  name: "PromptActions",
  description: "Follow-up prompt buttons. Buttons continue the conversation, not route to fixed pages.",
  props: z.object({
    prompts: z.array(z.string()).default([]),
  }),
  component: PromptActionsComponent,
});

function QueryStatusComponent({
  props,
}: {
  props: {
    idleLabel?: string | null;
    loadingLabel?: string | null;
  };
}) {
  const loading = useIsQueryLoading();
  const isArabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const rawIdleLabel = stringValue(props.idleLabel, isArabic ? "المصادر جاهزة" : "Sources ready");
  const rawLoadingLabel = stringValue(props.loadingLabel, isArabic ? "قراءة المصادر" : "Reading sources");
  const idleLabel = rawIdleLabel === "Data synced" && isArabic ? "المصادر جاهزة" : rawIdleLabel;
  const loadingLabel = rawLoadingLabel === "Reading Mizan data" && isArabic ? "قراءة المصادر" : rawLoadingLabel;
  return (
    <span className="inline-flex min-h-8 w-fit items-center gap-2 rounded-[6px] border border-border/70 bg-background/75 px-2.5 text-[0.68rem] font-semibold text-muted-foreground">
      <RefreshCcw size={12} className={cn(loading && "animate-spin")} />
      {loading ? loadingLabel : idleLabel}
    </span>
  );
}

const QueryStatus = defineComponent({
  name: "QueryStatus",
  description: "Small status chip that reflects source-loading activity.",
  props: z.object({
    idleLabel: z.string().default("Sources ready"),
    loadingLabel: z.string().default("Reading Mizan data"),
  }),
  component: QueryStatusComponent,
});

export const mizanOpenUiLibrary = createLibrary({
  root: "Workspace",
  components: [
    Workspace,
    Section,
    Grid,
    Card,
    Metric,
    TextBlock,
    DataTable,
    BarChart,
    ScenarioTool,
    AssumptionPanel,
    ComparisonMatrix,
    NarrativeTabs,
    EvidencePanel,
    Timeline,
    SourceQualityPanel,
    SourceList,
    InsightList,
    Callout,
    PromptActions,
    QueryStatus,
  ],
  componentGroups: [
    {
      name: "Layout",
      components: ["Workspace", "Section", "Grid", "Card", "NarrativeTabs", "Timeline"],
      notes: ["Use these to shape the generated surface before filling it with data components."],
    },
    {
      name: "Data",
      components: ["Metric", "DataTable", "BarChart", "ComparisonMatrix", "AssumptionPanel", "EvidencePanel", "SourceQualityPanel", "SourceList", "InsightList", "QueryStatus"],
      notes: ["Prefer Query-derived props for factual and numeric content. Include BarChart whenever a tool returns series data."],
    },
    {
      name: "Interactive Tools",
      components: ["ScenarioTool"],
      notes: ["Use ScenarioTool for investment simulation, sliders, capital testing, horizon changes, strategy comparisons, and projection visuals."],
    },
    {
      name: "Conversation",
      components: ["PromptActions", "Callout", "TextBlock"],
      notes: ["Follow-up buttons continue the conversation instead of linking to fixed routes."],
    },
  ],
});
