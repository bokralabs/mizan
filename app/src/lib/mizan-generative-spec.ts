import { defineCatalog } from "@json-render/core";
import { schema as jsonRenderReactSchema } from "@json-render/react/schema";
import { z } from "zod";

export const langSchema = z.enum(["en", "ar"]);
export type Lang = z.infer<typeof langSchema>;

export const metricKeySchema = z.enum([
  "ministries",
  "parliament",
  "governorates",
  "constitutionArticles",
  "debtTotal",
  "debtGdp",
  "externalDebt",
  "domesticDebt",
  "budgetRevenue",
  "budgetSpending",
  "budgetDeficit",
  "budgetYear",
]);
export type MetricKey = z.infer<typeof metricKeySchema>;

export const investmentIndicatorKeySchema = z.enum([
  "egx30_annual_return",
  "egypt_real_estate_return",
  "gold_annual_return",
  "cbe_cd_rate",
  "egypt_tbill_rate",
  "inflation",
  "exchange_rate",
  "egypt_mortgage_rate",
]);
export type InvestmentIndicatorKey = z.infer<typeof investmentIndicatorKeySchema>;

export const sourceKeySchema = z.enum([
  "ministries",
  "parliament",
  "governorates",
  "constitutionArticles",
  "totalDebt",
  "externalDebt",
  "domesticDebt",
  "budget",
  "investmentIndicators",
]);
export type SourceKey = z.infer<typeof sourceKeySchema>;

const toneSchema = z.enum(["primary", "blue", "teal", "red", "purple"]);

const appHrefSchema = z.enum([
  "/government",
  "/budget",
  "/debt",
  "/transparency",
  "/methodology",
  "/funding",
  "/parliament",
  "/constitution",
  "/governorate",
  "/economy",
  "/tools/invest",
  "/tools/buy-vs-rent",
  "/tools/tax-calculator",
  "/tools/mashroaak",
]);

const investmentStrategySchema = z.enum(["conservative", "balanced", "aggressive", "fixedIncome", "egyptianGrowth"]);

const boardPropsSchema = z.object({
  lang: langSchema,
  eyebrow: z.string().min(2).max(36),
  title: z.string().min(2).max(96),
  summary: z.string().min(2).max(420),
});

const gridPropsSchema = z.object({
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
});

const metricCardPropsSchema = z.object({
  metric: metricKeySchema,
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
  tone: toneSchema.default("primary"),
});

const budgetBarsPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
});

const debtSplitPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
});

const entityGridPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
});

const sourceListPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
  sources: z.array(sourceKeySchema).min(1).max(8),
});

const indicatorStripPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
  indicators: z.array(investmentIndicatorKeySchema).min(1).max(6),
});

const insightListPropsSchema = z.object({
  title: z.string().min(2).max(90),
  items: z.array(z.object({
    label: z.string().min(2).max(64),
    metric: metricKeySchema.nullable(),
    note: z.string().min(2).max(260),
  })).min(1).max(5),
});

const calloutPropsSchema = z.object({
  title: z.string().min(2).max(90),
  body: z.string().min(2).max(360),
  tone: toneSchema.default("primary"),
});

const actionLinksPropsSchema = z.object({
  title: z.string().min(2).max(90),
  links: z.array(z.object({
    label: z.string().min(2).max(64),
    href: appHrefSchema,
    description: z.string().min(2).max(180),
  })).min(1).max(4),
});

const toolInputsSchema = z.object({
  capitalEgp: z.number().positive().max(1_000_000_000).optional(),
  horizonYears: z.number().int().min(1).max(30).optional(),
  strategy: investmentStrategySchema.optional(),
  compareStrategies: z.array(investmentStrategySchema).min(2).max(5).optional(),
  inflationPct: z.number().min(0).max(100).optional(),
  egpDepreciationPct: z.number().min(0).max(100).optional(),
}).default({});

const blockSourceSchema = z.object({
  id: z.string().min(1).max(48),
  label: z.string().min(2).max(96),
  url: z.string().url().max(500),
  publisher: z.string().min(2).max(96).optional(),
  lastUpdated: z.string().min(4).max(32).optional(),
  confidence: z.enum(["official", "secondary", "estimated", "unverified"]),
});

const metricDeltaSchema = z.object({
  direction: z.enum(["up", "down", "flat"]),
  label: z.string().min(1).max(36),
  context: z.string().min(2).max(80),
});

const metricStripBlockPropsSchema = z.object({
  eyebrow: z.string().min(2).max(36).optional(),
  heading: z.string().min(2).max(96),
  summary: z.string().min(2).max(320),
  metrics: z.array(z.object({
    id: z.string().min(1).max(48),
    label: z.string().min(2).max(72),
    value: z.string().min(1).max(48),
    detail: z.string().min(2).max(220).optional(),
    sourceId: z.string().min(1).max(48),
    delta: metricDeltaSchema.optional(),
    emphasis: z.enum(["primary", "default"]).optional(),
  })).min(1).max(6),
  sources: z.array(blockSourceSchema).min(1).max(8),
  footerNote: z.string().min(2).max(260).optional(),
});

const rankingTableBlockPropsSchema = z.object({
  eyebrow: z.string().min(2).max(36).optional(),
  heading: z.string().min(2).max(96),
  summary: z.string().min(2).max(320),
  metricLabel: z.string().min(2).max(64),
  rows: z.array(z.object({
    id: z.string().min(1).max(48),
    label: z.string().min(2).max(96),
    value: z.string().min(1).max(48),
    score: z.number().min(0).max(100),
    sourceId: z.string().min(1).max(48),
    context: z.string().min(2).max(240).optional(),
    trend: metricDeltaSchema.optional(),
  })).min(2).max(8),
  sources: z.array(blockSourceSchema).min(1).max(8),
  footerNote: z.string().min(2).max(260).optional(),
});

const timelineFeedBlockPropsSchema = z.object({
  eyebrow: z.string().min(2).max(36).optional(),
  heading: z.string().min(2).max(96),
  summary: z.string().min(2).max(320),
  signals: z.array(z.object({
    id: z.string().min(1).max(48),
    label: z.string().min(2).max(96),
    eventDate: z.string().min(4).max(32),
    summary: z.string().min(2).max(280),
    evidence: z.array(z.string().min(2).max(48)).min(1).max(5),
    sourceId: z.string().min(1).max(48),
    impact: z.enum(["high", "medium", "low"]),
  })).min(1).max(6),
  sources: z.array(blockSourceSchema).min(1).max(8),
  footerNote: z.string().min(2).max(260).optional(),
});

const toolSimulatorPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
  tool: z.literal("simulate_egypt_investment"),
  mode: z.enum(["simulate", "compare"]).default("simulate"),
  inputs: toolInputsSchema,
});

const toolLaunchPropsSchema = z.object({
  title: z.string().min(2).max(90),
  description: z.string().min(2).max(260),
  tool: z.literal("simulate_egypt_investment"),
  href: z.literal("/tools/invest"),
  cta: z.string().min(2).max(64),
  inputs: toolInputsSchema,
});

const suggestionsPropsSchema = z.object({
  prompts: z.array(z.string().min(2).max(96)).min(1).max(4),
});

function element<TType extends string, TProps extends z.ZodType<Record<string, unknown>>>(type: TType, props: TProps) {
  return z.object({
    type: z.literal(type),
    props,
    children: z.array(z.string().min(1)).optional(),
  });
}

export const mizanElementSchema = z.discriminatedUnion("type", [
  element("MizanBoard", boardPropsSchema),
  element("MizanGrid", gridPropsSchema),
  element("MetricCard", metricCardPropsSchema),
  element("BudgetBars", budgetBarsPropsSchema),
  element("DebtSplit", debtSplitPropsSchema),
  element("EntityGrid", entityGridPropsSchema),
  element("SourceList", sourceListPropsSchema),
  element("IndicatorStrip", indicatorStripPropsSchema),
  element("InsightList", insightListPropsSchema),
  element("Callout", calloutPropsSchema),
  element("ActionLinks", actionLinksPropsSchema),
  element("MetricStripBlock", metricStripBlockPropsSchema),
  element("RankingTableBlock", rankingTableBlockPropsSchema),
  element("TimelineFeedBlock", timelineFeedBlockPropsSchema),
  element("ToolSimulator", toolSimulatorPropsSchema),
  element("ToolLaunch", toolLaunchPropsSchema),
  element("Suggestions", suggestionsPropsSchema),
]);

export const mizanJsonSpecSchema = z.object({
  root: z.string().min(1),
  elements: z.record(z.string().min(1), mizanElementSchema),
  state: z.record(z.string(), z.unknown()).optional(),
});

export type MizanJsonSpec = z.infer<typeof mizanJsonSpecSchema>;
export type MizanElement = z.infer<typeof mizanElementSchema>;
type ToolSimulatorInputs = z.infer<typeof toolInputsSchema>;

