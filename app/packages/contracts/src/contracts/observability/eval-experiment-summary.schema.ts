import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

const score = (description: string) => z.number().min(0).max(1).meta(none(description));

/** One experiment (Mastra datasets/experiments) as the console lists it (decision 0040). */
export const EvalExperimentSummarySchema = z.strictObject({
  experimentId: z.string().min(1).meta(none("Experiment id.")),
  datasetId: z.string().min(1).meta(none("Dataset the experiment ran on.")),
  agentId: z.string().min(1).meta(none("Agent under test.")),
  promptVersionId: z.uuid().nullable().meta(none("Candidate prompt version, when the experiment gates an activation.")),
  status: z.enum(["pending", "running", "completed", "failed"]).meta(none("Experiment status.")),
  itemCount: z.int().nonnegative().meta(none("Dataset items evaluated.")),
  scores: z
    .array(z.strictObject({ scorer: z.string().min(1).meta(none("Scorer id.")), mean: score("Mean score."), baseline: score("Baseline floor.").nullable() }))
    .meta(none("Mean score per scorer against the baseline floor.")),
  verdict: z.enum(["passed", "failed", "pending"]).meta(none("Gate verdict: every scorer at or above its baseline.")),
  startedAt: IsoDateTimeSchema.meta(none("Start (UTC).")),
  finishedAt: IsoDateTimeSchema.nullable().meta(none("End (UTC); null while running.")),
});
export type EvalExperimentSummary = z.infer<typeof EvalExperimentSummarySchema>;

export const EvalExperimentSummaryContract = defineContract(EvalExperimentSummarySchema, {
  id: "observability.EvalExperimentSummary",
  kind: "view",
  description: "An eval experiment of an agent on a dataset, with scores per scorer and the gate verdict.",
  examples: [
    {
      experimentId: "exp_01J8Z3K4M5",
      datasetId: "assistant.v1",
      agentId: "assistant",
      promptVersionId: null,
      status: "completed",
      itemCount: 18,
      scores: [{ scorer: "tool-routing", mean: 0.94, baseline: 0.9 }],
      verdict: "passed",
      startedAt: "2026-09-30T12:00:00.000Z",
      finishedAt: "2026-09-30T12:03:00.000Z",
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.read",
});
