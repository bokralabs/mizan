import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

const toneSchema = z.enum(["default", "primary", "warning", "positive", "danger"]);
const confidenceSchema = z.enum(["official", "secondary", "estimated", "unverified"]);
const childrenSchema = z.array(z.unknown()).default([]);
const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const dataRowSchema = z.record(z.string(), primitiveSchema);
const tabRowSchema = z.object({
  label: z.string(),
  title: z.string().default(""),
  body: z.string().default(""),
});

const noopComponent = () => null;

const Workspace = defineComponent({
  name: "Workspace",
  description: "Root generative workspace. Put all generated sections inside children.",
  props: z.object({
    children: childrenSchema,
    title: z.string().default("Mizan"),
    summary: z.string().default("Sourced Mizan data."),
    lang: z.enum(["en", "ar"]).default("en"),
  }),
  component: noopComponent,
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
  component: noopComponent,
});

const Grid = defineComponent({
  name: "Grid",
  description: "Responsive grid for metrics, cards, charts, and data blocks.",
  props: z.object({
    children: childrenSchema,
    columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  component: noopComponent,
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
  component: noopComponent,
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
  component: noopComponent,
});

const TextBlock = defineComponent({
  name: "TextBlock",
  description: "Short prose block. Keep text concise and use data blocks for facts.",
  props: z.object({
    title: z.string().default(""),
    body: z.string(),
    tone: toneSchema.default("default"),
  }),
  component: noopComponent,
});

const DataTable = defineComponent({
  name: "DataTable",
  description: "Compact table for sourced rows. Pass rows from Query results.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    emptyText: z.string().default("No rows available."),
  }),
  component: noopComponent,
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
  component: noopComponent,
});

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
  component: noopComponent,
});

const AssumptionPanel = defineComponent({
  name: "AssumptionPanel",
  description: "shadcn-style assumption summary. Use for model inputs, caveats, rates, and confidence notes returned by tools.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
    tone: toneSchema.default("default"),
  }),
  component: noopComponent,
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
  component: noopComponent,
});

const NarrativeTabs = defineComponent({
  name: "NarrativeTabs",
  description: "shadcn tabs for short alternate readings, views, or methodological notes. Use for Overview / Assumptions / Sources style switches.",
  props: z.object({
    tabs: z.array(tabRowSchema).default([]),
    defaultValue: z.string().default(""),
  }),
  component: noopComponent,
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
  component: noopComponent,
});

const Timeline = defineComponent({
  name: "Timeline",
  description: "shadcn marker-based timeline. Use for dated updates, process steps, audit trail events, or ordered evidence.",
  props: z.object({
    title: z.string(),
    rows: z.array(dataRowSchema).default([]),
  }),
  component: noopComponent,
});

const SourceQualityPanel = defineComponent({
  name: "SourceQualityPanel",
  description: "Interactive shadcn toggle panel for filtering source quality. Use when the user asks if sources are reliable, official, or need review.",
  props: z.object({
    title: z.string().default("Source quality"),
    sources: z.array(dataRowSchema).default([]),
  }),
  component: noopComponent,
});

const SourceList = defineComponent({
  name: "SourceList",
  description: "Source and provenance list. Use source rows returned by Mizan tools.",
  props: z.object({
    title: z.string(),
    sources: z.array(dataRowSchema).default([]),
  }),
  component: noopComponent,
});

const InsightList = defineComponent({
  name: "InsightList",
  description: "Short generated insights. Use only insights derived from tool results.",
  props: z.object({
    title: z.string(),
    insights: z.array(dataRowSchema).default([]),
  }),
  component: noopComponent,
});

const Callout = defineComponent({
  name: "Callout",
  description: "Concise limitation, warning, or next-step note.",
  props: z.object({
    title: z.string(),
    body: z.string(),
    tone: toneSchema.default("default"),
  }),
  component: noopComponent,
});

