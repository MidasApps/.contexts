import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** A Mastra dataset as the console lists it (decision 0040); tenant datasets carry their organization. */
export const EvalDatasetSchema = z.strictObject({
  id: z.string().min(1).max(128).meta(none("Dataset id.")),
  name: z.string().min(1).max(200).meta(none("Dataset name (`assistant.v1`, `feedback`).")),
  tenantId: TenantIdSchema.nullable().meta(none("Organization of a tenant dataset; null for platform datasets.")),
  version: z.int().nonnegative().meta(none("Current dataset version (items are versioned).")),
  targetIds: z.array(z.string().min(1)).max(50).meta(none("Agents the dataset evaluates.")),
  createdAt: IsoDateTimeSchema.meta(none("When the dataset was created (UTC).")),
});
export type EvalDataset = z.infer<typeof EvalDatasetSchema>;

export const EvalDatasetContract = defineContract(EvalDatasetSchema, {
  id: "observability.EvalDataset",
  kind: "view",
  description: "An eval dataset: platform eval sets per agent, or an organization's own (feedback, manual items).",
  examples: [{ id: "ds_01J8Z3K4M5", name: "feedback", tenantId: EXAMPLE_IDS.organization, version: 3, targetIds: ["assistant"], createdAt: "2026-09-30T12:00:00.000Z" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.read",
});

/** `POST /v1/evals/experiments`: run an enabled agent on one of the organization's datasets. */
export const StartEvalExperimentInputSchema = z.strictObject({
  datasetId: z.string().min(1).max(128).meta(none("The organization's dataset.")),
  agentId: z.string().regex(/^[a-z][a-z0-9-]*$/).meta(none("Agent to evaluate; must be enabled for the organization.")),
});
export type StartEvalExperimentInput = z.infer<typeof StartEvalExperimentInputSchema>;

export const StartEvalExperimentInputContract = defineContract(StartEvalExperimentInputSchema, {
  id: "observability.StartEvalExperimentInput",
  kind: "command",
  description: "Starts an experiment of an enabled agent on one of the organization's datasets.",
  examples: [{ datasetId: "ds_01J8Z3K4M5", agentId: "assistant" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.write",
});
