"use node";
// Provider registry for the Mizan data pipeline.
//
// This layer intentionally uses the Vercel AI SDK directly. The pipeline keeps
// the same provider-agnostic interface, but no longer uses raw provider fetch
// modules for LLM calls.

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import { generateObject, generateText, jsonSchema, type LanguageModel, type ToolSet } from "ai";
import type { JSONSchema7 } from "@ai-sdk/provider";
import type { LLMProvider, LLMCallResult, ToolSchema, ServerToolDef, CouncilEvaluationContext, CouncilVoteResult } from "./types";
import { COUNCIL_SYSTEM_PROMPT, buildCouncilPrompt } from "./councilPrompt";
import { CouncilVoteSchema, zodToToolSchema } from "../schemas";

type ProviderName = "xai" | "openai" | "anthropic" | "google" | "openrouter";

export interface ProviderConfig {
  name: string;
  model: string;
}

type ProviderEntry = {
  name: ProviderName;
  envKey: string;
  modelEnvKey?: string;
  defaultModel: string;
  supportsServerTools: boolean;
  model: (modelId: string) => LanguageModel;
  tools?: (serverTools: ServerToolDef[]) => ToolSet;
};

const COUNCIL_VOTE_TOOL = zodToToolSchema(
  "submit_council_vote",
  "Submit a structured council vote evaluating a proposed data change for the Mizan platform.",
  CouncilVoteSchema,
);

function openRouter(modelId: string): LanguageModel {
  return createOpenAI({
    name: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseURL: "https://openrouter.ai/api/v1",
  }).chat(modelId);
}

function toJsonSchema<T>(schema: ToolSchema) {
  return jsonSchema<T>(schema.input_schema as unknown as JSONSchema7);
}

function usageFromResult(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  model: string,
  startedAt: number,
): LLMCallResult["usage"] {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    model,
    durationMs: Date.now() - startedAt,
  };
}

function anthropicTools(serverTools: ServerToolDef[]): ToolSet {
  const tools: ToolSet = {};

  for (const serverTool of serverTools) {
    if (serverTool.name === "web_search" || serverTool.type.startsWith("web_search")) {
      tools.web_search = anthropic.tools.webSearch_20250305({
        maxUses: serverTool.max_uses,
        allowedDomains: serverTool.allowed_domains,
        blockedDomains: serverTool.blocked_domains,
      });
    }

    if (serverTool.name === "web_fetch" || serverTool.type.startsWith("web_fetch")) {
      tools.web_fetch = anthropic.tools.webFetch_20250910({
        maxUses: serverTool.max_uses,
        allowedDomains: serverTool.allowed_domains,
        blockedDomains: serverTool.blocked_domains,
        maxContentTokens: serverTool.max_content_tokens,
      });
    }
  }

  return tools;
}

function xaiTools(serverTools: ServerToolDef[]): ToolSet {
  const tools: ToolSet = {};
  const searchTool = serverTools.find((tool) => (
    tool.name === "web_search"
    || tool.type.startsWith("web_search")
    || tool.name === "web_fetch"
    || tool.type.startsWith("web_fetch")
  ));

  if (searchTool) {
    tools.web_search = xai.tools.webSearch({
      allowedDomains: searchTool.allowed_domains,
      excludedDomains: searchTool.blocked_domains,
    });
  }

  return tools;
}

const PROVIDER_REGISTRY: ProviderEntry[] = [
  {
    name: "xai",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-4-1-fast-reasoning",
    supportsServerTools: true,
    model: (modelId) => xai(modelId),
    tools: xaiTools,
  },
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    supportsServerTools: false,
    model: (modelId) => openai(modelId),
  },
  {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
    supportsServerTools: true,
    model: (modelId) => anthropic(modelId),
    tools: anthropicTools,
  },
  {
    name: "google",
    envKey: "GOOGLE_AI_API_KEY",
    defaultModel: "gemini-2.0-flash",
    supportsServerTools: false,
    model: (modelId) => google(modelId),
  },
  {
    name: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    modelEnvKey: "OPENROUTER_MODEL",
    defaultModel: "meta-llama/llama-4-scout",
    supportsServerTools: false,
    model: openRouter,
  },
];

