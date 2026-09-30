import { LlmCallSchema } from "@core/contracts";
import { z } from "zod";
import type { UsageRepository } from "../ports/usage-repository.ts";
import { validationDetailsOf } from "./usage-month.ts";

/** One flush of the ledger exporter (≤ 50 rows) and its retries stay far below this. */
export const MAX_LLM_CALLS_PER_BATCH = 500;

const LlmCallBatchSchema = z.array(LlmCallSchema).min(1).max(MAX_LLM_CALLS_PER_BATCH);

export type UsageValidationError = {
  readonly code: "VALIDATION_FAILED";
  readonly details: readonly { readonly field: string; readonly issue: string }[];
};

export type RecordLlmCalls = (
  calls: readonly unknown[],
) => Promise<{ readonly ok: true; readonly data: { readonly recorded: number } } | { readonly ok: false; readonly error: UsageValidationError }>;

/**
 * Appends model calls to `usage.llm_calls` (SP3 spec §12). Rows come from the
 * ledger exporter, which builds them from spans; they cross the `usage.LlmCall`
 * contract once here. Re-sent rows (same id) are skipped.
 */
export const makeRecordLlmCalls =
  (deps: { readonly repository: UsageRepository }): RecordLlmCalls =>
  async (calls) => {
    const parsed = LlmCallBatchSchema.safeParse(calls);
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", details: validationDetailsOf(parsed.error.issues) } };
    return { ok: true, data: { recorded: await deps.repository.insertCalls(parsed.data) } };
  };
