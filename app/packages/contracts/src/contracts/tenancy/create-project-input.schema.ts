import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { ProjectDescriptionSchema } from "./project.schema.ts";
import { NodeRegionalOverridesSchema } from "./regional-defaults.schema.ts";

export const CreateProjectInputSchema = z.strictObject({
  name: NodeNameSchema.meta(none("Display name of the new project.")),
  description: ProjectDescriptionSchema.optional().meta(personal("Free text about the project; may mention people.")),
  settings: z
    .strictObject(NodeRegionalOverridesSchema.shape)
    .optional()
    .meta(none("Regional overrides; absent fields inherit the organization's defaults.")),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const CreateProjectInputContract = defineContract(CreateProjectInputSchema, {
  id: "tenancy.CreateProjectInput",
  kind: "command",
  description: "Creates a project in an organization (`core.project.create` at the organization).",
  examples: [{ name: "Launch", description: "Rollout of the new catalog.", settings: { timeZone: "America/Manaus" } }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.project.create",
});
