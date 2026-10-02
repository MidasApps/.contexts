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

/**
 * FAKE PRICES — NOT REAL. Nominal prices for the `AI_MODE=fake` models (follow-up 83), so the
 * offline ledger, `/admin/costs` and `/settings/usage` show non-zero costs end to end. They are
 * read only through `priceTableFor("fake")`; the real table never carries a `fake/` id.
 */
// Deliberately high (US$ 10–100 per 1M tokens): one fake chat turn of a few thousand tokens must
// round to at least a cent on the console, or the offline cost screens still read US$ 0,00.
export const FAKE_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "fake/fake-chat": { inputMicroUsdPerMTok: 50_000_000, outputMicroUsdPerMTok: 100_000_000 },
  "fake/fake-fast": { inputMicroUsdPerMTok: 10_000_000, outputMicroUsdPerMTok: 20_000_000 },
  "fake/fake-reasoning": { inputMicroUsdPerMTok: 50_000_000, outputMicroUsdPerMTok: 100_000_000 },
  "fake/fake-judge": { inputMicroUsdPerMTok: 50_000_000, outputMicroUsdPerMTok: 100_000_000 },
  "fake/fake-embedding": { inputMicroUsdPerMTok: 10_000_000, outputMicroUsdPerMTok: 0 },
};

const FAKE_MODE_PRICES: Readonly<Record<string, ModelPrice>> = { ...MODEL_PRICES, ...FAKE_MODEL_PRICES };

/** The table the ledger prices with: the verified prices, plus the fake ones in fake mode only. */
export const priceTableFor = (aiMode: "fake" | "real"): Readonly<Record<string, ModelPrice>> => (aiMode === "fake" ? FAKE_MODE_PRICES : MODEL_PRICES);

export type TokenUsage = { readonly inputTokens: number; readonly outputTokens: number };

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/**
 * Cost of one call in whole micro-USD, rounded up.
 * @param modelId `<provider>/<model>`, as in `AI_MODEL_*`.
 * @param prices the table to read (`priceTableFor`); the verified prices by default.
 * @returns `null` when the model has no price in the table.
 */
export const estimateCostMicroUsd = (modelId: string, usage: TokenUsage, prices: Readonly<Record<string, ModelPrice>> = MODEL_PRICES): number | null => {
  const price = prices[modelId];
  if (price === undefined) return null;
  const microUsdTimesMillion = usage.inputTokens * price.inputMicroUsdPerMTok + usage.outputTokens * price.outputMicroUsdPerMTok;
  return Math.ceil(microUsdTimesMillion / TOKENS_PER_PRICE_UNIT);
};
