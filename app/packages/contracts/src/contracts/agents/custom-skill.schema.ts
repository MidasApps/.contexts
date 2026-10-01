import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/**
 * Hard cap of tenant-written instructions (custom agents and skills, decision 0046). The plan
 * sets a lower cap per organization (`PlanLimits.maxCustomInstructionChars`).
 */
export const MAX_CUSTOM_INSTRUCTION_CHARS = 20_000;

/** Firestore automatic id of a custom skill (20 letters and digits). */
export const CustomSkillIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{20}$/, { error: "Expected a custom skill id." })
  .brand<"CustomSkillId">();
export type CustomSkillId = z.infer<typeof CustomSkillIdSchema>;

/** Kebab-case skill name, unique in the organization; the runtime exposes it as `org-<name>`. */
export const CustomSkillNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case skill name." })
  .max(60);

const name = CustomSkillNameSchema.meta(none("Kebab-case name, unique in the organization."));
const description = z.string().trim().min(1).max(1024).meta(none("When an agent should use the skill; the model routes by it."));
const instructions = z
  .string()
  .min(1)
  .max(MAX_CUSTOM_INSTRUCTION_CHARS)
  .meta(personal("Markdown instructions the skill gives an agent; written by the organization, so they may mention people."));

/**
 * A skill an organization wrote (Firestore `custom-skills/{id}`, decision 0046): instructions an
 * agent loads on demand. Configuration only: no code, no tool of its own.
 */
export const CustomSkillSchema = z.strictObject({
  id: CustomSkillIdSchema.meta(none("Firestore automatic id of the skill.")),
  tenantId: TenantIdSchema.meta(none("Owning organization.")),
  name,
  description,
  instructions,
  enabled: z.boolean().meta(none("Whether agents that select the skill get it.")),
  createdBy: UserIdSchema.meta(personal("Uid of the admin who created it.")),
  createdAt: IsoDateTimeSchema.meta(none("When the skill was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the skill last changed (UTC).")),
});
export type CustomSkill = z.infer<typeof CustomSkillSchema>;

const SKILL_EXAMPLE = {
  name: "weekly-report",
  description: "How to write the weekly status report of a project.",
  instructions: "# Weekly report\n\nStart with a three-line summary, then list risks and next steps.",
};

export const EXAMPLE_CUSTOM_SKILL_ID = "Sk7cX9zA1sD3fG5hJ7kL";

export const CustomSkillContract = defineContract(CustomSkillSchema, {
  id: "agents.CustomSkill",
  kind: "entity",
  description: "A skill (named markdown instructions) an organization wrote for its agents.",
  examples: [
    {
      ...SKILL_EXAMPLE,
      id: EXAMPLE_CUSTOM_SKILL_ID,
      tenantId: EXAMPLE_IDS.organization,
      enabled: true,
      createdBy: EXAMPLE_IDS.user,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.read",
});

/** Body of `POST /v1/skills`: server-owned fields (id, tenant, audit fields) never come from a client. */
export const CreateCustomSkillInputSchema = z.strictObject({
  name,
  description,
  instructions,
  enabled: z.boolean().optional().meta(none("Defaults to true.")),
});
export type CreateCustomSkillInput = z.infer<typeof CreateCustomSkillInputSchema>;

export const CreateCustomSkillInputContract = defineContract(CreateCustomSkillInputSchema, {
  id: "agents.CreateCustomSkillInput",
  kind: "command",
  description: "Creates a skill of the organization.",
  examples: [SKILL_EXAMPLE],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.update",
});

/** Body of `PATCH /v1/skills/{skillId}`: absent fields keep their value. */
export const UpdateCustomSkillInputSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    instructions: instructions.optional(),
    enabled: z.boolean().optional().meta(none("Enable or disable the skill.")),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), { error: "Change at least one field." });
export type UpdateCustomSkillInput = z.infer<typeof UpdateCustomSkillInputSchema>;

export const UpdateCustomSkillInputContract = defineContract(UpdateCustomSkillInputSchema, {
  id: "agents.UpdateCustomSkillInput",
  kind: "command",
  description: "Changes a skill's name, description, instructions or enabled state.",
  examples: [{ enabled: false }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.update",
});
