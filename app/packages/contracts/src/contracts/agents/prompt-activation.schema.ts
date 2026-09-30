import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { PromptScopeSchema, PromptVersionIdSchema, SCOPE_TENANT_ERROR, scopeMatchesTenant } from "./prompt-version.schema.ts";

const ReasonSchema = z.string().trim().min(1).max(500);

/** An activation row (`agents.prompt_activations`, append-only; the latest one is active). */
export const PromptActivationSchema = z
  .strictObject({
    id: z.uuid().meta(none("uuidv7 of the activation.")),
    agentId: z.string().min(1).meta(none("Agent.")),
    scope: PromptScopeSchema.meta(none("`platform` or `tenant`.")),
    tenantId: TenantIdSchema.nullable().meta(none("Organization of a tenant addendum; null for platform scope.")),
    versionId: PromptVersionIdSchema.meta(none("Version made active.")),
    forced: z.boolean().meta(none("True when staff activated without a passing eval.")),
    reason: ReasonSchema.nullable().meta(personal("Reason of a forced activation or a rollback.")),
    activatedBy: UserIdSchema.meta(personal("Who activated it.")),
    activatedAt: IsoDateTimeSchema.meta(none("When (UTC).")),
  })
  .refine(scopeMatchesTenant, SCOPE_TENANT_ERROR);
export type PromptActivation = z.infer<typeof PromptActivationSchema>;

export const PromptActivationContract = defineContract(PromptActivationSchema, {
  id: "agents.PromptActivation",
  kind: "entity",
  description: "Makes a prompt version active; a rollback is a new activation of an older version.",
  examples: [
    {
      id: "01927f3d-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
      agentId: "assistant",
      scope: "platform",
      tenantId: null,
      versionId: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f",
      forced: false,
      reason: null,
      activatedBy: EXAMPLE_IDS.user,
      activatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "core.prompt.read",
});

/** Activation needs a passing eval unless staff force it with a reason (audited). */
export const ActivatePromptVersionInputSchema = z
  .strictObject({
    versionId: PromptVersionIdSchema.meta(none("Version to activate.")),
    force: z.boolean().optional().meta(none("Staff only: activate without a passing eval.")),
    reason: ReasonSchema.optional().meta(personal("Required with force; kept on the activation.")),
  })
  .refine((input) => input.force !== true || input.reason !== undefined, { error: "A forced activation needs a reason.", path: ["reason"] });
export type ActivatePromptVersionInput = z.infer<typeof ActivatePromptVersionInputSchema>;

export const ActivatePromptVersionInputContract = defineContract(ActivatePromptVersionInputSchema, {
  id: "agents.ActivatePromptVersionInput",
  kind: "command",
  description: "Activates a prompt version (eval-gated; staff may force with a reason).",
  examples: [{ versionId: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f" }, { versionId: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f", force: true, reason: "Eval dataset is being rebuilt." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.prompt.write",
});