const PromptActions = defineComponent({
  name: "PromptActions",
  description: "Follow-up prompt buttons. Buttons continue the conversation, not route to fixed pages.",
  props: z.object({
    prompts: z.array(z.string()).default([]),
  }),
  component: noopComponent,
});

const QueryStatus = defineComponent({
  name: "QueryStatus",
  description: "Small status chip that reflects source-loading activity.",
  props: z.object({
    idleLabel: z.string().default("Sources ready"),
    loadingLabel: z.string().default("Reading Mizan data"),
  }),
  component: noopComponent,
});

export const mizanOpenUiPromptLibrary = createLibrary({
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

export type OpenUiPromptIntent =
  | "investmentScenario"
  | "investment"
  | "debt"
  | "budget"
  | "sources"
  | "institutions"
  | "generic";

export function inferOpenUiPromptIntent(prompt: string): OpenUiPromptIntent {
  const text = prompt.toLowerCase();
  if (/\b(simulate|simulation|simulations|scenario|scenarios)\b|محاكاة|حاكي|سيناريو/.test(text)) {
    return "investmentScenario";
  }
  if (/\btest\b|اختبر/.test(text) && /\b(invest|investment|investing|portfolio|return|yield|asset)\b|استثمار|محفظة|عائد/.test(text)) {
    return "investmentScenario";
  }
  if (/\b(invest|investment|investing|portfolio|return|yield|inflation|exchange|gold|egx|t-?bill|certificate|asset)\b|استثمار|محفظة|عائد|تضخم|صرف|ذهب|بورصة|شهادات|أذون/.test(text)) {
    return "investment";
  }
  if (/\b(source|trust|citation|audit|methodology)\b|مصدر|مصادر|ثقة|توثيق|منهجية|موثوقة/.test(text)) {
    return "sources";
  }
  if (/\b(debt|gdp|external|domestic)\b|دين|ناتج|خارجي|محلي/.test(text)) {
    return "debt";
  }
  if (/\b(budget|deficit|revenue|spending)\b|موازنة|عجز|إيراد|مصروف/.test(text)) {
    return "budget";
  }
  if (/\b(government|parliament|minister|governorate|constitution)\b|حكومة|برلمان|وزارة|محافظة|دستور/.test(text)) {
    return "institutions";
  }
  return "generic";
}

function amountMultiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const normalized = unit.toLowerCase();
  if (normalized === "k" || normalized === "ألف" || normalized === "الف") return 1_000;
  if (normalized === "m" || normalized === "mn" || normalized === "million" || normalized === "مليون") return 1_000_000;
  return 1;
}

function parsePromptCapitalEgp(prompt: string): number {
  const patterns = [
    /\b(?:egp|e£)\s*([0-9][\d,.]*)(?:\s*(k|m|mn|million))?/i,
    /([0-9][\d,.]*)(?:\s*(k|m|mn|million))?\s*(?:egp|e£)\b/i,
    /(?:جنيه|ج\.م)\s*([0-9][\d,.]*)(?:\s*(ألف|الف|مليون))?/i,
    /([0-9][\d,.]*)(?:\s*(ألف|الف|مليون))?\s*(?:جنيه|ج\.م)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match) continue;
    const rawValue = Number(match[1]?.replace(/,/g, ""));
    if (!Number.isFinite(rawValue)) continue;
    const amount = rawValue * amountMultiplier(match[2]);
    if (amount >= 1_000 && amount <= 1_000_000_000) return Math.round(amount);
  }
  return 100_000;
}

function parsePromptHorizonYears(prompt: string): number {
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
  return 5;
}

