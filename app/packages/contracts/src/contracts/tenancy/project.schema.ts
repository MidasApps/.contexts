import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { ProjectIdSchema } from "./ids.schema.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { NodeRegionalOverridesSchema } from "./regional-defaults.schema.ts";

export const ProjectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectDescriptionSchema = z.string().trim().max(2000);

export const ProjectSchema = z.object({
  id: ProjectIdSchema.meta(none("Automatic id of the project.")),
  tenantId: TenantIdSchema.meta(none("Organization that owns the project.")),
  name: NodeNameSchema.meta(none("Display name of the project.")),
  description: ProjectDescriptionSchema.optional().meta(personal("Free text about the project; may mention people.")),
  status: ProjectStatusSchema.meta(none("`archived` keeps the project readable but out of default lists.")),
  settings: z.object(NodeRegionalOverridesSchema.shape).meta(none("Regional overrides of the project.")),
  createdAt: IsoDateTimeSchema.meta(none("When the project was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the project last changed (UTC).")),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PROJECT_EXAMPLE = {
  id: EXAMPLE_IDS.project,
  tenantId: EXAMPLE_IDS.organization,
  name: "Launch",
  description: "Rollout of the new catalog.",
  status: "active",
  settings: { timeZone: "America/Manaus" },
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
} as const;

export const ProjectContract = defineContract(ProjectSchema, {
  id: "tenancy.Project",
  kind: "entity",
  description: "A project inside an organization; the parent of the optional unit tree.",
  examples: [PROJECT_EXAMPLE],
  pii: "personal",
  tenancyScope: "project",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.project.read",
});
