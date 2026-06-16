"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { estimateCost } from "./lib/tokenCost";

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_THINKING = process.env.DEEPSEEK_THINKING === "enabled";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function appendSystemInstruction(body: Record<string, unknown>, instruction: string): void {
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    body.messages = [{ role: "system", content: instruction }];
    return;
  }

  const target = messages.find((message): message is Record<string, unknown> => (
    isRecord(message)
    && (message.role === "system" || message.role === "developer")
    && (typeof message.content === "string" || Array.isArray(message.content))
  ));

  if (target) {
    if (typeof target.content === "string") {
      target.content = `${target.content}\n\n${instruction}`;
      return;
    }

    if (Array.isArray(target.content)) {
      target.content = [...target.content, { type: "text", text: instruction }];
      return;
    }
  }

  body.messages = [{ role: "system", content: instruction }, ...messages];
}

function adaptStructuredOutputForDeepSeek(body: Record<string, unknown>): void {
  const responseFormat = body.response_format;
  if (!isRecord(responseFormat) || responseFormat.type === "json_object") return;

  const schemaContainer = isRecord(responseFormat.json_schema)
    ? responseFormat.json_schema
    : responseFormat;
  const schema = "schema" in schemaContainer ? schemaContainer.schema : schemaContainer;
  const schemaText = JSON.stringify(schema);

  body.response_format = { type: "json_object" };
  if (body.max_tokens == null && body.max_completion_tokens == null) {
    body.max_tokens = 3500;
  }

  appendSystemInstruction(
    body,
    [
      "Return JSON only. Do not include Markdown, prose, or code fences.",
      "The JSON object must validate this schema:",
      schemaText,
    ].join("\n"),
  );
}

async function deepseekFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof init?.body !== "string") {
    return fetch(input, init);
  }

  try {
    const body: unknown = JSON.parse(init.body);
    if (isRecord(body)) {
      adaptStructuredOutputForDeepSeek(body);
      const requestBody = DEEPSEEK_THINKING
        ? body
        : {
            ...body,
            thinking: { type: "disabled" },
          };
      return fetch(input, {
        ...init,
        body: JSON.stringify(requestBody),
      });
    }
  } catch {
    // Fall back to the original request body when the provider sends non-JSON payloads.
  }

  return fetch(input, init);
}

const deepseek = createOpenAI({
  name: "deepseek",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  baseURL: DEEPSEEK_BASE_URL,
  fetch: deepseekFetch,
});

const deepseekChatModel = deepseek.chat(DEEPSEEK_MODEL);

function assertDeepSeekConfigured(): void {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is required in the Convex environment for Mizan generative UI chat.");
  }
}

const gridBlockSchema = z.object({
  id: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/),
  kind: z.enum([
    "kpi",
    "budgetBars",
    "debtSplit",
    "entityGrid",
    "sourceList",
    "findingSteps",
    "investmentLens",
    "toolLauncher",
    "indicatorStrip",
  ]),
  span: z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(12),
  ]),
  metric: z.enum([
    "ministries",
    "parliament",
    "debtTotal",
    "debtGdp",
    "budgetDeficit",
    "budgetSpending",
  ]).nullable().describe("Required for kpi blocks. Use null for non-kpi blocks."),
  title: z.string().min(2).max(110),
  description: z.string().min(2).max(260),
  indicators: z.array(z.enum([
    "egx30_annual_return",
    "egypt_real_estate_return",
    "gold_annual_return",
    "cbe_cd_rate",
    "egypt_tbill_rate",
    "inflation",
    "exchange_rate",
    "egypt_mortgage_rate",
  ])).max(4).describe("Use for indicatorStrip blocks. Empty array for other block kinds."),
  action: z.object({
    label: z.string().min(2).max(48),
    href: z.enum([
      "/government",
      "/budget",
      "/debt",
      "/transparency",
      "/methodology",
      "/funding",
      "/parliament",
      "/constitution",
      "/governorate",
      "/tools/invest",
      "/tools/buy-vs-rent",
      "/tools/tax-calculator",
    ]),
  }).nullable().describe("Use for toolLauncher or a block with a clear next action. Otherwise null."),
});

