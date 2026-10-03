import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** Same cap as the input of a platform eval case (`packages/agents/evals`). */
const ITEM_TEXT_MAX = 4000;

/**
 * One item of an organization's dataset as `/v1` shows it (follow-up 66, decision 0062). Mastra keeps
 * `input` and `groundTruth` as free JSON; the runtime renders a value that is not a string as JSON
 * text, so the view stays typed (a feedback item's input is `{ conversationId, messageId }`).
 */
export const EvalDatasetItemSchema = z.strictObject({
  id: z.string().min(1).max(128).meta(none("Item id.")),
  datasetId: z.string().min(1).max(128).meta(none("Dataset of the item.")),
  input: z.string().max(ITEM_TEXT_MAX * 2).meta(personal("What the agent receives, as text (JSON for a structured input).")),
  expectedOutput: z.string().max(ITEM_TEXT_MAX * 2).nullable().meta(personal("Expected answer (ground truth) as text; null when the item has none.")),
  createdAt: IsoDateTimeSchema.meta(none("When the item was added (UTC).")),
});
export type EvalDatasetItem = z.infer<typeof EvalDatasetItemSchema>;

export const EvalDatasetItemContract = defineContract(EvalDatasetItemSchema, {
  id: "observability.EvalDatasetItem",
  kind: "view",
  description: "One item of an organization's eval dataset: the input an agent receives and the expected answer.",
  examples: [{ id: "item_01J8Z3K4M5", datasetId: "ds_01J8Z3K4M5", input: "Which documents mention the refund policy?", expectedOutput: "The refund policy and the terms of sale.", createdAt: EXAMPLE_TIMES.created }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.read",
});

/** `POST /v1/evals/datasets/{datasetId}/items`: a manual item (SP5 spec §7). */
export const AddEvalDatasetItemInputSchema = z.strictObject({
  input: z.string().trim().min(1).max(ITEM_TEXT_MAX).meta(personal("Message the agent receives.")),
  expectedOutput: z.string().trim().min(1).max(ITEM_TEXT_MAX).optional().meta(personal("Expected answer (ground truth); omit when there is none.")),
});
export type AddEvalDatasetItemInput = z.infer<typeof AddEvalDatasetItemInputSchema>;

export const AddEvalDatasetItemInputContract = defineContract(AddEvalDatasetItemInputSchema, {
  id: "observability.AddEvalDatasetItemInput",
  kind: "command",
  description: "Adds a manual item (input and expected answer) to one of the organization's datasets.",
  examples: [{ input: "Which documents mention the refund policy?", expectedOutput: "The refund policy and the terms of sale." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.write",
});

/** `POST /v1/evals/datasets`: a new, empty dataset of the organization. */
export const CreateEvalDatasetInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).meta(none("Dataset name, unique in the organization.")),
});
export type CreateEvalDatasetInput = z.infer<typeof CreateEvalDatasetInputSchema>;

export const CreateEvalDatasetInputContract = defineContract(CreateEvalDatasetInputSchema, {
  id: "observability.CreateEvalDatasetInput",
  kind: "command",
  description: "Creates an empty eval dataset of the organization, evaluated against the assistant by default.",
  examples: [{ name: "refund questions" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.eval.write",
});
