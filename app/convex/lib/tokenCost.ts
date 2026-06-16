// Model pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "grok-4-1-fast-non-reasoning": { input: 0.20, output: 0.50 },
  "grok-4-1-fast-reasoning": { input: 0.20, output: 0.50 },
  "grok-4.20-0309-non-reasoning": { input: 2.00, output: 6.00 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 3.20 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gemini-2.0-flash": { input: 0.075, output: 0.30 },
  "meta-llama/llama-4-scout": { input: 0.15, output: 0.60 },
  "gpt-5.4-mini": { input: 0.20, output: 0.80 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function getModelPricing(): typeof MODEL_PRICING {
  return MODEL_PRICING;
}