const uiGridPlanSchema = z.object({
  schemaVersion: z.literal("mzn-grid-v1"),
  language: z.enum(["en", "ar"]),
  intent: z.enum(["overview", "budget", "debt", "government", "sources", "investment", "comparison"]),
  operation: z.enum(["replace", "append", "update", "focus"]).describe("How this plan should affect the existing page state."),
  title: z.string().min(2).max(90),
  chatReply: z.string().min(2).max(220).describe("A short assistant message shown in chat. No hidden chain of thought."),
  answer: z.string().min(2).max(800),
  plan: z.array(z.string().min(2).max(140)).min(2).max(5),
  blocks: z.array(gridBlockSchema).min(2).max(8),
  focusBlockId: z.string().nullable().describe("Existing or new block id to scroll to when operation is focus/update, otherwise null."),
  suggestions: z.array(z.string().min(2).max(120)).min(2).max(4),
});

type UiGridPlan = z.infer<typeof uiGridPlanSchema>;
type CurrentView = {
  title: string;
  intent: string;
  language: string;
  answer: string;
  blocks: Array<{
    id: string;
    kind: string;
    span: number;
    metric?: string;
    title: string;
    description: string;
    indicators: string[];
  }>;
  suggestions: string[];
};

const allowedIntents = ["overview", "budget", "debt", "government", "sources", "investment", "comparison"] as const;
const allowedOperations = ["replace", "append", "update", "focus"] as const;
const allowedBlockKinds = [
  "kpi",
  "budgetBars",
  "debtSplit",
  "entityGrid",
  "sourceList",
  "findingSteps",
  "investmentLens",
  "toolLauncher",
  "indicatorStrip",
] as const;
const allowedSpans = [3, 4, 5, 6, 7, 8, 12] as const;
const allowedMetrics = ["ministries", "parliament", "debtTotal", "debtGdp", "budgetDeficit", "budgetSpending"] as const;
const allowedIndicators = [
  "egx30_annual_return",
  "egypt_real_estate_return",
  "gold_annual_return",
  "cbe_cd_rate",
  "egypt_tbill_rate",
  "inflation",
  "exchange_rate",
  "egypt_mortgage_rate",
] as const;
const allowedActionHrefs = [
  "/government",
  "/budget",
  "/debt",
  "/transparency",
  "/methodology",
  "/funding",
  "/parliament",
  "/constitution",
  "/governorate",
  "/tools/invest",
  "/tools/buy-vs-rent",
  "/tools/tax-calculator",
] as const;

function asString(value: unknown, fallback: string, maxLength: number): string {
  return cleanVisibleText(typeof value === "string" && value.trim() ? value : fallback, maxLength);
}

function asEnum<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[], min: number, max: number): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const compact = raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => cleanVisibleText(item, 120))
    .slice(0, max);

  while (compact.length < min) {
    compact.push(fallback[compact.length] ?? fallback[0] ?? "Review the current view");
  }

  return compact;
}

