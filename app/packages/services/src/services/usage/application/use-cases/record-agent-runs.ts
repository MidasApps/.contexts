import { z } from "zod";
import type { UsageRepository } from "../ports/usage-repository.ts";
import { MAX_LLM_CALLS_PER_BATCH, type UsageValidationError } from "./record-llm-calls.ts";
import { AgentRunSchema } from "./record-agent-runs.schema.ts";
import { validationDetailsOf } from "./usage-month.ts";

const AgentRunBatchSchema = z.array(AgentRunSchema).min(1).max(MAX_LLM_CALLS_PER_BATCH);

export type RecordAgentRuns = (
  runs: readonly unknown[],
) => Promise<{ readonly ok: true; readonly data: { readonly recorded: number } } | { readonly ok: false; readonly error: UsageValidationError }>;

/**
 * Appends agent runs to `usage.agent_runs` (decision 0066), the denominator and numerator of the
 * overview's guardrail stop rate. Rows come from the ledger exporter and are validated once here;
 * re-sent rows (same id) are skipped.
 */
export const makeRecordAgentRuns =
  (deps: { readonly repository: Pick<UsageRepository, "insertAgentRuns"> }): RecordAgentRuns =>
  async (runs) => {
    const parsed = AgentRunBatchSchema.safeParse(runs);
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", details: validationDetailsOf(parsed.error.issues) } };
    return { ok: true, data: { recorded: await deps.repository.insertAgentRuns(parsed.data) } };
  };