export function openUiFallbackProgram(prompt: string, lang: "en" | "ar"): string {
  const safePrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").slice(0, 240);
  const intent = inferOpenUiPromptIntent(prompt);

  if (intent === "investmentScenario") {
    const capital = parsePromptCapitalEgp(prompt);
    const horizon = parsePromptHorizonYears(prompt);
    const summary = lang === "ar"
      ? "سيناريو من مؤشرات ميزان المتاحة، وليس نصيحة شخصية."
      : "Scenario context from available Mizan indicators, not personal advice.";
    return [
      `root = Workspace([status, tool, prompts], "Mizan", "${summary}", "${lang}")`,
      `scenario = Query("mizan_simulate_investment", {capitalEgp: ${capital}, horizonYears: ${horizon}, strategies: ["balanced", "fixedIncome", "egyptianGrowth"], lang: "${lang}"}, {title: "${lang === "ar" ? "سيناريو استثمار" : "Investment scenario"}", summary: "", rows: [], series: [], sources: [], insights: [], prompts: []}, 300)`,
      "status = QueryStatus()",
      `tool = ScenarioTool(scenario.title, scenario.summary, scenario.rows, scenario.series, scenario.sources, scenario.insights, ${capital}, 10000, 5000000, 10000, ${horizon}, 1, 30)`,
      "prompts = PromptActions(scenario.prompts)",
    ].join("\n");
  }

  if (intent === "sources") {
    const title = lang === "ar" ? "جودة المصادر" : "Source quality";
    const summary = lang === "ar"
      ? "عرض يقرأ المصادر والصفوف المتاحة من بيانات ميزان."
      : "A generated source and evidence view from Mizan data.";
    return [
      `root = Workspace([status, hero, quality, evidence, sources, prompts], "Mizan", "${summary}", "${lang}")`,
      `data = Query("mizan_search", {query: "${safePrompt}", lang: "${lang}", domain: "sources"}, {title: "${title}", summary: "${summary}", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)`,
      "status = QueryStatus()",
      "hero = Section(data.title, data.summary, [], \"default\")",
      `quality = SourceQualityPanel("${title}", data.sources)`,
      `evidence = EvidencePanel("${lang === "ar" ? "صفوف الأدلة" : "Evidence rows"}", data.summary, data.rows, data.sources)`,
      `sources = SourceList("${lang === "ar" ? "المصادر" : "Sources"}", data.sources)`,
      "prompts = PromptActions(data.prompts)",
    ].join("\n");
  }

  const title = lang === "ar" ? "عرض ميزان" : "Mizan view";
  const summary = lang === "ar"
    ? "عرض يقرأ من بيانات ميزان الموثقة."
    : "A sourced view from Mizan data.";
  const sourceTitle = lang === "ar" ? "المصادر" : "Sources";
  const insightsTitle = lang === "ar" ? "قراءة سريعة" : "Quick read";
  const domainByIntent: Record<OpenUiPromptIntent, string> = {
    investmentScenario: "investment",
    investment: "investment",
    debt: "debt",
    budget: "budget",
    sources: "sources",
    institutions: "institutions",
    generic: "auto",
  };
  return [
    `root = Workspace([status, hero, metrics, chart, rows, insights, sources, prompts], "Mizan", "${summary}", "${lang}")`,
    `data = Query("mizan_search", {query: "${safePrompt}", lang: "${lang}", domain: "${domainByIntent[intent]}"}, {title: "${title}", summary: "${summary}", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)`,
    "status = QueryStatus()",
    "hero = Section(data.title, data.summary, [], \"default\")",
    "metrics = Grid(@Each(data.metrics, \"m\", Metric(m.label, m.value, m.detail, m.sourceLabel, m.sourceUrl, m.confidence)), 3)",
    `chart = BarChart("${lang === "ar" ? "مقارنة مرئية" : "Visual comparison"}", data.series, "label", "value")`,
    `rows = DataTable("${lang === "ar" ? "الصفوف" : "Rows"}", data.rows)`,
    `insights = InsightList("${insightsTitle}", data.insights)`,
    `sources = SourceList("${sourceTitle}", data.sources)`,
    "prompts = PromptActions(data.prompts)",
  ].join("\n");
}