function sanitizeBlockId(value: unknown, fallback: string): string {
  const base = (typeof value === "string" && value.trim() ? value : fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return base.length >= 2 ? base : fallback;
}

function inferMetric(kind: UiGridPlan["blocks"][number]["kind"], intent: UiGridPlan["intent"], text: string): UiGridPlan["blocks"][number]["metric"] {
  if (kind !== "kpi") return null;
  const lower = text.toLowerCase();
  if (lower.includes("spending") || lower.includes("expenditure") || lower.includes("مصروف")) return "budgetSpending";
  if (lower.includes("deficit") || lower.includes("عجز")) return "budgetDeficit";
  if (lower.includes("gdp") || lower.includes("ناتج")) return "debtGdp";
  if (lower.includes("parliament") || lower.includes("برلمان")) return "parliament";
  if (lower.includes("ministr") || lower.includes("حكومة") || lower.includes("وزارة")) return "ministries";
  if (intent === "budget") return "budgetDeficit";
  if (intent === "government") return "ministries";
  return "debtTotal";
}

function inferKind(value: unknown, intent: UiGridPlan["intent"], text: string): UiGridPlan["blocks"][number]["kind"] {
  const requested = asEnum(value, allowedBlockKinds, "findingSteps");
  if (requested !== "findingSteps") return requested;
  const lower = text.toLowerCase();
  if (intent === "budget" || lower.includes("budget") || lower.includes("موازنة")) return "budgetBars";
  if (intent === "debt" || lower.includes("debt") || lower.includes("دين")) return "debtSplit";
  if (intent === "government") return "entityGrid";
  if (intent === "sources") return "sourceList";
  if (intent === "investment") return "investmentLens";
  return requested;
}

function coercePlanBlock(
  value: unknown,
  index: number,
  intent: UiGridPlan["intent"],
  language: UiGridPlan["language"],
  usedIds: Set<string>,
): UiGridPlan["blocks"][number] | null {
  if (!isRecord(value)) return null;

  const title = asString(value.title, language === "ar" ? "معلومة موثقة" : "Sourced finding", 90);
  const description = asString(value.description, language === "ar" ? "يعرض هذا الجزء بيانات ميزان المتاحة." : "This section uses available Mizan data.", 220);
  const kind = inferKind(value.kind, intent, `${title} ${description}`);
  const fallbackId = `${kind}-${index + 1}`;
  let id = sanitizeBlockId(value.id, fallbackId);
  let suffix = 2;
  while (usedIds.has(id)) {
    id = sanitizeBlockId(`${fallbackId}-${suffix}`, `${fallbackId}-${suffix}`);
    suffix += 1;
  }
  usedIds.add(id);

  const requestedSpan = typeof value.span === "number" && allowedSpans.includes(value.span as (typeof allowedSpans)[number])
    ? value.span as UiGridPlan["blocks"][number]["span"]
    : kind === "sourceList" || kind === "findingSteps" || kind === "indicatorStrip"
      ? 12
      : kind === "kpi"
        ? 4
        : 6;
  const rawIndicators = Array.isArray(value.indicators) ? value.indicators : [];
  const indicators = kind === "indicatorStrip"
    ? rawIndicators
      .filter((item): item is UiGridPlan["blocks"][number]["indicators"][number] => (
        typeof item === "string" && allowedIndicators.includes(item as (typeof allowedIndicators)[number])
      ))
      .slice(0, 4)
    : [];
  const metric = kind === "kpi"
    ? asEnum(value.metric, allowedMetrics, inferMetric(kind, intent, `${title} ${description}`) ?? "debtTotal")
    : null;
  const action = isRecord(value.action) && typeof value.action.href === "string" && allowedActionHrefs.includes(value.action.href as (typeof allowedActionHrefs)[number])
    ? {
        label: asString(value.action.label, language === "ar" ? "افتح التفاصيل" : "Open details", 48),
        href: value.action.href as NonNullable<UiGridPlan["blocks"][number]["action"]>["href"],
      }
    : kind === "toolLauncher"
      ? {
          label: language === "ar" ? "افتح الأداة" : "Open tool",
          href: intent === "investment" ? "/tools/invest" as const : "/transparency" as const,
        }
      : null;

  return {
    id,
    kind,
    span: requestedSpan,
    metric,
    title,
    description,
    indicators,
    action,
  };
}

function currentViewBlocks(currentView: CurrentView | undefined, intent: UiGridPlan["intent"], language: UiGridPlan["language"], usedIds: Set<string>): UiGridPlan["blocks"] {
  return (currentView?.blocks ?? [])
    .map((block, index) => coercePlanBlock(block, index, intent, language, usedIds))
    .filter((block): block is UiGridPlan["blocks"][number] => block !== null)
    .slice(0, 2);
}

function fallbackBlocks(intent: UiGridPlan["intent"], language: UiGridPlan["language"], usedIds: Set<string>): UiGridPlan["blocks"] {
  const rawBlocks: Array<Record<string, unknown>> = intent === "budget"
    ? [
        { id: "budget-gap", kind: "budgetBars", span: 8, title: language === "ar" ? "فجوة الموازنة" : "Budget gap", description: language === "ar" ? "قارن الإيرادات والمصروفات والعجز." : "Compare revenue, spending, and deficit.", indicators: [], metric: null, action: null },
        { id: "budget-deficit", kind: "kpi", span: 4, metric: "budgetDeficit", title: language === "ar" ? "عجز الموازنة" : "Budget deficit", description: language === "ar" ? "رقم موثق من أحدث موازنة." : "A sourced number from the latest budget.", indicators: [], action: null },
      ]
    : intent === "government"
      ? [
          { id: "government-map", kind: "entityGrid", span: 8, title: language === "ar" ? "مؤسسات الدولة" : "State institutions", description: language === "ar" ? "عرض مختصر للجهات المتاحة." : "A compact view of available institutions.", indicators: [], metric: null, action: null },
          { id: "government-sources", kind: "sourceList", span: 4, title: language === "ar" ? "مصادر البيانات" : "Data sources", description: language === "ar" ? "روابط المصادر المستخدمة." : "Links to the sources used.", indicators: [], metric: null, action: null },
        ]
      : [
          { id: "debt-context", kind: "debtSplit", span: 8, title: language === "ar" ? "تكوين الدين" : "Debt composition", description: language === "ar" ? "قارن الدين الخارجي والمحلي." : "Compare external and domestic debt.", indicators: [], metric: null, action: null },
          { id: "debt-ratio", kind: "kpi", span: 4, metric: "debtGdp", title: language === "ar" ? "الدين إلى الناتج" : "Debt-to-GDP", description: language === "ar" ? "النسبة الكلية المتاحة في ميزان." : "The available macro ratio in Mizan.", indicators: [], action: null },
        ];

  return rawBlocks
    .map((block, index) => coercePlanBlock(block, index, intent, language, usedIds))
    .filter((block): block is UiGridPlan["blocks"][number] => block !== null);
}

function coerceUiGridPlan(value: unknown, language: UiGridPlan["language"], currentView?: CurrentView): UiGridPlan {
  const raw = isRecord(value) ? value : {};
  const intent = asEnum(raw.intent, allowedIntents, asEnum(currentView?.intent, allowedIntents, "overview"));
  const requestedOperation = asEnum(raw.operation, allowedOperations, currentView ? "focus" : "replace");
  const operation: UiGridPlan["operation"] = currentView && requestedOperation === "replace" ? "update" : requestedOperation;
  const title = asString(raw.title, currentView?.title ?? (language === "ar" ? "لوحة ميزان" : "Mizan board"), 90);
  const chatReply = asString(raw.chatReply, language === "ar" ? "حدّثت اللوحة الحالية." : "I updated the current board.", 180);
  const answer = asString(raw.answer, currentView?.answer ?? chatReply, 420);
  const plan = asStringArray(raw.plan, language === "ar" ? ["أراجع اللوحة الحالية", "أحدّث العرض"] : ["Review the current board", "Update the view"], 2, 5);
  const suggestions = asStringArray(raw.suggestions, currentView?.suggestions ?? (language === "ar" ? ["أضف المصادر", "اشرح المؤشر"] : ["Add sources", "Explain the metric"]), 2, 4);
  const usedIds = new Set<string>();
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .map((block, index) => coercePlanBlock(block, index, intent, language, usedIds))
    .filter((block): block is UiGridPlan["blocks"][number] => block !== null);

  const repairedBlocks = blocks.length >= 2
    ? blocks
    : [
        ...blocks,
        ...currentViewBlocks(currentView, intent, language, usedIds),
        ...fallbackBlocks(intent, language, usedIds),
      ].slice(0, 8);
  const focusBlockId = typeof raw.focusBlockId === "string" && repairedBlocks.some((block) => block.id === raw.focusBlockId)
    ? raw.focusBlockId
    : currentView && operation === "focus"
      ? repairedBlocks[0]?.id ?? null
      : null;

  return {
    schemaVersion: "mzn-grid-v1",
    language,
    intent,
    operation,
    title,
    chatReply,
    answer,
    plan,
    blocks: repairedBlocks.slice(0, 8),
    focusBlockId,
    suggestions,
  };
}

function extractJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return {};
  return JSON.parse(text.slice(first, last + 1)) as unknown;
}

