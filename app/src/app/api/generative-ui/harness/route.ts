import { createOpenAI, openai } from "@ai-sdk/openai";
import { createParser } from "@openuidev/lang-core";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  inferOpenUiPromptIntent,
  mizanOpenUiPromptLibrary,
  openUiFallbackProgram,
} from "@/lib/mizan-openui-contract";
import { MIZAN_OPENUI_TOOL_SPECS, type Lang } from "@/lib/mizan-openui-tools";

export const runtime = "nodejs";

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_THINKING = process.env.DEEPSEEK_THINKING === "enabled";
const OPENAI_MODEL = process.env.MIZAN_UI_OPENAI_MODEL ?? "gpt-4.1-mini";

const langSchema = z.enum(["en", "ar"]);

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1600),
});

const requestSchema = z.object({
  prompt: z.string().min(1).max(1600),
  lang: langSchema,
  history: z.array(historyItemSchema).max(12).optional(),
  currentCode: z.string().max(24000).nullable().optional(),
  dataContext: z.unknown().optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function deepseekFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof init?.body !== "string") {
    return fetch(input, init);
  }

  try {
    const body: unknown = JSON.parse(init.body);
    if (isRecord(body) && !DEEPSEEK_THINKING) {
      return fetch(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          thinking: { type: "disabled" },
        }),
      });
    }
  } catch {
    // Let the provider handle non-JSON request bodies unchanged.
  }

  return fetch(input, init);
}

function modelConfig() {
  if (process.env.DEEPSEEK_API_KEY) {
    const deepseek = createOpenAI({
      name: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
      fetch: deepseekFetch,
    });
    return {
      model: deepseek.chat(DEEPSEEK_MODEL),
      provider: "deepseek",
      modelName: DEEPSEEK_MODEL,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      model: openai(OPENAI_MODEL),
      provider: "openai",
      modelName: OPENAI_MODEL,
    };
  }

  throw new Error("Set DEEPSEEK_API_KEY or OPENAI_API_KEY for the Mizan generative UI harness.");
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:openui-lang|openui|text)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function hasUsableRoot(code: string): boolean {
  try {
    const parser = createParser(mizanOpenUiPromptLibrary.toJSONSchema());
    const parsed = parser.parse(code);
    const blockingErrorCodes = new Set<string>([
      "unknown-component",
      "missing-required",
      "null-required",
    ]);
    const blockingErrors = parsed.meta.errors.filter((error) => blockingErrorCodes.has(error.code));
    return parsed.root !== null && blockingErrors.length === 0;
  } catch {
    return false;
  }
}

function programMatchesPromptIntent(code: string, prompt: string): boolean {
  const intent = inferOpenUiPromptIntent(prompt);
  if (intent === "investmentScenario") return code.includes("mizan_simulate_investment");
  if (intent === "investment") return (code.includes("investment") || code.includes("mizan_indicators") || code.includes("mizan_simulate_investment")) && (code.includes("BarChart") || code.includes("ScenarioTool"));
  if (intent === "debt") return (code.includes("debt") || code.includes("دين")) && code.includes("BarChart");
  if (intent === "budget") return (code.includes("budget") || code.includes("موازنة")) && code.includes("BarChart");
  if (intent === "sources") return code.includes("sources") || code.includes("مصادر");
  if (intent === "institutions") return (code.includes("institutions") || code.includes("government") || code.includes("parliament") || code.includes("حكومة") || code.includes("برلمان")) && code.includes("BarChart");
  return true;
}

function normalizeOpenUiCode(rawText: string, lang: Lang, prompt: string): string {
  const candidate = stripCodeFence(rawText);
  if (!hasUsableRoot(candidate)) return openUiFallbackProgram(prompt, lang);
  return programMatchesPromptIntent(candidate, prompt) ? candidate : openUiFallbackProgram(prompt, lang);
}

