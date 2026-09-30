/**
 * Model price table (spec §12, decision 0026), in micro-USD per 1M tokens.
 * Only prices read from the provider's pricing page are listed; a model without
 * an entry costs `null` in the usage ledger (the budget then counts tokens).
 *
 * Source (2026-09-29): https://ai.google.dev/gemini-api/docs/pricing, "Standard"
 * paid tier (page last updated 2026-09-24). `gemini-embedding-2` text input is
 * $0.20 per 1M tokens (embeddings have no output tokens); `gemini-embedding-001`
 * (deprecated, decision 0022 amendment) is not listed, so it has no entry.
 * Cached input tokens are priced as regular input (overestimates slightly; never
 * underestimates).
 */
export const PRICES_VERIFIED_AT = "2026-09-29";

export type ModelPrice = {
  readonly inputMicroUsdPerMTok: number;
  readonly outputMicroUsdPerMTok: number;
};

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "google/gemini-3.5-flash": { inputMicroUsdPerMTok: 1_500_000, outputMicroUsdPerMTok: 9_000_000 },
  "google/gemini-3.5-flash-lite": { inputMicroUsdPerMTok: 300_000, outputMicroUsdPerMTok: 2_500_000 },
  "google/gemini-embedding-2": { inputMicroUsdPerMTok: 200_000, outputMicroUsdPerMTok: 0 },
};

export type TokenUsage = { readonly inputTokens: number; readonly outputTokens: number };

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/**
 * Cost of one call in whole micro-USD, rounded up.
 * @param modelId `<provider>/<model>`, as in `AI_MODEL_*`.
 * @returns `null` when the model has no verified price.
 */
export const estimateCostMicroUsd = (modelId: string, usage: TokenUsage): number | null => {
  const price = MODEL_PRICES[modelId];
  if (price === undefined) return null;
  const microUsdTimesMillion = usage.inputTokens * price.inputMicroUsdPerMTok + usage.outputTokens * price.outputMicroUsdPerMTok;
  return Math.ceil(microUsdTimesMillion / TOKENS_PER_PRICE_UNIT);
};