async function repairUiGridPlanText(text: string, language: UiGridPlan["language"], currentView?: CurrentView): Promise<string> {
  try {
    return JSON.stringify(coerceUiGridPlan(extractJsonObject(text), language, currentView));
  } catch {
    return JSON.stringify(coerceUiGridPlan({}, language, currentView));
  }
}

function cleanVisibleText(text: string, maxLength: number): string {
  const withoutUnexpectedScripts = text.replace(/[\u4E00-\u9FFF]+/g, "");
  const compact = withoutUnexpectedScripts.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;

  const clipped = compact.slice(0, maxLength);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("؟"),
  );

  if (sentenceEnd > 80) return clipped.slice(0, sentenceEnd + 1).trim();
  return `${clipped.trim()}...`;
}

function cleanAnswerText(answer: string, chatReply: string): string {
  const cleaned = cleanVisibleText(answer, 420);
  const numberedMarkers = cleaned.match(/\b\d+\./g) ?? [];
  if (numberedMarkers.length > 1 || /\b\d+\.$/.test(cleaned)) {
    return cleanVisibleText(chatReply, 180);
  }
  return cleaned;
}

function safeInvestmentAnswer(language: "en" | "ar"): string {
  return language === "ar"
    ? "أضفت مؤشرات ومقارنات تساعدك تقارن الخيارات بنفسك؛ ميزان لا يقدم توصية استثمارية."
    : "I added indicators and comparison inputs so you can compare options; Mizan is not making an investment recommendation.";
}