function buildSystemPrompt(hasCurrentCode: boolean): string {
  return mizanOpenUiPromptLibrary.prompt({
    tools: MIZAN_OPENUI_TOOL_SPECS,
    toolCalls: true,
    bindings: true,
    editMode: false,
    preamble:
      "You are Mizan's OpenUI generative interface. You generate shadcn-style OpenUI Lang for Egypt public-data exploration.",
    additionalRules: [
      "Your whole answer must be OpenUI Lang statements only. No Markdown, no prose, no JSX, no JSON.",
      "For Mizan, never generate realistic or plausible public-data numbers as literals. Factual and numeric UI must come from Query() calls to the listed Mizan tools or from explicit user input.",
      "Use Query(\"mizan_search\", ...) for most questions. Use mizan_indicators for focused indicator lists and mizan_simulate_investment for scenario calculations.",
      "Do not use @OpenUrl, internal app routes, path names, or navigation as the main answer. Follow-up actions should use PromptActions and continue the conversation.",
      "Use generic shadcn-style components from the component list. The user should feel the entire surface can be regenerated, not that they are being sent to a fixed page.",
      "Never put implementation details in visible UI strings. Do not mention OpenUI, OpenUI Lang, Query(), tool names, model names, provider names, or internal ids. Brand the visible product as Mizan.",
      "Every source-aware block should receive source rows or source fields from Query results. Prefer SourceList(data.sources) when the user asks about trust or provenance.",
      "If a Query result includes a non-empty series array, include BarChart near the top of the view. Do not answer with only metric cards and tables when series data exists.",
      "Use empty arrays and short labels as Query defaults. Do not copy hidden availability context into user-facing facts.",
      "Investment prompts must produce scenario, risk, inflation, exchange-rate, or indicator context. Do not recommend a specific asset or allocation.",
      "For prompts about simulation, sliders, changing capital, changing horizon, testing scenarios, or comparing investment cases, use ScenarioTool with mizan_simulate_investment results. Do not approximate sliders with a plain DataTable.",
      "Use richer shadcn-backed primitives when they fit: ScenarioTool for what-if tools with projection graphs, BarChart for visual comparisons, ComparisonMatrix for comparisons, AssumptionPanel for assumptions, NarrativeTabs for compact alternate views, EvidencePanel for evidence trails, SourceQualityPanel for trust filters, and Timeline for ordered events or process steps.",
      hasCurrentCode
        ? "There is an existing generated view on the page. Do not rewrite or include it. Return a standalone view for the new turn; the client appends it below the existing views."
        : "Return a standalone view for this first generated turn.",
      "If the user asks a follow-up, generate the next focused view for that request unless they explicitly ask to reset.",
    ],
    toolExamples: [
      [
        "root = Workspace([status, header, metrics, chart, table, sources, next], \"Mizan\", \"Sourced data view\", \"en\")",
        "data = Query(\"mizan_search\", {query: \"debt and budget\", lang: \"en\", domain: \"auto\"}, {title: \"Mizan data\", summary: \"\", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)",
        "status = QueryStatus()",
        "header = Section(data.title, data.summary, [], \"default\")",
        "metrics = Grid(@Each(data.metrics, \"m\", Metric(m.label, m.value, m.detail, m.sourceLabel, m.sourceUrl, m.confidence)), 3)",
        "chart = BarChart(\"Visual comparison\", data.series, \"label\", \"value\")",
        "table = DataTable(\"Rows\", data.rows)",
        "sources = SourceList(\"Sources\", data.sources)",
        "next = PromptActions(data.prompts)",
      ].join("\n"),
      [
        "root = Workspace([status, tool, next], \"Mizan\", \"Scenario context, not advice\", \"en\")",
        "scenario = Query(\"mizan_simulate_investment\", {capitalEgp: 100000, horizonYears: 5, strategies: [\"balanced\", \"fixedIncome\", \"egyptianGrowth\"], lang: \"en\"}, {title: \"Scenario\", summary: \"\", rows: [], series: [], sources: [], insights: [], prompts: []})",
        "status = QueryStatus()",
        "tool = ScenarioTool(scenario.title, scenario.summary, scenario.rows, scenario.series, scenario.sources, scenario.insights, 100000, 10000, 5000000, 10000, 5, 1, 30)",
        "next = PromptActions(scenario.prompts)",
      ].join("\n"),
      [
        "root = Workspace([status, quality, evidence, next], \"Mizan\", \"Source quality view\", \"en\")",
        "data = Query(\"mizan_search\", {query: \"are the sources reliable\", lang: \"en\", domain: \"sources\"}, {title: \"Sources\", summary: \"\", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)",
        "status = QueryStatus()",
        "quality = SourceQualityPanel(\"Source quality\", data.sources)",
        "evidence = EvidencePanel(\"Evidence rows\", data.summary, data.rows, data.sources)",
        "next = PromptActions(data.prompts)",
      ].join("\n"),
    ],
  });
}

function buildPrompt(body: z.infer<typeof requestSchema>): string {
  return [
    `User language: ${body.lang === "ar" ? "Arabic" : "English"}.`,
    "Data availability context, for choosing tools only:",
    JSON.stringify(body.dataContext ?? null),
    "Recent chat:",
    JSON.stringify(body.history ?? []),
    "Current OpenUI Lang program:",
    body.currentCode?.trim() ? body.currentCode : "null",
    "User prompt:",
    body.prompt,
  ].join("\n\n");
}

function responsePayloadForCode(
  code: string,
  provider: string,
  modelName: string,
  usage?: unknown,
) {
  return {
    text: "Rendered.",
    code,
    provider,
    model: modelName,
    usage,
  };
}

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid generative UI request." }, { status: 400 });
  }

  try {
    const { model, provider, modelName } = modelConfig();
    const result = await generateText({
      model,
      system: buildSystemPrompt(Boolean(body.currentCode?.trim())),
      prompt: buildPrompt(body),
      temperature: 0.15,
      maxOutputTokens: 4200,
    });
    const code = normalizeOpenUiCode(result.text, body.lang, body.prompt);

    return NextResponse.json(responsePayloadForCode(code, provider, modelName, result.usage));
  } catch {
    const fallbackCode = openUiFallbackProgram(body.prompt, body.lang);
    return NextResponse.json(responsePayloadForCode(fallbackCode, "openui-fallback", "mizan-openui-harness"));
  }
}
