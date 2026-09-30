import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** `platform` = full instructions (staff); `tenant` = an addendum of one organization (decision 0038). */
export const PromptScopeSchema = z.enum(["platform", "tenant"]);
export type PromptScope = z.infer<typeof PromptScopeSchema>;

export const PromptVersionIdSchema = z.uuid().brand<"PromptVersionId">();
export type PromptVersionId = z.infer<typeof PromptVersionIdSchema>;

const PromptBodySchema = z.string().trim().min(1).max(50_000);
const NoteSchema = z.string().trim().min(1).max(500);

/** Tenant scope names its organization; platform scope never does. */
export const scopeMatchesTenant = (row: { scope: PromptScope; tenantId: string | null }): boolean => (row.scope === "tenant") === (row.tenantId !== null);
export const SCOPE_TENANT_ERROR = { error: "tenantId is required for tenant scope and forbidden for platform scope.", path: ["tenantId"] };

/** An immutable prompt version (`agents.prompt_versions`, append-only). */
export const PromptVersionSchema = z
  .strictObject({
    id: PromptVersionIdSchema.meta(none("uuidv7 of the version.")),
    agentId: z.string().min(1).meta(none("Agent the prompt belongs to.")),
    scope: PromptScopeSchema.meta(none("`platform` or `tenant`.")),
    tenantId: TenantIdSchema.nullable().meta(none("Organization of a tenant addendum; null for platform scope.")),
    version: z.int().positive().meta(none("1-based version number per agent, scope and tenant.")),
    body: PromptBodySchema.meta(personal("Prompt text; may mention people or internal policies.")),
    bodySha256: z.string().regex(/^[0-9a-f]{64}$/).meta(none("SHA-256 hex of the body.")),
    note: NoteSchema.nullable().meta(personal("Author's note about the change.")),
    evalExperimentId: z.string().min(1).nullable().meta(none("Experiment that evaluated this version.")),
    evalVerdict: z.enum(["passed", "failed"]).nullable().meta(none("Verdict of that experiment.")),
    createdBy: UserIdSchema.meta(personal("Author.")),
    createdAt: IsoDateTimeSchema.meta(none("When the version was written (UTC).")),
  })
  .refine(scopeMatchesTenant, SCOPE_TENANT_ERROR);
export type PromptVersion = z.infer<typeof PromptVersionSchema>;

export const PromptVersionContract = defineContract(PromptVersionSchema, {
  id: "agents.PromptVersion",
  kind: "entity",
  description: "An immutable version of an agent prompt (platform instructions or a tenant addendum).",
  examples: [
    {
      id: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f",
      agentId: "assistant",
      scope: "platform",
      tenantId: null,
      version: 2,
      body: "You are the assistant of the workspace. Answer in the user's language.",
      bodySha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      note: "Shorter greeting.",
      evalExperimentId: "exp_01J8Z3K4M5",
      evalVerdict: "passed",
      createdBy: EXAMPLE_IDS.user,
      createdAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "core.prompt.read",
});

export const CreatePromptVersionInputSchema = z.strictObject({
  body: PromptBodySchema.meta(personal("Prompt text of the new version.")),
  note: NoteSchema.optional().meta(personal("Why the prompt changes.")),
});
export type CreatePromptVersionInput = z.infer<typeof CreatePromptVersionInputSchema>;

export const CreatePromptVersionInputContract = defineContract(CreatePromptVersionInputSchema, {
  id: "agents.CreatePromptVersionInput",
  kind: "command",
  description: "Writes a new prompt version; nothing is ever updated in place.",
  examples: [{ body: "Always cite the knowledge base documents you used.", note: "Tenant policy on citations." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.prompt.write",
});