const advisoryCopyPattern = /(?:investment advice|advice|recommend|should invest|promising|beneficial|encourage|best option|توصية|نصيحة|أنصح|الأفضل|استثمر)/i;

function safeInvestmentBlockCopy(
  block: UiGridPlan["blocks"][number],
  language: "en" | "ar",
): UiGridPlan["blocks"][number] {
  const text = `${block.title} ${block.description}`;
  if (!advisoryCopyPattern.test(text)) return block;

  const title = block.kind === "findingSteps"
    ? language === "ar" ? "قائمة مقارنة الفرضيات" : "Assumption checklist"
    : block.title
      .replace(/investment advice/gi, language === "ar" ? "مقارنة الخيارات" : "Option comparison")
      .replace(/advice/gi, language === "ar" ? "مقارنة" : "comparison")
      .replace(/recommendations?/gi, language === "ar" ? "مقارنات" : "comparisons");

  return {
    ...block,
    title: cleanVisibleText(title, 90),
    description: language === "ar"
      ? "اعرض المؤشرات والمخاطر حتى يقارن المستخدم الفرضيات بنفسه."
      : "Show indicators and risks so the user can compare assumptions without a recommendation.",
  };
}

function safeInvestmentStep(step: string, language: "en" | "ar"): string {
  if (!advisoryCopyPattern.test(step)) return cleanVisibleText(step, 120);
  return language === "ar"
    ? "قارن المخاطر والتنويع"
    : "Compare risks and diversification";
}