function fallbackSuggestionPrompts(elements: MizanJsonSpec["elements"], lang: Lang): string[] {
  const ar = lang === "ar";
  const hasDebt = Object.values(elements).some((item) => (
    item.type === "DebtSplit"
    || (item.type === "MetricCard" && ["debtTotal", "debtGdp", "externalDebt", "domesticDebt"].includes(item.props.metric))
    || (item.type === "SourceList" && item.props.sources.some((source) => ["totalDebt", "externalDebt", "domesticDebt"].includes(source)))
  ));
  const hasBudget = Object.values(elements).some((item) => (
    item.type === "BudgetBars"
    || (item.type === "MetricCard" && ["budgetRevenue", "budgetSpending", "budgetDeficit", "budgetYear"].includes(item.props.metric))
    || (item.type === "SourceList" && item.props.sources.includes("budget"))
  ));
  const hasSources = Object.values(elements).some((item) => item.type === "SourceList");
  const hasGovernment = Object.values(elements).some((item) => item.type === "EntityGrid");
  const hasInvestment = Object.values(elements).some((item) => (
    item.type === "IndicatorStrip"
    || item.type === "ToolSimulator"
    || item.type === "ToolLaunch"
    || (item.type === "SourceList" && item.props.sources.includes("investmentIndicators"))
  ));

  if (hasInvestment) {
    return ar
      ? ["قارن العائد بالتضخم", "ما مخاطر العملة؟", "اعرض مصادر المؤشرات"]
      : ["Compare returns with inflation", "What is the currency risk?", "Show the indicator sources"];
  }

  if (hasDebt) {
    return ar
      ? ["أضف فجوة الموازنة", "هل المصادر موثوقة؟", "قارن المحلي والخارجي"]
      : ["Add the budget gap", "Can I trust the sources?", "Compare domestic and external debt"];
  }
  if (hasBudget) {
    return ar
      ? ["اعرض وضع الدين", "هل مصدر الموازنة موثوق؟", "أضف مؤشرات اقتصادية"]
      : ["Show debt status", "Is the budget source reliable?", "Add economic indicators"];
  }
  if (hasSources) {
    return ar
      ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "من يدير ماذا؟"]
      : ["Show debt status", "Show the budget gap", "Who runs what?"];
  }
  if (hasGovernment) {
    return ar
      ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "هل المصادر موثوقة؟"]
      : ["Show debt status", "Show the budget gap", "Can I trust the sources?"];
  }
  return ar
    ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "هل المصادر موثوقة؟"]
    : ["Show debt status", "Show the budget gap", "Can I trust the sources?"];
}

export function suggestionPromptsForSpec(spec: MizanJsonSpec, fallbackLang: Lang = "en"): string[] {
  const board = Object.values(spec.elements).find((item) => item.type === "MizanBoard");
  const lang = board?.type === "MizanBoard" ? board.props.lang : fallbackLang;
  const suggestions = Object.values(spec.elements).find((item) => item.type === "Suggestions");
  return suggestions?.type === "Suggestions"
    ? suggestions.props.prompts
    : fallbackSuggestionPrompts(spec.elements, lang);
}

const loosePropsSchema = z.object({
  lang: langSchema.optional(),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  metric: metricKeySchema.optional(),
  description: z.string().optional(),
  tone: toneSchema.optional(),
  sources: z.array(z.unknown()).optional(),
  indicators: z.array(investmentIndicatorKeySchema).optional(),
  metrics: z.array(z.record(z.string(), z.unknown())).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  signals: z.array(z.record(z.string(), z.unknown())).optional(),
  metricLabel: z.string().optional(),
  footerNote: z.string().optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  body: z.string().optional(),
  links: z.array(z.record(z.string(), z.unknown())).optional(),
  tool: z.string().optional(),
  href: z.string().optional(),
  cta: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  prompts: z.array(z.string()).optional(),
}).passthrough();

export const looseMizanJsonSpecSchema = z.object({
  root: z.string().min(1),
  elements: z.record(z.string().min(1), z.object({
    type: z.string().min(1),
    props: loosePropsSchema.default({}),
    children: z.array(z.string().min(1)).optional(),
  })),
  state: z.record(z.string(), z.unknown()).optional(),
});

export const mizanJsonCatalog = defineCatalog(jsonRenderReactSchema, {
  components: {
    MizanBoard: {
      props: boardPropsSchema,
      description: "Root board with language, title, summary, and child sections.",
    },
    MizanGrid: {
      props: gridPropsSchema,
      description: "Responsive card grid. Put MetricCard, BudgetBars, DebtSplit, EntityGrid, SourceList, IndicatorStrip, InsightList, Callout, or ActionLinks inside it.",
    },
    MetricCard: {
      props: metricCardPropsSchema,
      description: "A sourced metric card. The renderer reads the actual value from Mizan data by metric key.",
    },
    BudgetBars: {
      props: budgetBarsPropsSchema,
      description: "A hoverable revenue, spending, and deficit bar comparison from Mizan budget data.",
    },
    DebtSplit: {
      props: debtSplitPropsSchema,
      description: "A hoverable domestic vs external debt split from Mizan debt data.",
    },
    EntityGrid: {
      props: entityGridPropsSchema,
      description: "Government, parliament, governorates, and constitution overview cards.",
    },
    SourceList: {
      props: sourceListPropsSchema,
      description: "A list of source links with Sanad levels.",
    },
    IndicatorStrip: {
      props: indicatorStripPropsSchema,
      description: "Investment and economy indicators from Mizan data, with sources when available.",
    },
    InsightList: {
      props: insightListPropsSchema,
      description: "Short analytical bullets. Use metric keys instead of copying numeric values.",
    },
    Callout: {
      props: calloutPropsSchema,
      description: "A concise contextual note, limitation, or warning.",
    },
    ActionLinks: {
      props: actionLinksPropsSchema,
      description: "Links to first-party Mizan pages and tools.",
    },
    MetricStripBlock: {
      props: metricStripBlockPropsSchema,
      description: "Storyboard metric strip for sourced headline metrics, source rail, and compact explanatory detail.",
    },
    RankingTableBlock: {
      props: rankingTableBlockPropsSchema,
      description: "Storyboard comparison table for side-by-side ranking, source links, context, and trend signals.",
    },
    TimelineFeedBlock: {
      props: timelineFeedBlockPropsSchema,
      description: "Storyboard timeline feed for recent events, evidence chips, impact labels, and source rail.",
    },
    ToolSimulator: {
      props: toolSimulatorPropsSchema,
      description: "Inline first-party simulator with interactive controls and sourced defaults.",
    },
    ToolLaunch: {
      props: toolLaunchPropsSchema,
      description: "Legacy first-party tool handoff. Prefer ToolSimulator for new investment scenarios.",
    },
    Suggestions: {
      props: suggestionsPropsSchema,
      description: "Follow-up prompts rendered as chat actions.",
    },
  },
  actions: {},
});

