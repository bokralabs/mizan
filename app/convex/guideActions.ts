"use node";

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";
import { estimateCost } from "./lib/tokenCost";

const GUIDE_MODEL = process.env.GUIDE_MODEL ?? "gpt-4.1-mini";

const VALID_PAGES = [
  "/economy", "/budget", "/debt", "/government", "/parliament",
  "/constitution", "/elections", "/governorate", "/polls",
  "/tools/tax-calculator", "/tools/buy-vs-rent", "/tools/invest", "/tools/mashroaak",
  "/transparency", "/methodology", "/funding",
] as const;

const ALL_SELECTORS = [
  "salary-input", "tax-summary", "tax-chart", "tax-categories",
  "capital", "horizon", "allocation", "output",
  "bvr-basics", "bvr-financing", "verdict", "bvr-breakdown",
  "mashroaak-tabs", "capital-input", "mashroaak-filters", "mashroaak-results",
  "econ-indicators", "gdp-chart", "inflation-chart", "exchange-rate",
  "budget-summary", "budget-deficit", "budget-flow", "budget-comparison",
  "debt-total", "debt-gdp-ratio", "debt-chart", "debt-creditors",
  "president", "cabinet", "governorates-list",
  "party-chart",
  "search", "articles-list",
] as const;

const TOOL_NAMES = [
  "calculate_egypt_tax",
  "simulate_egypt_investment",
  "compare_buy_vs_rent",
  "search_egypt_investment_opportunities",
] as const;

const PAGE_CONTEXT: Record<string, { selectors: string[]; tools: string[] }> = {
  "/tools/tax-calculator": { selectors: ["salary-input", "tax-summary", "tax-chart", "tax-categories"], tools: ["calculate_egypt_tax"] },
  "/tools/invest": { selectors: ["capital", "horizon", "allocation", "output"], tools: ["simulate_egypt_investment"] },
  "/tools/buy-vs-rent": { selectors: ["bvr-basics", "bvr-financing", "verdict", "bvr-breakdown"], tools: ["compare_buy_vs_rent"] },
  "/tools/mashroaak": { selectors: ["mashroaak-tabs", "capital-input", "mashroaak-filters", "mashroaak-results"], tools: ["search_egypt_investment_opportunities"] },
  "/economy": { selectors: ["econ-indicators", "gdp-chart", "inflation-chart", "exchange-rate"], tools: [] },
  "/budget": { selectors: ["budget-summary", "budget-deficit", "budget-flow", "budget-comparison"], tools: [] },
  "/debt": { selectors: ["debt-total", "debt-gdp-ratio", "debt-chart", "debt-creditors"], tools: [] },
  "/government": { selectors: ["president", "cabinet", "governorates-list"], tools: [] },
  "/parliament": { selectors: ["party-chart"], tools: [] },
  "/constitution": { selectors: ["search", "articles-list"], tools: [] },
};

const rawGuideActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("navigate"),
    href: z.enum(VALID_PAGES),
    reason: z.string().min(2).max(180),
  }),
  z.object({
    action: z.literal("highlight"),
    selector: z.enum(ALL_SELECTORS),
    title: z.string().min(2).max(80),
    description: z.string().min(2).max(220),
  }),
  z.object({
    action: z.literal("control"),
    tool: z.enum(TOOL_NAMES),
    inputs: z.record(z.string(), z.unknown()),
    href: z.enum(["/tools/tax-calculator", "/tools/buy-vs-rent", "/tools/invest", "/tools/mashroaak"]),
  }),
  z.object({
    action: z.literal("ask"),
    question: z.string().min(2).max(180),
  }),
]);

const guideResponseSchema = z.object({
  text: z.string().min(2).max(220),
  actions: z.array(rawGuideActionSchema).min(1).max(3),
});

type RawGuideAction = z.infer<typeof rawGuideActionSchema>;

type GuideAction =
  | { action: "navigate"; href: string; reason: string }
  | { action: "highlight"; selector: string; title: string; description: string }
  | { action: "control"; tool: string; inputs: Record<string, unknown>; href: string }
  | { action: "ask"; question: string };

function normalizeGuideAction(action: RawGuideAction): GuideAction {
  if (action.action === "highlight") {
    return {
      action: "highlight",
      selector: `[data-guide='${action.selector}']`,
      title: action.title,
      description: action.description,
    };
  }

  return action;
}

function buildContext(currentPage: string | undefined, lang: string | undefined): string {
  const page = currentPage ?? "/";
  const pageCtx = PAGE_CONTEXT[page];
  const selectors = pageCtx?.selectors ?? [];
  const tools = pageCtx?.tools ?? [];

  return [
    lang === "ar"
      ? "User language: Arabic. Respond in Arabic."
      : "User language: English. Respond in English.",
    `Current page: ${page}`,
    selectors.length > 0
      ? `Available selectors on this page: ${selectors.join(", ")}`
      : "No highlightable selectors on this page.",
    tools.length > 0
      ? `Available controllable tools on this page: ${tools.join(", ")}`
      : "No controllable tools on this page.",
  ].join("\n");
}

const GUIDE_SYSTEM = `You are the Mizan Guide. You help users explore Egypt's government transparency platform.

Return a short visible reply and 1 to 3 typed UI actions. Never return hidden chain-of-thought.

Action patterns:
- If the user wants a different page, return navigate.
- If the user asks about something visible on the current page, return highlight.
- If the user wants to use a calculator/tool and you need a value, return ask.
- If the user gave enough values for a tool, return control and then, when useful, highlight the output selector.

Rules:
- Use selectors only when they are available on the current page context.
- Use control only for supported tool pages.
- Keep text to one short sentence.
- Match the user's language.`;

export const createThread = action({
  args: {},
  handler: async () => {
    return crypto.randomUUID();
  },
});

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    lang: v.optional(v.string()),
    currentPage: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, prompt, lang, currentPage }) => {
    try {
      const result = await generateObject({
        model: openai(GUIDE_MODEL),
        schema: guideResponseSchema,
        schemaName: "mizan_guide_response",
        schemaDescription: "A short guide response plus deterministic UI actions.",
        system: `${GUIDE_SYSTEM}\n\n${buildContext(currentPage, lang)}`,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 900,
      });

      const actions = result.object.actions.map(normalizeGuideAction);
      await ctx.runMutation(internal.guide.storeAssistantMessage, {
        threadId,
        text: result.object.text,
        actions,
      });

      const inTok = result.usage.inputTokens ?? 0;
      const outTok = result.usage.outputTokens ?? 0;
      await ctx.runMutation(internal.guideAnalytics.logUsage, {
        userId: "anonymous",
        threadId,
        model: GUIDE_MODEL,
        provider: "openai",
        promptTokens: inTok,
        completionTokens: outTok,
        totalTokens: result.usage.totalTokens ?? inTok + outTok,
        costUsd: estimateCost(GUIDE_MODEL, inTok, outTok),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[guide] AI SDK response failed", error);
      await ctx.runMutation(internal.guide.storeAssistantMessage, {
        threadId,
        text: lang === "ar"
          ? "تعذر تشغيل المرشد الآن."
          : "The guide could not respond right now.",
        actions: [{
          action: "ask",
          question: lang === "ar"
            ? "جرّب صياغة السؤال بشكل أقصر."
            : "Try asking a shorter question.",
        }],
      });
    }
  },
});
