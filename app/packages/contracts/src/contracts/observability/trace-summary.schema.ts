import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** W3C trace id: 32 lowercase hex characters. */
export const TraceIdSchema = z.string().regex(/^[0-9a-f]{32}$/, { error: "Expected a 32-hex trace id." });
/** W3C span id: 16 lowercase hex characters. */
export const SpanIdSchema = z.string().regex(/^[0-9a-f]{16}$/, { error: "Expected a 16-hex span id." });

export const TraceStatusSchema = z.enum(["ok", "error"]);

const tokens = (description: string) => z.int().nonnegative().meta(none(description));

/** Fields a trace list row and a span share: timing, tokens and cost. */
export const traceMetricsShape = {
  startedAt: IsoDateTimeSchema.meta(none("Start (UTC).")),
  durationMs: z.int().nonnegative().nullable().meta(none("Duration in milliseconds; null while running.")),
  inputTokens: tokens("Prompt tokens."),
  outputTokens: tokens("Completion tokens."),
  costMicroUsd: z.int().nonnegative().nullable().meta(none("Cost in micro-USD; null when a model price is unknown.")),
};

/** One trace in `/v1/traces` or `/v1/admin/traces` (decision 0040). */
export const TraceSummarySchema = z.strictObject({
  traceId: TraceIdSchema.meta(none("Trace id.")),
  tenantId: TenantIdSchema.nullable().meta(none("Organization of the trace; null for platform jobs.")),
  name: z.string().min(1).max(200).meta(none("Root span name (agent or workflow run).")),
  agentId: z.string().min(1).nullable().meta(none("Agent of the root span, if any.")),
  workflowId: z.string().min(1).nullable().meta(none("Workflow of the root span, if any.")),
  status: TraceStatusSchema.meta(none("`error` when any span failed.")),
  spanCount: z.int().positive().meta(none("Number of spans.")),
  ...traceMetricsShape,
});
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

export const TRACE_SUMMARY_EXAMPLE = {
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  tenantId: EXAMPLE_IDS.organization,
  name: "agent run: assistant",
  agentId: "assistant",
  workflowId: null,
  status: "ok",
  spanCount: 7,
  startedAt: "2026-09-30T12:00:00.000Z",
  durationMs: 2400,
  inputTokens: 1800,
  outputTokens: 350,
  costMicroUsd: 900,
} as const;

export const TraceSummaryContract = defineContract(TraceSummarySchema, {
  id: "observability.TraceSummary",
  kind: "view",
  description: "A trace of an agent or workflow run with its tokens, cost and status.",
  examples: [TRACE_SUMMARY_EXAMPLE],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.trace.read",
});
