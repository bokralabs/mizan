import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMizanCapabilityContext } from "@/lib/mizan-capability-catalog";
import {
  MIZAN_GENERATIVE_CATALOG_PROMPT,
  ensureInvestmentSimulator,
  langSchema,
  looseMizanJsonSpecSchema,
  makePromptFallbackSpec,
  mizanJsonSpecSchema,
  normalizeMizanSpec,
  type Lang,
} from "@/lib/mizan-generative-spec";

export const runtime = "nodejs";

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_THINKING = process.env.DEEPSEEK_THINKING === "enabled";
const OPENAI_MODEL = process.env.MIZAN_UI_OPENAI_MODEL ?? "gpt-4.1-mini";

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1200),
});

const requestSchema = z.object({
  prompt: z.string().min(1).max(1200),
  lang: langSchema,
  history: z.array(historyItemSchema).max(12).optional(),
  currentSpec: mizanJsonSpecSchema.nullable().optional(),
  dataContext: z.unknown().optional(),
});

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

  if (!target) {
    body.messages = [{ role: "system", content: instruction }, ...messages];
    return;
  }

  if (typeof target.content === "string") {
    target.content = `${target.content}\n\n${instruction}`;
    return;
  }

  if (Array.isArray(target.content)) {
    target.content = [...target.content, { type: "text", text: instruction }];
  }
}