function hasFreshStartIntent(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(reset|clear|wipe|start over|from scratch|new page|fresh page|fresh board|new board)\b/.test(normalized)
    || /(?:امسح|اعادة|إعادة|ابدأ من جديد|ابدا من جديد|من الأول|من الاول|صفحة جديدة|لوحة جديدة)/.test(normalized);
}

function normalizeGridPlan(plan: UiGridPlan): UiGridPlan {
  const blocks: UiGridPlan["blocks"] = plan.blocks.map((item) => {
    const lowerText = `${item.title} ${item.description}`.toLowerCase();
    const investmentIndicators = item.indicators.length > 0
      ? item.indicators
      : (["cbe_cd_rate", "egypt_tbill_rate", "inflation", "exchange_rate"] satisfies UiGridPlan["blocks"][number]["indicators"]);

    if (
      plan.intent === "investment"
      && (
        (item.kind === "kpi" && /invest|advice|option|return|rate|yield|استثمار|عائد|فائدة/.test(lowerText))
        || (item.kind === "investmentLens" && /indicator|return|rate|yield|مؤشر|عائد|فائدة/.test(lowerText))
      )
    ) {
      return {
        ...item,
        kind: "indicatorStrip",
        span: investmentIndicators.length > 2 ? 12 : item.span === 3 ? 4 : item.span,
        metric: null,
        indicators: investmentIndicators.slice(0, 4),
        title: item.title,
        description: item.description,
      };
    }

    if (item.kind === "kpi" && item.metric === null) {
      const indicators = item.indicators.length > 0
        ? item.indicators
        : item.title.toLowerCase().includes("inflation")
          ? ["inflation" as const]
          : [];

      if (indicators.length > 0) {
        return {
          ...item,
          kind: "indicatorStrip",
          span: indicators.length > 2 ? 12 : item.span === 3 ? 4 : item.span,
          indicators,
        };
      }

      return {
        ...item,
        metric: "debtGdp" as const,
      };
    }

    return item;
  });

  let hasIndicatorStrip = false;
  const displayBlocks: UiGridPlan["blocks"] = blocks.map((item) => {
    if (plan.intent !== "investment" || item.kind !== "indicatorStrip") {
      return item;
    }

    if (!hasIndicatorStrip) {
      hasIndicatorStrip = true;
      return {
        ...item,
        span: item.indicators.length > 2 ? 12 : item.span,
      };
    }

    return {
      ...item,
      kind: "investmentLens",
      span: item.span === 12 ? 7 : item.span,
      metric: null,
      indicators: [],
    };
  });

  if (plan.intent === "investment" && !displayBlocks.some((item) => item.kind === "toolLauncher") && displayBlocks.length < 8) {
    displayBlocks.push({
      id: "investment-tools",
      kind: "toolLauncher",
      span: 5,
      metric: null,
      title: plan.language === "ar" ? "افتح محاكي المقارنة" : "Open the comparison simulator",
      description: plan.language === "ar"
        ? "افتح أدوات ميزان لمقارنة نفس المبلغ عبر أكثر من أصل بدل نصيحة عامة."
        : "Open Mizan tools to compare the same amount across assets instead of taking generic advice.",
      indicators: [],
      action: {
        label: plan.language === "ar" ? "افتح محاكي الاستثمار" : "Open investment simulator",
        href: "/tools/invest",
      },
    });
  }

  const safeBlocks = plan.intent === "investment"
    ? displayBlocks.map((item) => safeInvestmentBlockCopy(item, plan.language))
    : displayBlocks;

  const focusBlockId = plan.focusBlockId && safeBlocks.some((item) => item.id === plan.focusBlockId)
    ? plan.focusBlockId
    : null;
  const answer = cleanAnswerText(plan.answer, plan.chatReply);
  const advisoryAnswer = plan.intent === "investment" && advisoryCopyPattern.test(answer)
    ? safeInvestmentAnswer(plan.language)
    : answer;
  const chatReply = cleanVisibleText(plan.chatReply, 180);
  const safeChatReply = plan.intent === "investment" && advisoryCopyPattern.test(chatReply)
    ? safeInvestmentAnswer(plan.language)
    : chatReply;

  return {
    ...plan,
    title: cleanVisibleText(plan.title, 90),
    chatReply: safeChatReply,
    answer: advisoryAnswer,
    plan: plan.plan.map((step) => plan.intent === "investment" ? safeInvestmentStep(step, plan.language) : cleanVisibleText(step, 120)),
    blocks: safeBlocks,
    focusBlockId,
    suggestions: plan.suggestions.map((suggestion) => cleanVisibleText(suggestion, 100)),
  };
}