export const MIZAN_GENERATIVE_CATALOG_PROMPT = `
You are generating a @json-render/react flat spec for Mizan.

Planner loop:
1. Read the user's prompt and chat history.
2. Read the capability/data scan, especially promptMatch, availability, dataDomains, and appCapabilities.
3. Use promptMatch.extractedInputs when present; do not ignore named strategies, amounts, horizons, or comparison pairs.
4. Select the smallest useful set of data domains and components.
5. Return one coherent UI spec. Never describe this planning loop to the user.

Allowed components:
- MizanBoard({ lang, eyebrow, title, summary }) root container.
- MizanGrid({ columns }) layout container.
- MetricStripBlock({ eyebrow, heading, summary, metrics, sources, footerNote }) from the Storybook catalog. Default choice for sourced metric summaries.
- RankingTableBlock({ eyebrow, heading, summary, metricLabel, rows, sources, footerNote }) from the Storybook catalog. Default choice for clean side-by-side comparisons, rankings, and trust comparisons.
- TimelineFeedBlock({ eyebrow, heading, summary, signals, sources, footerNote }) from the Storybook catalog. Default choice for recent changes, evidence flow, or pipeline/process explanations.
- MetricCard({ metric, title, description, tone }) where metric is one of: ${metricKeySchema.options.join(", ")}.
- BudgetBars({ title, description }) for revenue/spending/deficit.
- DebtSplit({ title, description }) for domestic/external debt split.
- EntityGrid({ title, description }) for government/parliament/governorates/constitution overview.
- SourceList({ title, description, sources }) where sources are: ${sourceKeySchema.options.join(", ")}.
- IndicatorStrip({ title, description, indicators }) where indicators are: ${investmentIndicatorKeySchema.options.join(", ")}.
- InsightList({ title, items: [{ label, metric, note }] }) for compact analysis. Use metric keys for numeric anchors.
- Callout({ title, body, tone }) for limitations or explanation.
- ActionLinks({ title, links: [{ label, href, description }] }) for first-party navigation.
- ToolSimulator({ title, description, tool: "simulate_egypt_investment", mode, inputs }) for rendering Mizan's investment simulator inline with prefilled inputs. Use mode "compare" when the user asks to compare scenarios, strategies, nominal vs real return, or returns vs inflation. For named strategy comparisons, set inputs.compareStrategies to the exact strategies requested, e.g. ["conservative", "aggressive"].
- Suggestions({ prompts }) for 2-4 follow-up prompts.

Rules:
- Return a flat spec: { "root": "root", "elements": { ... }, "state": {... optional ...} }.
- The root element must be MizanBoard.
- First scan the provided capability/data inventory, then compose a view from the relevant Mizan data domains and components.
- Treat promptMatch.candidateComponents as suggestions, not a workflow. Prefer Storybook blocks (MetricStripBlock, RankingTableBlock, TimelineFeedBlock) as the answer surface. Use low-level primitives only when they make the view clearer than a Storybook block.
- Do not emit empty props. Every element must include the meaningful props listed for its component.
- Do not emit JSX, CSS, markdown, arbitrary URLs, or component names outside the catalog.
- Do not invent numbers. Use MetricCard/InsightList metric keys and the renderer will read values from Mizan data.
- When using Storybook blocks, only use values and source URLs present in the provided Mizan data context or capability scan. Prefer fewer roomier blocks over many cramped cards.
- When promptMatch.extractedInputs.compareStrategies is present, any ToolSimulator in compare mode must copy that exact array into inputs.compareStrategies.
- When promptMatch.extractedInputs includes capitalEgp or horizonYears, copy those values into ToolSimulator inputs.
- For investment comparison prompts, include ToolSimulator and a RankingTableBlock or MetricStripBlock that summarizes the compared strategies in a readable side-by-side way.
- A comparison answer without RankingTableBlock or MetricStripBlock is incomplete. Do not answer comparison prompts with only IndicatorStrip, InsightList, SourceList, and Callout.
- If candidateComponents includes RankingTableBlock, prefer it over low-level MetricCard/InsightList for the comparison surface.
- Use SourceList when the user asks about trust, source quality, or wants citations.
- For investment prompts, render scenario/risk/indicator context with IndicatorStrip, InsightList, SourceList, and Callout. Do not recommend a specific investment or allocation.
- For investment scenario prompts that include amount, horizon, simulation, testing, or comparison language, include ToolSimulator and prefill any available inputs. Do not link out to tools for these prompts.
- Use ActionLinks only when a first-party Mizan tool or page is a useful next action. Do not make routes, paths, or selectors the answer.
- For follow-ups, preserve useful existing intent and add/update only what the user asked for unless they request reset.
- Suggestions must feel like natural follow-up questions specific to the rendered view, not generic workflow steps.
- Avoid generic titles like "Mizan overview" unless the user asks for a broad overview.
- Keep text concise and user-facing. No hidden reasoning or step-by-step chain of thought.
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeMizanSpec(value: unknown, lang: Lang): MizanJsonSpec {
  const parsed = mizanJsonSpecSchema.safeParse(value);
  if (parsed.success && parsed.data.root in parsed.data.elements) {
    const elements: MizanJsonSpec["elements"] = {};
    for (const [id, item] of Object.entries(parsed.data.elements)) {
      elements[id] = {
        ...item,
        children: item.children?.filter((childId) => childId in parsed.data.elements && childId !== id),
      };
    }
    repairHierarchy(elements, parsed.data.root, lang);
    enhanceGenericElements(elements, lang);

    return {
      root: parsed.data.root,
      elements,
      state: parsed.data.state,
    };
  }

  const loose = looseMizanJsonSpecSchema.safeParse(value);
  if (!loose.success) return makeFallbackSpec(lang);

  const elements: MizanJsonSpec["elements"] = {};
  for (const [id, item] of Object.entries(loose.data.elements)) {
    const coerced = coerceElement(item.type, item.props, item.children, lang);
    if (coerced) elements[id] = coerced;
  }

  if (!(loose.data.root in elements)) return makeFallbackSpec(lang);

  repairHierarchy(elements, loose.data.root, lang);
  for (const [id, item] of Object.entries(elements)) {
    elements[id] = {
      ...item,
      children: item.children?.filter((childId) => childId in elements && childId !== id),
    };
  }
  enhanceGenericElements(elements, lang);

  return {
    root: loose.data.root,
    elements,
    state: loose.data.state,
  };
}

function repairHierarchy(elements: MizanJsonSpec["elements"], root: string, lang: Lang): void {
  const rootElement = elements[root];
  if (!rootElement || rootElement.type !== "MizanBoard") return;

  const gridEntry = Object.entries(elements).find(([, item]) => item.type === "MizanGrid");
  const contentIds = Object.entries(elements)
    .filter(([id, item]) => id !== root && item.type !== "MizanGrid" && item.type !== "Suggestions")
    .map(([id]) => id);
  const suggestionsEntry = Object.entries(elements).find(([, item]) => item.type === "Suggestions");
  let suggestionsId = suggestionsEntry?.[0] ?? "suggestions";

  let gridId = gridEntry?.[0] ?? "grid";
  if (!gridEntry && contentIds.length > 0) {
    while (gridId in elements) gridId = `${gridId}-content`;
    elements[gridId] = {
      type: "MizanGrid",
      props: { columns: 3 },
      children: contentIds,
    };
  } else if (gridEntry) {
    const grid = gridEntry[1];
    if (grid.type === "MizanGrid" && (!grid.children || grid.children.length === 0)) {
      elements[gridId] = {
        ...grid,
        children: contentIds,
      };
    }
  }

  if (!suggestionsEntry) {
    while (suggestionsId in elements) suggestionsId = `${suggestionsId}-next`;
    elements[suggestionsId] = {
      type: "Suggestions",
      props: { prompts: fallbackSuggestionPrompts(elements, lang) },
    };
  }

  const existingChildren = rootElement.children?.filter((childId) => childId in elements && childId !== root) ?? [];
  const directContentChildren = new Set(contentIds);
  const nextChildren = existingChildren.length > 0
    ? existingChildren.filter((childId) => !directContentChildren.has(childId))
    : [];

  if (contentIds.length > 0 && gridId in elements && !nextChildren.includes(gridId)) {
    nextChildren.unshift(gridId);
  }
  if (!nextChildren.includes(suggestionsId)) {
    nextChildren.push(suggestionsId);
  }

  elements[root] = {
    ...rootElement,
    children: nextChildren.length > 0
      ? nextChildren
      : [suggestionsId],
    };
}

function enhanceGenericElements(elements: MizanJsonSpec["elements"], lang: Lang): void {
  const hasDebt = Object.values(elements).some((item) => item.type === "DebtSplit");
  const hasBudget = Object.values(elements).some((item) => item.type === "BudgetBars");
  const hasInvestment = Object.values(elements).some((item) => (
    item.type === "IndicatorStrip"
    || (item.type === "SourceList" && item.props.sources.includes("investmentIndicators"))
  ));
  const ar = lang === "ar";

  const rootEntry = Object.entries(elements).find(([, item]) => item.type === "MizanBoard");
  if (rootEntry) {
    const [id, item] = rootEntry;
    if (
      item.type === "MizanBoard"
      && (
        item.props.title === "Mizan board"
        || item.props.title === "لوحة ميزان"
        || item.props.summary === "A sourced data view from Mizan."
        || item.props.summary === "لوحة بيانات موثقة من ميزان."
      )
    ) {
      elements[id] = {
        ...item,
        props: {
          ...item.props,
          title: hasDebt
            ? (ar ? "وضع الدين العام" : "Debt status")
            : hasBudget
              ? (ar ? "فجوة الموازنة" : "Budget gap")
              : hasInvestment
                ? (ar ? "سياق الاستثمار" : "Investment context")
                : item.props.title,
          summary: hasDebt
            ? (ar ? "قراءة سريعة لإجمالي الدين ونسبته وتركيبه حسب بيانات ميزان." : "A quick view of debt level, ratio, and composition from Mizan data.")
            : hasBudget
              ? (ar ? "قراءة للإيرادات والمصروفات والعجز حسب بيانات ميزان." : "A view of revenue, spending, and deficit from Mizan data.")
              : hasInvestment
                ? (ar ? "قراءة للمخاطر والمؤشرات المتاحة في ميزان بدون توصية بشراء أصل محدد." : "A sourced risk and indicator view from Mizan data, without recommending a specific asset.")
                : item.props.summary,
        },
      };
    }
  }

  if (hasInvestment) {
    for (const [id, item] of Object.entries(elements)) {
      if (item.type === "Suggestions") {
        const joinedPrompts = item.props.prompts.join(" ").toLowerCase();
        const alreadySpecific = /\b(invest|investment|return|inflation|currency|risk|scenario|source)\b/.test(joinedPrompts)
          || /استثمار|عائد|تضخم|عملة|مخاطر|سيناريو|مصدر/.test(joinedPrompts);
        if (alreadySpecific) continue;
        elements[id] = {
          ...item,
          props: {
            prompts: ar
              ? ["قارن العائد بالتضخم", "اختبر 100 ألف جنيه لمدة 5 سنوات", "ما مخاطر العملة؟"]
              : ["Compare returns with inflation", "Test EGP 100k over 5 years", "What is the currency risk?"],
          },
        };
      }

      if (
        item.type === "SourceList"
        && !item.props.sources.includes("investmentIndicators")
      ) {
        elements[id] = {
          ...item,
          props: {
            title: ar ? "مصادر المؤشرات" : "Indicator sources",
            description: ar ? "روابط المصدر ومستوى سند للبيانات الاستثمارية." : "Source links and Sanad levels for investment indicators.",
            sources: ["investmentIndicators"],
          },
        };
      }

      if (
        item.type === "InsightList"
        && item.props.items.some((entry) => entry.label === "Context" || entry.label === "سياق")
      ) {
        elements[id] = {
          ...item,
          props: {
            title: ar ? "كيف تقرأ السؤال؟" : "How to frame it",
            items: [
              {
                label: ar ? "ابدأ بالقيود" : "Start with constraints",
                metric: null,
                note: ar
                  ? "رأس المال والمدة والسيولة وتحمل مخاطر العملة تغير الإجابة."
                  : "Capital, time horizon, liquidity needs, and currency exposure change the answer.",
              },
              {
                label: ar ? "قارن بالعائد الحقيقي" : "Compare real return",
                metric: null,
                note: ar
                  ? "التضخم وسعر الصرف هما حاجز القراءة؛ العائد الاسمي وحده مضلل."
                  : "Inflation and exchange-rate movement are the hurdle; nominal yield alone can mislead.",
              },
              {
                label: ar ? "افصل السياق عن النصيحة" : "Separate context from advice",
                metric: null,
                note: ar
                  ? "ميزان يعرض بيانات ومقارنات، وليس توصية شخصية بشراء أصل معين."
                  : "Mizan can show data and comparisons, not a personal recommendation to buy a specific asset.",
              },
            ],
          },
        };
      }

      if (
        item.type === "Callout"
        && (
          item.props.body === "Figures are shown as sourced by Mizan."
          || item.props.body === "الأرقام معروضة كما وردت في مصادر ميزان."
        )
      ) {
        elements[id] = {
          ...item,
          props: {
            title: ar ? "ليس توصية مالية" : "Not financial advice",
            body: ar
              ? "لإجابة عملية، حدد المبلغ والمدة والقدرة على تحمل الخسارة وحاجتك للسيولة."
              : "For a useful scenario, provide amount, horizon, loss tolerance, and liquidity needs.",
            tone: "primary",
          },
        };
      }
    }
  }

  const debtCards: Array<{ metric: MetricKey; titleEn: string; titleAr: string; descEn: string; descAr: string }> = [
    { metric: "debtTotal", titleEn: "Total debt", titleAr: "إجمالي الدين", descEn: "Combined debt figure available in Mizan data.", descAr: "إجمالي رقم الدين المتاح في بيانات ميزان." },
    { metric: "debtGdp", titleEn: "Debt-to-GDP ratio", titleAr: "نسبة الدين للناتج", descEn: "Debt read against the size of the economy.", descAr: "قراءة الدين مقارنة بحجم الاقتصاد." },
    { metric: "externalDebt", titleEn: "External debt", titleAr: "الدين الخارجي", descEn: "Foreign-currency-linked debt pressure.", descAr: "ضغط الدين المرتبط بالعملة الأجنبية." },
    { metric: "domesticDebt", titleEn: "Domestic debt", titleAr: "الدين المحلي", descEn: "Local-currency public debt pressure.", descAr: "ضغط الدين العام بالعملة المحلية." },
  ];
  const budgetCards: Array<{ metric: MetricKey; titleEn: string; titleAr: string; descEn: string; descAr: string }> = [
    { metric: "budgetRevenue", titleEn: "Revenue", titleAr: "الإيرادات", descEn: "Projected revenue in the current budget.", descAr: "الإيرادات المقدرة في الموازنة الحالية." },
    { metric: "budgetSpending", titleEn: "Spending", titleAr: "المصروفات", descEn: "Projected expenditure in the current budget.", descAr: "المصروفات المقدرة في الموازنة الحالية." },
    { metric: "budgetDeficit", titleEn: "Deficit", titleAr: "العجز", descEn: "Gap between spending and revenue.", descAr: "الفجوة بين المصروفات والإيرادات." },
  ];
  const replacements = hasDebt ? debtCards : hasBudget ? budgetCards : [];
  if (replacements.length === 0) return;

  let replacementIndex = 0;
  for (const [id, item] of Object.entries(elements)) {
    if (item.type !== "MetricCard") continue;
    const isGeneric = item.props.title === "Metric"
      || item.props.title === "مؤشر"
      || item.props.description === "A sourced value from Mizan data."
      || item.props.description === "قيمة موثقة من بيانات ميزان.";
    if (!isGeneric) continue;

    const replacement = replacements[replacementIndex % replacements.length];
    replacementIndex += 1;
    elements[id] = {
      ...item,
      props: {
        ...item.props,
        metric: replacement.metric,
        title: ar ? replacement.titleAr : replacement.titleEn,
        description: ar ? replacement.descAr : replacement.descEn,
        tone: toneForMetric(replacement.metric),
      },
    };
  }
}

function textProp(props: Record<string, unknown>, key: string, fallback: string): string {
  const value = props[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function enumProp<T extends z.ZodEnum<Record<string, string>>>(
  schema: T,
  value: unknown,
  fallback: z.infer<T>,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function metricFallback(props: Record<string, unknown>): MetricKey {
  const text = `${textProp(props, "title", "")} ${textProp(props, "description", "")}`.toLowerCase();
  if (text.includes("budget") || text.includes("مواز")) return "budgetDeficit";
  if (text.includes("external") || text.includes("خارجي")) return "externalDebt";
  if (text.includes("domestic") || text.includes("محلي")) return "domesticDebt";
  if (text.includes("gdp") || text.includes("ناتج")) return "debtGdp";
  if (text.includes("parliament") || text.includes("برلمان")) return "parliament";
  if (text.includes("government") || text.includes("حكوم")) return "ministries";
  return "debtTotal";
}

function toneForMetric(metric: MetricKey): z.infer<typeof toneSchema> {
  if (metric === "debtTotal" || metric === "budgetDeficit") return "red";
  if (metric === "debtGdp" || metric === "domesticDebt") return "purple";
  if (metric === "externalDebt" || metric === "parliament") return "blue";
  if (metric === "budgetRevenue" || metric === "budgetSpending") return "teal";
  return "primary";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function sourceArray(value: unknown): SourceKey[] {
  const parsed = stringArray(value)
    .map((item) => sourceKeySchema.safeParse(item))
    .filter((item): item is z.ZodSafeParseSuccess<SourceKey> => item.success)
    .map((item) => item.data);
  return parsed.length > 0 ? parsed.slice(0, 8) : ["totalDebt", "budget"];
}

function indicatorArray(value: unknown): InvestmentIndicatorKey[] {
  const parsed = stringArray(value)
    .map((item) => investmentIndicatorKeySchema.safeParse(item))
    .filter((item): item is z.ZodSafeParseSuccess<InvestmentIndicatorKey> => item.success)
    .map((item) => item.data);
  return parsed.length > 0 ? parsed.slice(0, 6) : ["cbe_cd_rate", "egypt_tbill_rate", "inflation", "exchange_rate"];
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toolSimulatorInputs(value: unknown): ToolSimulatorInputs {
  const raw = isRecord(value) ? value : {};
  const inputs: ToolSimulatorInputs = {};
  const capitalEgp = numberFromUnknown(raw.capitalEgp);
  const horizonYears = numberFromUnknown(raw.horizonYears);
  const inflationPct = numberFromUnknown(raw.inflationPct);
  const egpDepreciationPct = numberFromUnknown(raw.egpDepreciationPct);
  const strategy = investmentStrategySchema.safeParse(raw.strategy);
  const compareStrategies = Array.isArray(raw.compareStrategies)
    ? raw.compareStrategies
      .map((item) => investmentStrategySchema.safeParse(item))
      .filter((item): item is z.ZodSafeParseSuccess<z.infer<typeof investmentStrategySchema>> => item.success)
      .map((item) => item.data)
    : [];

  if (capitalEgp !== null && capitalEgp > 0 && capitalEgp <= 1_000_000_000) inputs.capitalEgp = capitalEgp;
  if (horizonYears !== null && horizonYears >= 1 && horizonYears <= 30) inputs.horizonYears = Math.round(horizonYears);
  if (inflationPct !== null && inflationPct >= 0 && inflationPct <= 100) inputs.inflationPct = inflationPct;
  if (egpDepreciationPct !== null && egpDepreciationPct >= 0 && egpDepreciationPct <= 100) inputs.egpDepreciationPct = egpDepreciationPct;
  if (strategy.success) inputs.strategy = strategy.data;
  if (compareStrategies.length >= 2) inputs.compareStrategies = Array.from(new Set(compareStrategies)).slice(0, 5);

  return inputs;
}

function blockSources(value: unknown): z.infer<typeof blockSourceSchema>[] {
  const parsed = Array.isArray(value)
    ? value
      .map((item) => blockSourceSchema.safeParse(item))
      .filter((item): item is z.ZodSafeParseSuccess<z.infer<typeof blockSourceSchema>> => item.success)
      .map((item) => item.data)
    : [];

  if (parsed.length > 0) return parsed.slice(0, 8);
  return [{
    id: "mizan",
    label: "Mizan data",
    url: "https://mizanmasr.com/transparency",
    publisher: "Mizan",
    confidence: "secondary",
  }];
}

function metricDelta(value: unknown): z.infer<typeof metricDeltaSchema> | undefined {
  const parsed = metricDeltaSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function metricStripMetrics(value: unknown): z.infer<typeof metricStripBlockPropsSchema>["metrics"] {
  const rows = Array.isArray(value) ? value : [];
  const parsed = rows
    .map((item, index) => {
      const raw = isRecord(item) ? item : {};
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `metric-${index + 1}`,
        label: textProp(raw, "label", "Metric"),
        value: textProp(raw, "value", "—"),
        detail: typeof raw.detail === "string" && raw.detail.trim() ? raw.detail.slice(0, 220) : undefined,
        sourceId: typeof raw.sourceId === "string" && raw.sourceId ? raw.sourceId : "mizan",
        delta: metricDelta(raw.delta),
        emphasis: enumProp(z.enum(["primary", "default"]), raw.emphasis, "default"),
      };
    })
    .filter((item) => item.label !== "Metric" || item.value !== "—");

  return parsed.slice(0, 6);
}

function rankingRows(value: unknown): z.infer<typeof rankingTableBlockPropsSchema>["rows"] {
  const rows = Array.isArray(value) ? value : [];
  const parsed = rows
    .map((item, index) => {
      const raw = isRecord(item) ? item : {};
      const score = numberFromUnknown(raw.score);
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `row-${index + 1}`,
        label: textProp(raw, "label", `Item ${index + 1}`),
        value: textProp(raw, "value", score === null ? "—" : `${Math.round(score)} / 100`),
        score: clampNumber(score ?? 50, 0, 100),
        sourceId: typeof raw.sourceId === "string" && raw.sourceId ? raw.sourceId : "mizan",
        context: typeof raw.context === "string" && raw.context.trim() ? raw.context.slice(0, 240) : undefined,
        trend: metricDelta(raw.trend),
      };
    });

  return parsed.length >= 2 ? parsed.slice(0, 8) : [];
}

function timelineSignals(value: unknown): z.infer<typeof timelineFeedBlockPropsSchema>["signals"] {
  const rows = Array.isArray(value) ? value : [];
  const parsed = rows
    .map((item, index) => {
      const raw = isRecord(item) ? item : {};
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `signal-${index + 1}`,
        label: textProp(raw, "label", `Signal ${index + 1}`),
        eventDate: textProp(raw, "eventDate", new Date().toISOString().slice(0, 10)),
        summary: textProp(raw, "summary", "Sourced signal from the available Mizan context."),
        evidence: stringArray(raw.evidence).slice(0, 5),
        sourceId: typeof raw.sourceId === "string" && raw.sourceId ? raw.sourceId : "mizan",
        impact: enumProp(z.enum(["high", "medium", "low"]), raw.impact, "medium"),
      };
    })
    .map((item) => ({ ...item, evidence: item.evidence.length > 0 ? item.evidence : ["source context"] }));

  return parsed.slice(0, 6);
}

function amountMultiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const normalized = unit.toLowerCase();
  if (normalized === "k" || normalized === "ألف" || normalized === "الف") return 1_000;
  if (normalized === "m" || normalized === "mn" || normalized === "million" || normalized === "مليون") return 1_000_000;
  return 1;
}

function parsePromptAmount(prompt: string): number | null {
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

  return null;
}

function parsePromptHorizon(prompt: string): number | null {
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

  return null;
}

const promptStrategyPatterns: Array<{
  strategy: z.infer<typeof investmentStrategySchema>;
  pattern: RegExp;
}> = [
  { strategy: "conservative", pattern: /\bconservative\b|محافظ/i },
  { strategy: "aggressive", pattern: /\b(aggressive|high risk)\b|مخاطر عالية|هجومي/i },
  { strategy: "fixedIncome", pattern: /\b(fixed income|t-?bills?|treasury|certificates?|cds?)\b|أذون|خزانة|شهادات|دخل ثابت/i },
  { strategy: "egyptianGrowth", pattern: /\b(egypt growth|egyptian growth|egx|stocks?|growth)\b|بورصة|أسهم|نمو/i },
  { strategy: "balanced", pattern: /\bbalanced\b|متوازن/i },
];

function parsePromptStrategies(prompt: string): z.infer<typeof investmentStrategySchema>[] {
  const normalized = prompt.toLowerCase();
  const mentions = promptStrategyPatterns
    .map(({ strategy, pattern }) => {
      const match = pattern.exec(normalized);
      return match ? { strategy, index: match.index } : null;
    })
    .filter((item): item is { strategy: z.infer<typeof investmentStrategySchema>; index: number } => item !== null)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.strategy);

  return Array.from(new Set(mentions));
}

function extractInvestmentScenarioInputs(prompt: string): ToolSimulatorInputs {
  const inputs: ToolSimulatorInputs = {};
  const capitalEgp = parsePromptAmount(prompt);
  const horizonYears = parsePromptHorizon(prompt);
  const strategies = parsePromptStrategies(prompt);
  const strategy = strategies[0];

  if (capitalEgp !== null) inputs.capitalEgp = capitalEgp;
  if (horizonYears !== null) inputs.horizonYears = horizonYears;
  if (strategy) inputs.strategy = strategy;
  if (strategies.length >= 2 && hasInvestmentComparisonRequest(prompt)) inputs.compareStrategies = strategies;

  return inputs;
}

function hasInvestmentScenarioRequest(prompt: string): boolean {
  const inputs = extractInvestmentScenarioInputs(prompt);
  return Object.keys(inputs).length > 0
    || /\b(test|simulate|scenario|project|projection|try|run)\b|اختبر|حاكي|سيناريو|جرّب|جرب/.test(prompt.toLowerCase());
}

function hasInvestmentComparisonRequest(prompt: string): boolean {
  return /\b(compare|comparison|versus|vs|against|real return|inflation-adjusted|nominal|side by side|side-by-side)\b|قارن|مقارنة|مقابل|جنب/.test(prompt.toLowerCase());
}

function formatScenarioAmount(amount: number | undefined, lang: Lang): string | null {
  if (amount === undefined) return null;
  const compact = amount >= 1_000_000
    ? `${amount / 1_000_000}M`
    : amount >= 1_000
      ? `${amount / 1_000}K`
      : amount.toLocaleString();
  return lang === "ar" ? `${compact} جنيه` : `EGP ${compact}`;
}

function scenarioDescription(inputs: ToolSimulatorInputs, lang: Lang): string {
  const amount = formatScenarioAmount(inputs.capitalEgp, lang);
  const horizon = inputs.horizonYears
    ? (lang === "ar" ? `${inputs.horizonYears} سنوات` : `${inputs.horizonYears} years`)
    : null;
  const parts = [amount, horizon].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return lang === "ar"
      ? "اضبط السيناريو داخل اللوحة وقارن العائد الاسمي والحقيقي."
      : "Adjust the scenario in this board and compare nominal and real outcomes.";
  }
  return lang === "ar"
    ? `محاكاة مبدئية بالقيم: ${parts.join("، ")}.`
    : `Inline scenario prefilled with ${parts.join(" over ")}.`;
}

function investmentToolSimulator(lang: Lang, prompt: string): Extract<MizanElement, { type: "ToolSimulator" }> {
  const ar = lang === "ar";
  const inputs = extractInvestmentScenarioInputs(prompt);
  return {
    type: "ToolSimulator",
    props: {
      title: ar ? "محاكي الاستثمار" : "Investment simulator",
      description: scenarioDescription(inputs, lang),
      tool: "simulate_egypt_investment",
      mode: hasInvestmentComparisonRequest(prompt) ? "compare" : "simulate",
      inputs,
    },
  };
}

function coerceElement(
  type: string,
  props: Record<string, unknown>,
  children: string[] | undefined,
  lang: Lang,
): MizanElement | null {
  const ar = lang === "ar";
  if (type === "MizanBoard") {
    return {
      type,
      props: {
        lang: enumProp(langSchema, props.lang, lang),
        eyebrow: textProp(props, "eyebrow", ar ? "عرض بيانات" : "Data view"),
        title: textProp(props, "title", ar ? "لوحة ميزان" : "Mizan board"),
        summary: textProp(props, "summary", ar ? "لوحة بيانات موثقة من ميزان." : "A sourced data view from Mizan."),
      },
      children,
    };
  }

  if (type === "MizanGrid") {
    const columns = props.columns === 1 || props.columns === 2 || props.columns === 3 ? props.columns : 3;
    return { type, props: { columns }, children };
  }

  if (type === "MetricCard") {
    const metric = enumProp(metricKeySchema, props.metric, metricFallback(props));
    return {
      type,
      props: {
        metric,
        title: textProp(props, "title", ar ? "مؤشر" : "Metric"),
        description: textProp(props, "description", ar ? "قيمة موثقة من بيانات ميزان." : "A sourced value from Mizan data."),
        tone: enumProp(toneSchema, props.tone, toneForMetric(metric)),
      },
      children,
    };
  }

  if (type === "BudgetBars") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "فجوة الموازنة" : "Budget gap"),
        description: textProp(props, "description", ar ? "مقارنة الإيرادات والمصروفات والعجز." : "Revenue, spending, and deficit comparison."),
      },
      children,
    };
  }

  if (type === "DebtSplit") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "تركيب الدين" : "Debt composition"),
        description: textProp(props, "description", ar ? "تقسيم الدين المحلي والخارجي." : "Domestic and external debt split."),
      },
      children,
    };
  }

  if (type === "EntityGrid") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "خريطة الدولة" : "State map"),
        description: textProp(props, "description", ar ? "مداخل الحكومة والبرلمان والمحافظات والدستور." : "Government, parliament, governorates, and constitution anchors."),
      },
      children,
    };
  }

  if (type === "SourceList") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "المصادر" : "Sources"),
        description: textProp(props, "description", ar ? "روابط المصدر ومستوى سند." : "Source links and Sanad levels."),
        sources: sourceArray(props.sources),
      },
      children,
    };
  }

  if (type === "IndicatorStrip") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "مؤشرات اقتصادية" : "Economic indicators"),
        description: textProp(props, "description", ar ? "مؤشرات من بيانات ميزان." : "Indicators from Mizan data."),
        indicators: indicatorArray(props.indicators),
      },
      children,
    };
  }

  if (type === "InsightList") {
    const rawItems = Array.isArray(props.items) ? props.items : [];
    const items = rawItems
      .filter(isRecord)
      .map((item) => {
        const metric = metricKeySchema.safeParse(item.metric);
        return {
          label: textProp(item, "label", ar ? "ملاحظة" : "Note"),
          metric: metric.success ? metric.data : null,
          note: textProp(item, "note", ar ? "استخدم هذه النقطة كسياق للقراءة." : "Use this point as context for the reading."),
        };
      })
      .slice(0, 5);
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "قراءة سريعة" : "Quick read"),
        items: items.length > 0 ? items : [{
          label: ar ? "سياق" : "Context",
          metric: null,
          note: ar ? "تحتاج القراءة إلى مقارنة الرقم بالمصدر والسياق." : "Read the figure alongside its source and context.",
        }],
      },
      children,
    };
  }

  if (type === "Callout") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "ملاحظة" : "Note"),
        body: textProp(props, "body", ar ? "الأرقام معروضة كما وردت في مصادر ميزان." : "Figures are shown as sourced by Mizan."),
        tone: enumProp(toneSchema, props.tone, "primary"),
      },
      children,
    };
  }

  if (type === "ActionLinks") {
    const rawLinks = Array.isArray(props.links) ? props.links : [];
    const links = rawLinks
      .filter(isRecord)
      .map((item) => {
        const href = appHrefSchema.safeParse(item.href);
        return {
          label: textProp(item, "label", ar ? "افتح الصفحة" : "Open page"),
          href: href.success ? href.data : "/transparency",
          description: textProp(item, "description", ar ? "انتقل إلى صفحة ميزان ذات الصلة." : "Go to the relevant Mizan page."),
        };
      })
      .slice(0, 4);
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "خطوات تالية" : "Next actions"),
        links: links.length > 0 ? links : [{
          label: ar ? "منهجية ميزان" : "Mizan methodology",
          href: "/methodology",
          description: ar ? "راجع طريقة جمع البيانات وتوثيقها." : "Review how Mizan collects and documents data.",
        }],
      },
      children,
    };
  }

  if (type === "MetricStripBlock") {
    const metrics = metricStripMetrics(props.metrics);
    if (metrics.length === 0) return null;
    return {
      type,
      props: {
        eyebrow: typeof props.eyebrow === "string" && props.eyebrow.trim() ? props.eyebrow.slice(0, 36) : undefined,
        heading: textProp(props, "heading", ar ? "ملخص مؤشرات" : "Metric summary"),
        summary: textProp(props, "summary", ar ? "ملخص من بيانات ميزان الموثقة." : "A sourced summary from Mizan data."),
        metrics,
        sources: blockSources(props.sources),
        footerNote: typeof props.footerNote === "string" && props.footerNote.trim() ? props.footerNote.slice(0, 260) : undefined,
      },
      children,
    };
  }

  if (type === "RankingTableBlock") {
    const rows = rankingRows(props.rows);
    if (rows.length < 2) return null;
    return {
      type,
      props: {
        eyebrow: typeof props.eyebrow === "string" && props.eyebrow.trim() ? props.eyebrow.slice(0, 36) : undefined,
        heading: textProp(props, "heading", ar ? "مقارنة" : "Comparison"),
        summary: textProp(props, "summary", ar ? "مقارنة منظمة من بيانات ميزان." : "A structured comparison from Mizan data."),
        metricLabel: textProp(props, "metricLabel", ar ? "المؤشر" : "Metric"),
        rows,
        sources: blockSources(props.sources),
        footerNote: typeof props.footerNote === "string" && props.footerNote.trim() ? props.footerNote.slice(0, 260) : undefined,
      },
      children,
    };
  }

  if (type === "TimelineFeedBlock") {
    const signals = timelineSignals(props.signals);
    if (signals.length === 0) return null;
    return {
      type,
      props: {
        eyebrow: typeof props.eyebrow === "string" && props.eyebrow.trim() ? props.eyebrow.slice(0, 36) : undefined,
        heading: textProp(props, "heading", ar ? "تسلسل زمني" : "Timeline"),
        summary: textProp(props, "summary", ar ? "تسلسل إشارات موثقة من بيانات ميزان." : "A sequence of sourced signals from Mizan data."),
        signals,
        sources: blockSources(props.sources),
        footerNote: typeof props.footerNote === "string" && props.footerNote.trim() ? props.footerNote.slice(0, 260) : undefined,
      },
      children,
    };
  }

  if (type === "ToolSimulator") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "محاكي الاستثمار" : "Investment simulator"),
        description: textProp(props, "description", ar ? "اضبط سيناريو الاستثمار داخل اللوحة." : "Adjust the investment scenario inside this board."),
        tool: "simulate_egypt_investment",
        mode: enumProp(z.enum(["simulate", "compare"]), props.mode, "simulate"),
        inputs: toolSimulatorInputs(props.inputs),
      },
      children,
    };
  }

  if (type === "ToolLaunch") {
    return {
      type,
      props: {
        title: textProp(props, "title", ar ? "افتح المحاكي" : "Open simulator"),
        description: textProp(props, "description", ar ? "افتح أداة ميزان مع القيم المبدئية." : "Open the Mizan tool with prefilled values."),
        tool: "simulate_egypt_investment",
        href: "/tools/invest",
        cta: textProp(props, "cta", ar ? "افتح المحاكي" : "Open simulator"),
        inputs: toolSimulatorInputs(props.inputs),
      },
      children,
    };
  }

  if (type === "Suggestions") {
    const prompts = stringArray(props.prompts).slice(0, 4);
    return {
      type,
      props: {
        prompts: prompts.length > 0
          ? prompts
          : ar
            ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "هل المصادر موثوقة؟"]
            : ["Show debt status", "Show the budget gap", "Can I trust the sources?"],
      },
      children,
    };
  }

  return null;
}

export function makeFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "عرض بيانات" : "Data view",
          title: ar ? "نظرة عامة على ميزان" : "Mizan overview",
          summary: ar
            ? "هذه لوحة أساسية من بيانات ميزان الموثقة."
            : "This is a basic board from Mizan's sourced data.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 3 },
        children: ["government", "parliament", "budget"],
      },
      government: {
        type: "MetricCard",
        props: {
          metric: "ministries",
          title: ar ? "الحكومة" : "Government",
          description: ar ? "عدد الوزارات الحالي في بيانات ميزان." : "Current ministries in Mizan data.",
          tone: "primary",
        },
      },
      parliament: {
        type: "MetricCard",
        props: {
          metric: "parliament",
          title: ar ? "البرلمان" : "Parliament",
          description: ar ? "إجمالي أعضاء مجلسي النواب والشيوخ." : "Total members across the House and Senate.",
          tone: "blue",
        },
      },
      budget: {
        type: "MetricCard",
        props: {
          metric: "budgetYear",
          title: ar ? "الموازنة" : "Budget",
          description: ar ? "سنة الموازنة المعروضة في ميزان." : "The budget year currently shown by Mizan.",
          tone: "teal",
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "هل المصادر موثوقة؟"]
            : ["Show debt status", "Show the budget gap", "Can I trust the sources?"],
        },
      },
    },
    state: { lang, fallback: true },
  };
}

export function makePromptFallbackSpec(lang: Lang, prompt: string): MizanJsonSpec {
  const normalized = prompt.toLowerCase();
  if (
    (/\bcompare|comparison|versus|vs\b/.test(normalized) || /قارن|مقارنة|مقابل/.test(prompt))
    && (/\bexternal|domestic|debt\b/.test(normalized) || /خارجي|محلي|دين/.test(prompt))
  ) {
    return makeDebtComparisonFallbackSpec(lang);
  }
  if (/\bdebt|gdp|external|domestic\b/.test(normalized) || /دين|ناتج|خارجي|محلي/.test(prompt)) {
    return makeDebtFallbackSpec(lang);
  }
  if (/\bbudget|deficit|revenue|spending\b/.test(normalized) || /موازنة|عجز|إيراد|مصروف/.test(prompt)) {
    return makeBudgetFallbackSpec(lang);
  }
  if (/\bsource|trust|sanad|citation|reliable\b/.test(normalized) || /مصدر|مصادر|ثقة|سند|موثوق/.test(prompt)) {
    return makeSourcesFallbackSpec(lang);
  }
  if (/\b(invest|investment|portfolio|return|yield|treasury|t-?bill|certificate|cd|gold|egx|stock|stocks|real estate|mortgage|asset|assets|where should i put|where should i invest)\b/.test(normalized) || /استثمار|استثمر|محفظة|عائد|عوائد|ذهب|بورصة|أسهم|عقار|شهادات|أذون|خزانة|تمويل عقاري/.test(prompt)) {
    return makeInvestmentFallbackSpec(lang, prompt);
  }
  if (/\bgovernment|parliament|minister|constitution|governorate\b/.test(normalized) || /حكومة|برلمان|وزارة|دستور|محافظة/.test(prompt)) {
    return makeGovernmentFallbackSpec(lang);
  }
  return makeFallbackSpec(lang);
}

function specHasInvestmentContext(spec: MizanJsonSpec): boolean {
  return spec.state?.intent === "investment"
    || Object.values(spec.elements).some((item) => (
      item.type === "IndicatorStrip"
      || (item.type === "SourceList" && item.props.sources.includes("investmentIndicators"))
      || item.type === "ToolSimulator"
      || item.type === "ToolLaunch"
    ));
}

function uniqueElementId(elements: MizanJsonSpec["elements"], preferred: string): string {
  if (!(preferred in elements)) return preferred;
  let index = 2;
  while (`${preferred}-${index}` in elements) index += 1;
  return `${preferred}-${index}`;
}

function attachChildToGrid(elements: MizanJsonSpec["elements"], rootId: string, childId: string): void {
  const alreadyAttached = Object.values(elements).some((item) => item.children?.includes(childId));
  if (alreadyAttached) return;

  const gridEntry = Object.entries(elements).find(([, item]) => item.type === "MizanGrid");
  if (gridEntry) {
    const [gridId, grid] = gridEntry;
    if (grid.type === "MizanGrid") {
      elements[gridId] = {
        ...grid,
        children: [...(grid.children ?? []), childId],
      };
    }
    return;
  }

  const gridId = uniqueElementId(elements, "grid");
  const contentIds = Object.keys(elements).filter((id) => id !== rootId && id !== childId);
  elements[gridId] = {
    type: "MizanGrid",
    props: { columns: 3 },
    children: [...contentIds, childId],
  };
  const root = elements[rootId];
  if (root?.type === "MizanBoard") {
    elements[rootId] = {
      ...root,
      children: [gridId, ...(root.children?.filter((existingId) => existingId !== gridId && existingId in elements) ?? [])],
    };
  }
}

export function ensureInvestmentSimulator(spec: MizanJsonSpec, prompt: string, lang: Lang): MizanJsonSpec {
  const wantsSimulator = hasInvestmentScenarioRequest(prompt) || hasInvestmentComparisonRequest(prompt);
  if (!wantsSimulator || !specHasInvestmentContext(spec)) return spec;

  const simulator = investmentToolSimulator(lang, prompt);
  const existingSimulator = Object.entries(spec.elements).find(([, item]) => item.type === "ToolSimulator" || item.type === "ToolLaunch");
  const elements: MizanJsonSpec["elements"] = { ...spec.elements };
  const forceCompareMode = hasInvestmentComparisonRequest(prompt);

  if (existingSimulator) {
    const [id, item] = existingSimulator;
    if (item.type === "ToolSimulator" || item.type === "ToolLaunch") {
      elements[id] = {
        type: "ToolSimulator",
        props: {
          title: simulator.props.title,
          description: simulator.props.description,
          tool: "simulate_egypt_investment",
          mode: forceCompareMode ? "compare" : simulator.props.mode,
          inputs: {
            ...item.props.inputs,
            ...simulator.props.inputs,
          },
        },
        children: item.children,
      };
      attachChildToGrid(elements, spec.root, id);
    }
    return { ...spec, elements };
  }

  const simulatorId = uniqueElementId(elements, "simulator");
  elements[simulatorId] = simulator;
  attachChildToGrid(elements, spec.root, simulatorId);

  return { ...spec, elements };
}

export function applyPromptInputsToExistingSimulator(spec: MizanJsonSpec, prompt: string): MizanJsonSpec {
  const inputs = extractInvestmentScenarioInputs(prompt);
  const forceCompareMode = hasInvestmentComparisonRequest(prompt);
  if (Object.keys(inputs).length === 0 && !forceCompareMode) return spec;

  let changed = false;
  const elements: MizanJsonSpec["elements"] = {};
  for (const [id, item] of Object.entries(spec.elements)) {
    if (item.type === "ToolSimulator") {
      changed = true;
      elements[id] = {
        ...item,
        props: {
          ...item.props,
          mode: forceCompareMode ? "compare" : item.props.mode,
          inputs: {
            ...item.props.inputs,
            ...inputs,
          },
        },
      };
      continue;
    }
    if (item.type === "ToolLaunch") {
      changed = true;
      elements[id] = {
        ...item,
        props: {
          ...item.props,
          inputs: {
            ...item.props.inputs,
            ...inputs,
          },
        },
      };
      continue;
    }
    elements[id] = item;
  }

  return changed ? { ...spec, elements } : spec;
}

function makeDebtComparisonFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "مقارنة بيانات" : "Comparison view",
          title: ar ? "الدين المحلي مقابل الخارجي" : "Domestic vs external debt",
          summary: ar
            ? "مقارنة مركزة بين ضغط الدين المحلي والدين الخارجي حسب بيانات ميزان."
            : "A focused comparison of domestic and external debt pressure from Mizan data.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 3 },
        children: ["split", "external", "domestic", "sources", "note"],
      },
      split: {
        type: "DebtSplit",
        props: {
          title: ar ? "تركيب الدين" : "Debt composition",
          description: ar ? "تقسيم الدين بين المحلي والخارجي." : "Debt split between domestic and external components.",
        },
      },
      external: {
        type: "MetricCard",
        props: {
          metric: "externalDebt",
          title: ar ? "الدين الخارجي" : "External debt",
          description: ar ? "ضغط الدين المرتبط بالعملة الأجنبية." : "Foreign-currency-linked debt pressure.",
          tone: "blue",
        },
      },
      domestic: {
        type: "MetricCard",
        props: {
          metric: "domesticDebt",
          title: ar ? "الدين المحلي" : "Domestic debt",
          description: ar ? "ضغط الدين العام بالعملة المحلية." : "Local-currency public debt pressure.",
          tone: "purple",
        },
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "مصادر المقارنة" : "Comparison sources",
          description: ar ? "روابط المصدر ومستوى سند لأرقام الدين." : "Source links and Sanad levels for the debt figures.",
          sources: ["externalDebt", "domesticDebt", "totalDebt"],
        },
      },
      note: {
        type: "Callout",
        props: {
          title: ar ? "كيف تقرأ المقارنة؟" : "How to read it",
          body: ar
            ? "الدين الخارجي يضيف ضغط عملة أجنبية، والدين المحلي يضغط على التمويل والموازنة داخل الاقتصاد."
            : "External debt adds foreign-currency pressure, while domestic debt pressures local financing and the budget.",
          tone: "primary",
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["أضف فجوة الموازنة", "هل المصادر موثوقة؟", "اعرض نسبة الدين للناتج"]
            : ["Add the budget gap", "Can I trust the sources?", "Show debt-to-GDP ratio"],
        },
      },
    },
    state: { lang, fallback: true, intent: "debt-comparison" },
  };
}

function makeDebtFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "عرض بيانات" : "Data view",
          title: ar ? "وضع الدين العام" : "Debt status",
          summary: ar
            ? "قراءة سريعة لإجمالي الدين ونسبته وتركيبه حسب بيانات ميزان."
            : "A quick view of debt level, ratio, and composition from Mizan data.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 3 },
        children: ["total", "ratio", "external", "domestic", "split", "sources"],
      },
      total: {
        type: "MetricCard",
        props: {
          metric: "debtTotal",
          title: ar ? "إجمالي الدين" : "Total debt",
          description: ar ? "إجمالي رقم الدين المتاح في بيانات ميزان." : "Combined debt figure available in Mizan data.",
          tone: "red",
        },
      },
      ratio: {
        type: "MetricCard",
        props: {
          metric: "debtGdp",
          title: ar ? "نسبة الدين للناتج" : "Debt-to-GDP ratio",
          description: ar ? "قراءة الدين مقارنة بحجم الاقتصاد." : "Debt read against the size of the economy.",
          tone: "purple",
        },
      },
      external: {
        type: "MetricCard",
        props: {
          metric: "externalDebt",
          title: ar ? "الدين الخارجي" : "External debt",
          description: ar ? "ضغط الدين المرتبط بالعملة الأجنبية." : "Foreign-currency-linked debt pressure.",
          tone: "blue",
        },
      },
      domestic: {
        type: "MetricCard",
        props: {
          metric: "domesticDebt",
          title: ar ? "الدين المحلي" : "Domestic debt",
          description: ar ? "ضغط الدين العام بالعملة المحلية." : "Local-currency public debt pressure.",
          tone: "purple",
        },
      },
      split: {
        type: "DebtSplit",
        props: {
          title: ar ? "تركيب الدين" : "Debt composition",
          description: ar ? "تقسيم الدين المحلي والخارجي." : "Domestic and external debt split.",
        },
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "مصادر الدين" : "Debt sources",
          description: ar ? "روابط المصدر ومستوى سند للأرقام." : "Source links and Sanad levels for the debt figures.",
          sources: ["totalDebt", "externalDebt", "domesticDebt"],
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["أضف فجوة الموازنة", "هل المصادر موثوقة؟", "قارن المحلي والخارجي"]
            : ["Add the budget gap", "Can I trust the sources?", "Compare domestic and external debt"],
        },
      },
    },
    state: { lang, fallback: true, intent: "debt" },
  };
}

function makeBudgetFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "عرض بيانات" : "Data view",
          title: ar ? "فجوة الموازنة" : "Budget gap",
          summary: ar ? "قراءة للإيرادات والمصروفات والعجز حسب بيانات ميزان." : "A view of revenue, spending, and deficit from Mizan data.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 3 },
        children: ["revenue", "spending", "deficit", "bars", "sources"],
      },
      revenue: {
        type: "MetricCard",
        props: {
          metric: "budgetRevenue",
          title: ar ? "الإيرادات" : "Revenue",
          description: ar ? "الإيرادات المقدرة في الموازنة الحالية." : "Projected revenue in the current budget.",
          tone: "teal",
        },
      },
      spending: {
        type: "MetricCard",
        props: {
          metric: "budgetSpending",
          title: ar ? "المصروفات" : "Spending",
          description: ar ? "المصروفات المقدرة في الموازنة الحالية." : "Projected expenditure in the current budget.",
          tone: "blue",
        },
      },
      deficit: {
        type: "MetricCard",
        props: {
          metric: "budgetDeficit",
          title: ar ? "العجز" : "Deficit",
          description: ar ? "الفجوة بين المصروفات والإيرادات." : "Gap between spending and revenue.",
          tone: "red",
        },
      },
      bars: {
        type: "BudgetBars",
        props: {
          title: ar ? "مقارنة بنود الموازنة" : "Budget line comparison",
          description: ar ? "مقارنة الإيرادات والمصروفات والعجز." : "Revenue, spending, and deficit comparison.",
        },
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "مصدر الموازنة" : "Budget source",
          description: ar ? "رابط المصدر ومستوى سند." : "Source link and Sanad level.",
          sources: ["budget"],
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["اعرض وضع الدين", "هل مصدر الموازنة موثوق؟", "أضف مؤشرات اقتصادية"]
            : ["Show debt status", "Is the budget source reliable?", "Add economic indicators"],
        },
      },
    },
    state: { lang, fallback: true, intent: "budget" },
  };
}

function makeSourcesFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "عرض مصادر" : "Source view",
          title: ar ? "موثوقية المصادر" : "Source reliability",
          summary: ar ? "يعرض ميزان روابط المصدر ومستوى سند لكل مجموعة بيانات." : "Mizan shows source links and Sanad levels for each dataset.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 2 },
        children: ["sources", "note"],
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "المصادر الأساسية" : "Primary sources",
          description: ar ? "روابط مصدرية مع مستوى سند." : "Source links with Sanad levels.",
          sources: ["ministries", "parliament", "budget", "totalDebt", "constitutionArticles"],
        },
      },
      note: {
        type: "Callout",
        props: {
          title: ar ? "ما هو سند؟" : "What Sanad means",
          body: ar ? "سند يوضح قرب المصدر من الجهة الأصلية وثقة ميزان في الرقم." : "Sanad indicates source proximity and Mizan's confidence in a datapoint.",
          tone: "primary",
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "من يدير ماذا؟"]
            : ["Show debt status", "Show the budget gap", "Who runs what?"],
        },
      },
    },
    state: { lang, fallback: true, intent: "sources" },
  };
}

function makeInvestmentFallbackSpec(lang: Lang, prompt = ""): MizanJsonSpec {
  const ar = lang === "ar";
  const includeSimulator = hasInvestmentScenarioRequest(prompt) || hasInvestmentComparisonRequest(prompt);
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "سياق استثماري" : "Investment context",
          title: ar ? "مؤشرات قبل القرار" : "Investment context",
          summary: ar
            ? "قراءة للمخاطر والمؤشرات المتاحة في ميزان بدون توصية بشراء أصل محدد."
            : "A sourced risk and indicator view from Mizan data, without recommending a specific asset.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 3 },
        children: includeSimulator
          ? ["indicators", "simulator", "read", "sources", "guardrail"]
          : ["indicators", "read", "sources", "guardrail"],
      },
      indicators: {
        type: "IndicatorStrip",
        props: {
          title: ar ? "مؤشرات السوق المتاحة" : "Available market indicators",
          description: ar
            ? "معدلات وسعر صرف وتضخم من بيانات ميزان الموثقة."
            : "Rates, exchange rate, and inflation from sourced Mizan data.",
          indicators: ["cbe_cd_rate", "egypt_tbill_rate", "inflation", "exchange_rate"],
        },
      },
      read: {
        type: "InsightList",
        props: {
          title: ar ? "كيف تقرأ السؤال؟" : "How to frame it",
          items: [
            {
              label: ar ? "ابدأ بالقيود" : "Start with constraints",
              metric: null,
              note: ar
                ? "رأس المال والمدة والسيولة وتحمل مخاطر العملة تغير الإجابة."
                : "Capital, time horizon, liquidity needs, and currency exposure change the answer.",
            },
            {
              label: ar ? "قارن بالعائد الحقيقي" : "Compare real return",
              metric: null,
              note: ar
                ? "التضخم وسعر الصرف هما حاجز القراءة؛ العائد الاسمي وحده مضلل."
                : "Inflation and exchange-rate movement are the hurdle; nominal yield alone can mislead.",
            },
            {
              label: ar ? "افصل السياق عن النصيحة" : "Separate context from advice",
              metric: null,
              note: ar
                ? "ميزان يعرض بيانات ومقارنات، وليس توصية شخصية بشراء أصل معين."
                : "Mizan can show data and comparisons, not a personal recommendation to buy a specific asset.",
            },
          ],
        },
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "مصادر المؤشرات" : "Indicator sources",
          description: ar ? "روابط المصدر ومستوى سند للبيانات الاستثمارية." : "Source links and Sanad levels for investment indicators.",
          sources: ["investmentIndicators"],
        },
      },
      ...(includeSimulator
        ? {
            simulator: investmentToolSimulator(lang, prompt),
          }
        : {}),
      guardrail: {
        type: "Callout",
        props: {
          title: ar ? "ليس توصية مالية" : "Not financial advice",
          body: ar
            ? "لإجابة عملية، حدد المبلغ والمدة والقدرة على تحمل الخسارة وحاجتك للسيولة."
            : "For a useful scenario, provide amount, horizon, loss tolerance, and liquidity needs.",
          tone: "primary",
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["قارن العائد بالتضخم", "اختبر 100 ألف جنيه لمدة 5 سنوات", "ما مخاطر العملة؟"]
            : ["Compare returns with inflation", "Test EGP 100k over 5 years", "What is the currency risk?"],
        },
      },
    },
    state: { lang, fallback: true, intent: "investment" },
  };
}

function makeGovernmentFallbackSpec(lang: Lang): MizanJsonSpec {
  const ar = lang === "ar";
  return {
    root: "root",
    elements: {
      root: {
        type: "MizanBoard",
        props: {
          lang,
          eyebrow: ar ? "خريطة الدولة" : "State map",
          title: ar ? "من يدير ماذا؟" : "Who runs what?",
          summary: ar ? "نظرة على الحكومة والبرلمان والمحافظات والدستور." : "A view of government, parliament, governorates, and constitution anchors.",
        },
        children: ["grid", "suggestions"],
      },
      grid: {
        type: "MizanGrid",
        props: { columns: 2 },
        children: ["entities", "sources"],
      },
      entities: {
        type: "EntityGrid",
        props: {
          title: ar ? "مداخل مؤسسات الدولة" : "Institution anchors",
          description: ar ? "أرقام أساسية من بيانات ميزان." : "Core figures from Mizan data.",
        },
      },
      sources: {
        type: "SourceList",
        props: {
          title: ar ? "مصادر المؤسسات" : "Institution sources",
          description: ar ? "روابط المصدر ومستوى سند." : "Source links and Sanad levels.",
          sources: ["ministries", "parliament", "governorates", "constitutionArticles"],
        },
      },
      suggestions: {
        type: "Suggestions",
        props: {
          prompts: ar
            ? ["اعرض وضع الدين", "أظهر فجوة الموازنة", "هل المصادر موثوقة؟"]
            : ["Show debt status", "Show the budget gap", "Can I trust the sources?"],
        },
      },
    },
    state: { lang, fallback: true, intent: "government" },
  };
}