function configuredModel(entry: ProviderEntry): string {
  return (entry.modelEnvKey && process.env[entry.modelEnvKey]) || entry.defaultModel;
}

function providerFromEntry(entry: ProviderEntry): LLMProvider {
  const model = configuredModel(entry);
  const languageModel = () => entry.model(model);

  return {
    name: entry.name,
    supportsServerTools: entry.supportsServerTools,

    async callLLM(prompt, systemPrompt) {
      const result = await this.callLLMWithUsage(prompt, systemPrompt);
      return result.text;
    },

    async callLLMStructured<T>(prompt: string, schema: ToolSchema, systemPrompt?: string): Promise<T | null> {
      const { result } = await this.callLLMStructuredWithUsage<T>(prompt, schema, systemPrompt);
      return result;
    },

    async callLLMWithUsage(prompt, systemPrompt) {
      const startedAt = Date.now();
      try {
        const result = await generateText({
          model: languageModel(),
          system: systemPrompt,
          prompt,
          maxOutputTokens: 4096,
        });

        return {
          text: result.text,
          usage: usageFromResult(result.usage, model, startedAt),
        };
      } catch (error) {
        console.error(`[${entry.name}] AI SDK text call failed`, error);
        return { text: null, usage: null };
      }
    },

    async callLLMStructuredWithUsage<T>(
      prompt: string,
      schema: ToolSchema,
      systemPrompt?: string,
    ): Promise<{ result: T | null; usage: LLMCallResult["usage"] }> {
      const startedAt = Date.now();
      try {
        const result = await generateObject({
          model: languageModel(),
          schema: toJsonSchema<T>(schema),
          schemaName: schema.name,
          schemaDescription: schema.description,
          system: systemPrompt,
          prompt,
          maxOutputTokens: 4096,
        });

        return {
          result: result.object as T,
          usage: usageFromResult(result.usage, model, startedAt),
        };
      } catch (error) {
        console.error(`[${entry.name}] AI SDK structured call failed`, error);
        return { result: null, usage: null };
      }
    },

    async evaluateDataChange(context: CouncilEvaluationContext): Promise<CouncilVoteResult | null> {
      const { result } = await this.callLLMStructuredWithUsage<unknown>(
        buildCouncilPrompt(context),
        COUNCIL_VOTE_TOOL,
        COUNCIL_SYSTEM_PROMPT,
      );
      if (!result) return null;

      const verified = CouncilVoteSchema.safeParse(result);
      if (!verified.success) {
        console.error(
          `[${entry.name}/council] Zod validation failed:`,
          verified.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
        );
        return null;
      }

      return verified.data;
    },

    async callLLMWithServerTools(prompt, serverTools, systemPrompt) {
      if (!entry.tools) return { text: null, usage: null };

      const startedAt = Date.now();
      try {
        const result = await generateText({
          model: languageModel(),
          system: systemPrompt,
          prompt,
          tools: entry.tools(serverTools),
          maxOutputTokens: 8192,
        });

        return {
          text: result.text,
          usage: usageFromResult(result.usage, model, startedAt),
        };
      } catch (error) {
        console.error(`[${entry.name}] AI SDK server-tools call failed`, error);
        return { text: null, usage: null };
      }
    },

    async callLLMWebResearchStructured<T>(
      researchPrompt: string,
      serverTools: ServerToolDef[],
      schema: ToolSchema,
      parsePrompt?: string,
      systemPrompt?: string,
    ): Promise<{ result: T | null; usage: LLMCallResult["usage"]; rawResearch: string | null }> {
      const researchResult = await this.callLLMWithServerTools(researchPrompt, serverTools, systemPrompt);
      if (!researchResult.text) {
        return { result: null, usage: researchResult.usage, rawResearch: null };
      }

      const structuredResult = await this.callLLMStructuredWithUsage<T>(
        parsePrompt
          ? `${parsePrompt}\n\n## RAW RESEARCH DATA:\n${researchResult.text}`
          : `Parse the following research data into the required structured format.\n\n## RAW RESEARCH DATA:\n${researchResult.text}`,
        schema,
        "Extract structured data from the research results. Be precise and thorough.",
      );

      const combinedUsage: LLMCallResult["usage"] = (researchResult.usage && structuredResult.usage)
        ? {
            inputTokens: researchResult.usage.inputTokens + structuredResult.usage.inputTokens,
            outputTokens: researchResult.usage.outputTokens + structuredResult.usage.outputTokens,
            model: researchResult.usage.model,
            durationMs: researchResult.usage.durationMs + structuredResult.usage.durationMs,
          }
        : researchResult.usage ?? structuredResult.usage;

      return {
        result: structuredResult.result,
        usage: combinedUsage,
        rawResearch: researchResult.text,
      };
    },
  };
}

