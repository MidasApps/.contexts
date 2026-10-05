import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** Text roles staff may point at another model (decision 0072); embedding and voice stay in the environment. */
export const EDITABLE_MODEL_ROLES = ["chat", "fast", "reasoning", "judge"] as const;
export type EditableModelRole = (typeof EDITABLE_MODEL_ROLES)[number];

export const MODEL_SETTING_ROLES = [
  ...EDITABLE_MODEL_ROLES,
  "embedding",
  "transcription",
  "speech",
  "realtime",
] as const;

/** `<provider>/<model>`, the form of `AI_MODEL_*` (decision 0021). */
export const ModelIdSchema = z
  .string()
  .max(120)
  .regex(/^(google|openai|anthropic)\/[\w.:-]+$/);

const price = (description: string) => z.int().nonnegative().max(1_000_000_000_000).meta(none(description));

/** What one model costs, in micro-USD per 1M tokens (the unit of the usage ledger). */
export const ModelPriceInputSchema = z.strictObject({
  modelId: ModelIdSchema.meta(none("Model id as <provider>/<model>.")),
  inputMicroUsdPerMTok: price("Price of 1M input tokens, in micro-USD."),
  outputMicroUsdPerMTok: price("Price of 1M output tokens, in micro-USD."),
});
export type ModelPriceInput = z.infer<typeof ModelPriceInputSchema>;

export const ModelCatalogEntrySchema = ModelPriceInputSchema.extend({
  source: z.enum(["code", "staff"]).meta(none("Whether the price ships with the code or was set by staff.")),
  available: z.boolean().meta(none("Whether the runtime holds a key for the model's provider.")),
  kind: z
    .enum(["text", "embedding"])
    .meta(none("What the model produces; only text models can run a text role. Models staff add are text.")),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

export const ModelRoleSettingSchema = z.strictObject({
  role: z.enum(MODEL_SETTING_ROLES).meta(none("What the model is used for.")),
  modelId: ModelIdSchema.meta(none("The model the role runs on.")),
  source: z
    .enum(["staff", "environment"])
    .meta(none("Whether staff chose the model or it is the environment default.")),
  editable: z.boolean().meta(none("Whether staff may change the role here.")),
});
export type ModelRoleSetting = z.infer<typeof ModelRoleSettingSchema>;

/** The models the runtime uses per role and the price of each model (decision 0072). */
export const ModelSettingsSchema = z.strictObject({
  aiMode: z.enum(["fake", "real"]).meta(none("Mode of the runtime; in fake mode the roles run scripted models.")),
  roles: z.array(ModelRoleSettingSchema).meta(none("Every model role with its current model.")),
  models: z.array(ModelCatalogEntrySchema).meta(none("Priced models a role may run on.")),
  updatedAt: IsoDateTimeSchema.nullable().meta(none("When staff last saved the settings (UTC); null when never.")),
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

const ROLES_EXAMPLE = {
  chat: "openai/gpt-6-sol",
  fast: "openai/gpt-6-luna",
  reasoning: "openai/gpt-6-sol",
  judge: "openai/gpt-6-luna",
};
const PRICE_EXAMPLE = { modelId: "openai/gpt-6-luna", inputMicroUsdPerMTok: 100_000, outputMicroUsdPerMTok: 500_000 };

export const ModelSettingsContract = defineContract(ModelSettingsSchema, {
  id: "platform.ModelSettings",
  kind: "entity",
  description: "The model each role of the agent runtime runs on, and the price of each model.",
  examples: [
    {
      aiMode: "real",
      roles: [{ role: "chat", modelId: "openai/gpt-6-sol", source: "staff", editable: true }],
      models: [{ ...PRICE_EXAMPLE, source: "code", available: true, kind: "text" }],
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.model.manage",
});

const modelIds = (prices: readonly ModelPriceInput[]): string[] => prices.map((entry) => entry.modelId);

export const UpdateModelSettingsInputSchema = z.strictObject({
  roles: z
    .strictObject({
      chat: ModelIdSchema.meta(none("Model of the chat agents.")),
      fast: ModelIdSchema.meta(none("Model of short tasks: titles, summaries and guardrails.")),
      reasoning: ModelIdSchema.meta(none("Model that plans actions.")),
      judge: ModelIdSchema.meta(none("Model that scores real-mode evals.")),
    })
    .meta(none("The model of each text role.")),
  models: z
    .array(ModelPriceInputSchema)
    .max(50)
    .refine((prices) => new Set(modelIds(prices)).size === prices.length, { error: "Models must be unique." })
    .meta(none("Prices set by staff: new models, or other prices for models the code already prices.")),
});
export type UpdateModelSettingsInput = z.infer<typeof UpdateModelSettingsInputSchema>;

export const UpdateModelSettingsInputContract = defineContract(UpdateModelSettingsInputSchema, {
  id: "platform.UpdateModelSettingsInput",
  kind: "command",
  description: "Replaces the model of each text role and the prices staff set (staff).",
  examples: [{ roles: ROLES_EXAMPLE, models: [PRICE_EXAMPLE] }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.model.manage",
});
