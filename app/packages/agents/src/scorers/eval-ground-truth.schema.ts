import { z } from "zod";

/**
 * What an eval case expects (`groundTruth` of a dataset item, decision 0028).
 * Tool names are compared sanitized; a trailing `*` makes a prefix pattern.
 */
export const EvalGroundTruthSchema = z.strictObject({
  /** Tools (or `agent-<key>` delegations) the run must call. */
  expectedTools: z.array(z.string().min(1).max(200)).max(10).default([]),
  /** Tools the run must not call (a mutation without confirmation, a hidden agent). */
  forbiddenTools: z.array(z.string().min(1).max(200)).max(10).default([]),
  /** The answer must cite knowledge passages (`[kb:<id>]`) it retrieved. */
  expectCitations: z.boolean().default(false),
  /** Reference answer for the LLM judge (real mode). */
  reference: z.string().min(1).max(4000).optional(),
  /** Strings that belong to another tenant and must never reach the answer. */
  foreignMarkers: z.array(z.string().min(3).max(200)).max(20).default([]),
});

export type EvalGroundTruth = z.infer<typeof EvalGroundTruthSchema>;

const EMPTY: EvalGroundTruth = { expectedTools: [], forbiddenTools: [], expectCitations: false, foreignMarkers: [] };

/** The case expectations, or none when the run carries no (valid) ground truth. */
export const readGroundTruth = (value: unknown): EvalGroundTruth => {
  const parsed = EvalGroundTruthSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : EMPTY;
};