const UI_PLANNER_SYSTEM = `You are Mizan's UI planning agent.

You do not write a chat answer. You return a typed grid plan that a deterministic React renderer can execute.

Core contract:
- Return only the requested structured object.
- Use the application language named in the system message for visible strings, even when the user's message is written in another language.
- The JSON grid plan is the UI notation. Do not request arbitrary JSX or invent components.
- Pick blocks from the allowed catalog only.
- Each block must justify why it exists through title and description.
- Use data references from DATA CONTEXT only. Never invent civic values.
- If the user asks an advisory question, convert it into assumptions, risks, comparisons, and tool launchers. Do not give financial, legal, or political advice.
- Keep text concise. The page should grow through blocks, charts, metrics, and next actions.
- Good plans feel like an analyst is assembling an app around the user's question.
- For investment prompts, never tell the user where they should invest or what is beneficial. Render assumption inputs, rates, risks, and a simulator action.
- Never title investment blocks "Investment Advice" or "Recommendations"; use "Assumption checklist", "Rate indicators", or "Risk lens".
- If CURRENT VIEW exists, treat the user message as a follow-up unless they clearly ask to start over or switch topics.
- CURRENT VIEW block ids are durable page memory. Do not resend existing block ids for append. Only include genuinely new blocks unless the user asks to revise a specific existing block.
- For follow-ups, prefer operation=focus or operation=update when existing blocks can answer the ask. Use append only when the user clearly needs an additional chart, source list, tool, or metric not already represented.
- For operation=update or operation=focus, include full valid block objects using existing CURRENT VIEW block ids so the renderer can reuse existing components.
- The schema always requires at least two blocks. If focusing one existing block, include one additional related existing block from CURRENT VIEW.
- Use operation=append to add new evidence, charts, tools, or next-step blocks beneath the current page.
- Use operation=update to revise existing blocks or language without discarding useful context.
- Use operation=focus when the answer mainly points the user to an existing block; set focusBlockId.
- Use operation=replace only for a clearly new topic, reset, or explicit request for a fresh page.
- chatReply is the brief conversational answer. It should say what changed or what is being added, not reveal hidden chain of thought.
- plan is visible progress, not hidden reasoning. Phrase it as concise work steps or section labels.
- answer must be one or two complete sentences. Do not write a numbered list in answer.

Block catalog:
- kpi: one sourced metric. metric must be one of ministries, parliament, debtTotal, debtGdp, budgetDeficit, budgetSpending.
- budgetBars: revenue/spending/deficit chart.
- debtSplit: domestic vs external debt chart.
- entityGrid: government/parliament/governorates/constitution map.
- sourceList: cited source list.
- findingSteps: short step-by-step analytical walkthrough.
- investmentLens: investment-context risk lens using macro data.
- toolLauncher: navigable tools for simulations or deeper pages.
- indicatorStrip: investment/economic indicators such as rates, inflation, exchange rate, gold, real estate, EGX.
- Never create a kpi block for "investment advice" or generic recommendations. Use indicatorStrip, investmentLens, and toolLauncher instead.

Layout:
- 12-column grid.
- Use 3 or 4 spans for compact KPI cards.
- Use 5, 6, 7, or 8 spans for charts/lenses.
- Use 12 spans for source audit or full-width proof sections.
- Prefer 4 to 6 blocks. Do not dump everything.
- Every string must be a complete phrase or sentence. Never stop mid-sentence.
- For kpi blocks, metric must be non-null. For non-kpi blocks, metric must be null.
- For indicatorStrip blocks, fill indicators with 2 to 4 relevant indicator keys from DATA CONTEXT. For other blocks, indicators must be [].

Intent routing:
- investment: invest, buy, rent, gold, USD, real estate, stock, savings, portfolio.
- budget: budget, spending, revenue, deficit, fiscal pressure.
- debt: debt, loans, external/domestic, debt-to-GDP.
- government: ministries, parliament, governorates, constitution, who runs what.
- sources: trust, source, freshness, audit, pipeline.
- comparison: compare two or more domains.
- overview: only when the user is genuinely broad or vague.`;

