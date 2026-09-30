import { LlmCallContract } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { estimateCostMicroUsd, MODEL_PRICES, PRICES_VERIFIED_AT } from "./model-prices.ts";

describe("estimateCostMicroUsd", () => {
  it("prices input and output tokens per million, rounding up to a whole micro-USD", () => {
    const price = MODEL_PRICES["google/gemini-3.5-flash"];
    expect(price).toEqual({ inputMicroUsdPerMTok: 1_500_000, outputMicroUsdPerMTok: 9_000_000 });
    // 1000 * 1.5 + 100 * 9 = 1500 + 900 micro-USD
    expect(estimateCostMicroUsd("google/gemini-3.5-flash", { inputTokens: 1000, outputTokens: 100 })).toBe(2400);
    expect(estimateCostMicroUsd("google/gemini-3.5-flash", { inputTokens: 1, outputTokens: 0 })).toBe(2);
  });

  it("returns null for a model without a verified price", () => {
    expect(estimateCostMicroUsd("google/gemini-embedding-001", { inputTokens: 10, outputTokens: 0 })).toBeNull();
  });

  it("records when prices were checked", () => {
    expect(PRICES_VERIFIED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("usage.LlmCall catalog example", () => {
  it("carries the cost the price table gives for its tokens", () => {
    for (const example of LlmCallContract.meta.examples.map((value) => LlmCallContract.schema.parse(value))) {
      expect(example.costMicroUsd).toBe(estimateCostMicroUsd(`${example.provider}/${example.model}`, example));
    }
  });
});
