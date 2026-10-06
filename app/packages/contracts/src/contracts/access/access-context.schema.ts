import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema } from "../tenancy/ids.schema.ts";
import { ORGANIZATION_EXAMPLE, OrganizationSchema } from "../tenancy/organization.schema.ts";
import { PROJECT_EXAMPLE, ProjectSchema } from "../tenancy/project.schema.ts";
import { RegionalSettingsSchema } from "../tenancy/regional-settings.schema.ts";
import { UnitFieldsSchema } from "../tenancy/unit.schema.ts";

/** `GET /v1/me/context?organizationId&projectId&unitId`: the node to resolve. */
export const AccessContextQuerySchema = z
  .strictObject({
    organizationId: OrganizationIdSchema.meta(none("Organization of the node.")),
    projectId: ProjectIdSchema.optional().meta(none("Project of the node; absent for the organization itself.")),
    unitId: UnitIdSchema.optional().meta(none("Unit of the node; requires projectId.")),
  })
  .refine((query) => query.unitId === undefined || query.projectId !== undefined, {
    error: "unitId requires projectId.",
    path: ["projectId"],
  });
export type AccessContextQuery = z.infer<typeof AccessContextQuerySchema>;

/**
 * What the caller may do at a node and how to render it (SP1 spec §10): the input of
 * SP2's shell and of SP3's agent `RequestContext`.
 */
export const AccessContextSchema = z.object({
  tenantId: TenantIdSchema.meta(none("Organization (tenant) of the node.")),
  organization: z.object(OrganizationSchema.shape).meta(none("The organization.")),
  project: z.object(ProjectSchema.shape).optional().meta(personal("The project, when the node is a project or unit.")),
  unit: z.object(UnitFieldsSchema.shape).optional().meta(none("The unit, when the node is a unit.")),
  permissions: z.array(PermissionSchema).meta(none("Effective permissions of the caller at the node, sorted.")),
  regional: z
    .object(RegionalSettingsSchema.shape)
    .meta(none("Locale, time zones and currency resolved for the caller at the node.")),
});
export type AccessContext = z.infer<typeof AccessContextSchema>;

export const AccessContextContract = defineContract(AccessContextSchema, {
  id: "access.AccessContext",
  kind: "view",
  description: "Effective permissions and regional settings of the caller at a node (GET /v1/me/context).",
  examples: [
    {
      tenantId: EXAMPLE_IDS.organization,
      organization: ORGANIZATION_EXAMPLE,
      project: PROJECT_EXAMPLE,
      permissions: ["core.organization.read", "core.project.read", "core.unit.read"],
      regional: {
        locale: "pt-BR",
        displayTimeZone: "America/Sao_Paulo",
        nodeTimeZone: "America/Manaus",
        currency: "BRL",
      },
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