export const planGrid = action({
  args: {
    prompt: v.string(),
    lang: v.union(v.literal("en"), v.literal("ar")),
    history: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })),
    currentView: v.optional(v.object({
      title: v.string(),
      intent: v.string(),
      language: v.string(),
      answer: v.string(),
      blocks: v.array(v.object({
        id: v.string(),
        kind: v.string(),
        span: v.number(),
        metric: v.optional(v.string()),
        title: v.string(),
        description: v.string(),
        indicators: v.array(v.string()),
      })),
      suggestions: v.array(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<UiGridPlan & { planner: "llm"; model: string }> => {
    assertDeepSeekConfigured();

    const dataContext = await ctx.runQuery(internal.uiData.getUiContext, {});
    const system = [
      `Application language: ${args.lang === "ar" ? "Arabic" : "English"}. Use this language for every visible string, even when the user's prompt is written in another language.`,
      "DATA CONTEXT:",
      JSON.stringify(dataContext),
      "CURRENT VIEW:",
      JSON.stringify(args.currentView ?? null),
      args.currentView
        ? "STATE RULE: The user is continuing an existing generated page. Preserve existing blocks as durable page memory. For append, return only new block ids not already present in CURRENT VIEW. Use update only when revising named existing blocks. Use focus when existing blocks already answer the follow-up. Use replace only for reset/start over/new page."
        : "STATE RULE: No existing page is active. Use replace for the first generated page.",
      "RECENT CHAT:",
      JSON.stringify(args.history.slice(-8)),
    ].join("\n");

    const result = await generateObject({
      model: deepseekChatModel,
      schema: uiGridPlanSchema,
      schemaName: "mizan_ui_grid_plan",
      schemaDescription: "A deterministic typed Mizan UI grid plan rendered by the app.",
      experimental_repairText: ({ text }) => repairUiGridPlanText(text, args.lang, args.currentView),
      system: `${UI_PLANNER_SYSTEM}\n\n${system}`,
      prompt: args.prompt,
      temperature: 0.35,
      maxOutputTokens: 3500,
    });

    const inTok = result.usage.inputTokens ?? 0;
    const outTok = result.usage.outputTokens ?? 0;
    await ctx.runMutation(internal.guideAnalytics.logUsage, {
      userId: "anonymous",
      threadId: "home-ui",
      model: DEEPSEEK_MODEL,
      provider: "deepseek",
      promptTokens: inTok,
      completionTokens: outTok,
      totalTokens: result.usage.totalTokens ?? inTok + outTok,
      costUsd: estimateCost(DEEPSEEK_MODEL, inTok, outTok),
      timestamp: Date.now(),
    });

    const normalized = {
      ...normalizeGridPlan(result.object),
      language: args.lang,
    };
    const operation = args.currentView && normalized.operation === "replace" && !hasFreshStartIntent(args.prompt)
      ? "update"
      : !args.currentView && normalized.operation !== "replace"
        ? "replace"
        : normalized.operation;

    return {
      ...normalized,
      operation,
      planner: "llm",
      model: DEEPSEEK_MODEL,
    };
  },
});