export function getActiveProviders(): Array<ProviderConfig & { provider: LLMProvider }> {
  return PROVIDER_REGISTRY
    .filter((entry) => !!process.env[entry.envKey])
    .map((entry) => ({
      name: entry.name,
      model: configuredModel(entry),
      provider: providerFromEntry(entry),
    }));
}

export function getPrimaryProvider(): LLMProvider | null {
  const active = PROVIDER_REGISTRY.find((entry) => !!process.env[entry.envKey]);
  if (!active) {
    console.error("[registry] No LLM provider configured. Set at least one API key: XAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, or OPENROUTER_API_KEY");
    return null;
  }
  return providerFromEntry(active);
}

function getServerToolsProvider(): LLMProvider | null {
  const active = PROVIDER_REGISTRY.find((entry) => !!process.env[entry.envKey] && entry.supportsServerTools);
  if (!active) {
    console.error("[registry] No provider with server tools configured. Set XAI_API_KEY or ANTHROPIC_API_KEY.");
    return null;
  }
  return providerFromEntry(active);
}

export async function callLLM(prompt: string, systemPrompt?: string): Promise<string | null> {
  const provider = getPrimaryProvider();
  if (!provider) return null;
  return provider.callLLM(prompt, systemPrompt);
}

export async function callLLMStructured<T>(
  prompt: string,
  schema: { name: string; description: string; input_schema: Record<string, unknown> },
  systemPrompt?: string,
): Promise<T | null> {
  const provider = getPrimaryProvider();
  if (!provider) return null;
  return provider.callLLMStructured<T>(prompt, schema, systemPrompt);
}

export async function callLLMWithUsage(
  prompt: string,
  systemPrompt?: string,
): Promise<LLMCallResult> {
  const provider = getPrimaryProvider();
  if (!provider) return { text: null, usage: null };
  return provider.callLLMWithUsage(prompt, systemPrompt);
}

export async function callLLMStructuredWithUsage<T>(
  prompt: string,
  schema: ToolSchema,
  systemPrompt?: string,
): Promise<{ result: T | null; usage: LLMCallResult["usage"] }> {
  const provider = getPrimaryProvider();
  if (!provider) return { result: null, usage: null };
  return provider.callLLMStructuredWithUsage<T>(prompt, schema, systemPrompt);
}

export async function callLLMWithServerTools(
  prompt: string,
  serverTools: ServerToolDef[],
  systemPrompt?: string,
): Promise<LLMCallResult & { searchRequests?: number }> {
  const provider = getServerToolsProvider();
  if (!provider) return { text: null, usage: null };
  return provider.callLLMWithServerTools(prompt, serverTools, systemPrompt);
}

export async function callLLMWebResearchStructured<T>(
  researchPrompt: string,
  serverTools: ServerToolDef[],
  schema: ToolSchema,
  parsePrompt?: string,
  systemPrompt?: string,
): Promise<{ result: T | null; usage: LLMCallResult["usage"]; rawResearch: string | null }> {
  const provider = getServerToolsProvider();
  if (!provider) return { result: null, usage: null, rawResearch: null };
  return provider.callLLMWebResearchStructured<T>(researchPrompt, serverTools, schema, parsePrompt, systemPrompt);
}