function adaptStructuredOutputForDeepSeek(body: Record<string, unknown>): void {
  const responseFormat = body.response_format;
  if (!isRecord(responseFormat) || responseFormat.type === "json_object") return;

  const schemaContainer = isRecord(responseFormat.json_schema)
    ? responseFormat.json_schema
    : responseFormat;
  const schema = "schema" in schemaContainer ? schemaContainer.schema : schemaContainer;

  body.response_format = { type: "json_object" };
  if (body.max_tokens == null && body.max_completion_tokens == null) {
    body.max_tokens = 3600;
  }

  appendSystemInstruction(
    body,
    [
      "Return JSON only. Do not include Markdown, prose, comments, or code fences.",
      "The JSON object must validate this schema:",
      JSON.stringify(schema),
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

function buildPrompt(body: z.infer<typeof requestSchema>): string {
  const capabilityContext = buildMizanCapabilityContext(body.dataContext, body.prompt);
  return [
    `User language: ${body.lang === "ar" ? "Arabic" : "English"}.`,
    "Available Mizan capabilities and data scan:",
    JSON.stringify(capabilityContext),
    "Recent chat:",
    JSON.stringify(body.history ?? []),
    "Current json-render spec:",
    body.currentSpec ? JSON.stringify(body.currentSpec) : "null",
    "Mizan data context:",
    body.dataContext ? JSON.stringify(body.dataContext) : "null",
    "User prompt:",
    body.prompt,
  ].join("\n\n");
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function repairSpecText(text: string, lang: Lang, prompt: string): string {
  const extracted = extractJsonObject(text);
  if (extracted === null) {
    return JSON.stringify(makePromptFallbackSpec(lang, prompt));
  }
  const spec = normalizeMizanSpec(extracted, lang);
  return JSON.stringify(spec.state?.fallback || isSparseSpec(spec) ? makePromptFallbackSpec(lang, prompt) : spec);
}

function isSparseSpec(spec: ReturnType<typeof normalizeMizanSpec>): boolean {
  const contentCount = Object.values(spec.elements).filter((item) => (
    item.type !== "MizanBoard"
    && item.type !== "MizanGrid"
    && item.type !== "Suggestions"
  )).length;
  return contentCount === 0;
}

function hasSourceTrustIntent(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(source|sources|trust|trusted|sanad|citation|citations|reliable|reliability|verify|verification)\b/.test(normalized)
    || /مصدر|مصادر|ثقة|سند|موثوق|موثوقة|تحقق|توثيق/.test(prompt);
}

function hasDebtComparisonIntent(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return (
    /\b(compare|comparison|versus|vs)\b/.test(normalized)
    || /قارن|مقارنة|مقابل/.test(prompt)
  ) && (
    /\b(debt|external|domestic)\b/.test(normalized)
    || /دين|خارجي|محلي/.test(prompt)
  );
}

function hasInvestmentIntent(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(invest|investment|portfolio|return|yield|treasury|t-?bill|certificate|cd|gold|egx|stock|stocks|real estate|mortgage|asset|assets|where should i put|where should i invest)\b/.test(normalized)
    || /\b(test|simulate|scenario|project|projection|try|run)\b.*\b(egp|e£|years?|yrs?|k|m|million)\b/.test(normalized)
    || /استثمار|استثمر|استثمرت|محفظة|عائد|عوائد|ذهب|بورصة|أسهم|عقار|شهادات|أذون|خزانة|تمويل عقاري/.test(prompt);
}

function isSourceTrustSpec(spec: ReturnType<typeof normalizeMizanSpec>): boolean {
  if (spec.state?.intent === "sources") return true;
  const root = spec.elements[spec.root];
  if (
    root?.type === "MizanBoard"
    && /\b(source|sources|sanad|reliability|trust)\b|مصدر|مصادر|سند|موثوق/.test(`${root.props.title} ${root.props.summary}`.toLowerCase())
  ) {
    return true;
  }
  return Object.values(spec.elements).some((item) => (
    item.type === "Callout"
    && /\b(source|sources|sanad|reliability|trust)\b|مصدر|مصادر|سند|موثوق/.test(`${item.props.title} ${item.props.body}`.toLowerCase())
  ));
}

function isDebtComparisonSpec(spec: ReturnType<typeof normalizeMizanSpec>): boolean {
  if (spec.state?.intent === "debt-comparison") return true;
  const root = spec.elements[spec.root];
  const rootText = root?.type === "MizanBoard"
    ? `${root.props.title} ${root.props.summary}`.toLowerCase()
    : "";
  const hasComparisonFrame = /\b(compare|comparison|versus|vs|external.+domestic|domestic.+external)\b/.test(rootText)
    || /قارن|مقارنة|مقابل|خارجي.+محلي|محلي.+خارجي/.test(rootText);
  const values = Object.values(spec.elements);
  const hasSplit = values.some((item) => item.type === "DebtSplit");
  const hasExternal = values.some((item) => item.type === "MetricCard" && item.props.metric === "externalDebt");
  const hasDomestic = values.some((item) => item.type === "MetricCard" && item.props.metric === "domesticDebt");
  return hasComparisonFrame && hasSplit && hasExternal && hasDomestic;
}

function isInvestmentSpec(spec: ReturnType<typeof normalizeMizanSpec>): boolean {
  if (spec.state?.intent === "investment") return true;
  const root = spec.elements[spec.root];
  const rootText = root?.type === "MizanBoard"
    ? `${root.props.title} ${root.props.summary}`.toLowerCase()
    : "";
  const hasInvestmentFrame = /\b(invest|investment|portfolio|returns?|yield|risk|indicator|scenario|asset)\b/.test(rootText)
    || /استثمار|محفظة|عائد|مخاطر|مؤشر|سيناريو|أصل/.test(rootText);
  const values = Object.values(spec.elements);
  const hasInvestmentPrimitive = values.some((item) => (
    item.type === "IndicatorStrip"
    || item.type === "ToolSimulator"
    || item.type === "ToolLaunch"
    || (item.type === "SourceList" && item.props.sources.includes("investmentIndicators"))
    || (item.type === "ActionLinks" && item.props.links.some((link) => link.href === "/tools/invest" || link.href === "/tools/mashroaak"))
  ));
  return hasInvestmentFrame && hasInvestmentPrimitive;
}

function responsePayloadForSpec(
  spec: ReturnType<typeof normalizeMizanSpec>,
  provider: string,
  modelName: string,
  usage?: unknown,
) {
  const rootElement = spec.elements[spec.root];
  return {
    text: rootElement?.type === "MizanBoard" ? rootElement.props.summary : "",
    spec,
    provider,
    model: modelName,
    usage,
  };
}

const SYSTEM_PROMPT = [
  "You are the Mizan-owned generative UI harness.",
  "You use the Vercel AI SDK as a library only. No Vercel-hosted runtime, no Sandbox, no HarnessAgent.",
  "Your output is a deterministic json-render spec consumed by Mizan React components.",
  MIZAN_GENERATIVE_CATALOG_PROMPT,
].join("\n\n");

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid generative UI request." }, { status: 400 });
  }

  try {
    const { model, provider, modelName } = modelConfig();
    const result = await generateObject({
      model,
      schema: looseMizanJsonSpecSchema,
      schemaName: "mizan_json_render_spec",
      schemaDescription: "A Mizan json-render flat spec using only the allowed catalog components.",
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(body),
      temperature: 0.2,
      maxOutputTokens: 3600,
      experimental_repairText: async ({ text }) => repairSpecText(text, body.lang, body.prompt),
    });

    const candidateSpec = normalizeMizanSpec(result.object, body.lang);
    const normalizedSpec = candidateSpec.state?.fallback || isSparseSpec(candidateSpec)
      ? makePromptFallbackSpec(body.lang, body.prompt)
      : candidateSpec;
    let responseSpec = normalizedSpec;
    if (hasSourceTrustIntent(body.prompt) && !isSourceTrustSpec(responseSpec)) {
      responseSpec = makePromptFallbackSpec(body.lang, body.prompt);
    }
    if (hasDebtComparisonIntent(body.prompt) && !isDebtComparisonSpec(responseSpec)) {
      responseSpec = makePromptFallbackSpec(body.lang, body.prompt);
    }
    if (hasInvestmentIntent(body.prompt) && !isInvestmentSpec(responseSpec)) {
      responseSpec = makePromptFallbackSpec(body.lang, body.prompt);
    }
    responseSpec = ensureInvestmentSimulator(responseSpec, body.prompt, body.lang);

    return NextResponse.json(responsePayloadForSpec(responseSpec, provider, modelName, result.usage));
  } catch {
    const fallbackSpec = makePromptFallbackSpec(body.lang, body.prompt);
    return NextResponse.json(responsePayloadForSpec(fallbackSpec, "deterministic-fallback", "mizan-catalog"));
  }
}
