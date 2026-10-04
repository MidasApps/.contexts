import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import {
  SpanIdSchema,
  TRACE_SUMMARY_EXAMPLE,
  TraceStatusSchema,
  TraceSummarySchema,
  traceMetricsShape,
} from "./trace-summary.schema.ts";

/** One span of a trace; parents make the tree (the viewer nests them). */
export const TraceSpanSchema = z.strictObject({
  spanId: SpanIdSchema.meta(none("Span id.")),
  parentSpanId: SpanIdSchema.nullable().meta(none("Parent span; null for the root.")),
  name: z.string().min(1).max(200).meta(none("Span name (operation).")),
  type: z
    .string()
    .min(1)
    .max(60)
    .meta(none("Mastra span type (agent_run, model_generation, tool_call, workflow_step, ...).")),
  status: TraceStatusSchema.meta(none("Span status.")),
  model: z.string().min(1).nullable().meta(none("Model of a generation span.")),
  // Already redacted by SensitiveDataFilter; fields with pii `sensitive` never reach this contract.
  input: z.unknown().nullable().meta(personal("Redacted span input.")),
  output: z.unknown().nullable().meta(personal("Redacted span output.")),
  ...traceMetricsShape,
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceDetailSchema = z.strictObject({
  summary: z.strictObject(TraceSummarySchema.shape).meta(none("The trace as listed.")),
  spans: z.array(TraceSpanSchema).max(2000).meta(personal("Spans, parents before children.")),
});
export type TraceDetail = z.infer<typeof TraceDetailSchema>;

export const TraceDetailContract = defineContract(TraceDetailSchema, {
  id: "observability.TraceDetail",
  kind: "view",
  description: "A trace with its span tree, tokens, cost and redacted inputs and outputs.",
  examples: [
    {
      summary: TRACE_SUMMARY_EXAMPLE,
      spans: [
        {
          spanId: "00f067aa0ba902b7",
          parentSpanId: null,
          name: "agent run: assistant",
          type: "agent_run",
          status: "ok",
          model: null,
          input: null,
          output: null,
          startedAt: "2026-09-30T12:00:00.000Z",
          durationMs: 2400,
          inputTokens: 1800,
          outputTokens: 350,
          costMicroUsd: 900,
        },
      ],
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.trace.read",
});
