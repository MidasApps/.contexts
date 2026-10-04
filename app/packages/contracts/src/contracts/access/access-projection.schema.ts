import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { ProjectIdSchema, UnitIdSchema } from "../tenancy/ids.schema.ts";
import { GrantPrincipalTypeSchema } from "./membership.schema.ts";

/** Document id of an access projection: `<tenantId>_<principalId>`. */
export const accessProjectionId = (args: { tenantId: string; principalId: string }): string =>
  `${args.tenantId}_${args.principalId}`;

/**
 * Read model of a principal's grants in one tenant (SP1 spec §5.4), rebuilt in the
 * same transaction as every membership change. Only Security Rules and list screens
 * read it; `authorize()` never does (decision 0006 §3).
 */
export const AccessProjectionSchema = z.object({
  id: z.string().min(3).meta(personal("`<tenantId>_<principalId>` (document id).")),
  tenantId: TenantIdSchema.meta(none("Organization of the projection.")),
  principalId: z.string().min(1).meta(personal("User uid or device id.")),
  principalType: GrantPrincipalTypeSchema.meta(none("`user` or `device`.")),
  orgWide: z.boolean().meta(none("Holds any organization-level grant.")),
  projectIds: z.array(ProjectIdSchema).meta(none("Projects with a project-level grant.")),
  unitIds: z.array(UnitIdSchema).meta(none("Units with a unit-level grant.")),
  visibleProjectIds: z.array(ProjectIdSchema).meta(none("Projects with any grant inside (project or unit level).")),
  isRevoked: z.boolean().meta(none("No grant left, or the organization was deleted.")),
  version: z.int().min(0).meta(none("Incremented on every rebuild.")),
  updatedAt: IsoDateTimeSchema.meta(none("When the projection was last rebuilt (UTC).")),
});
export type AccessProjection = z.infer<typeof AccessProjectionSchema>;

export const AccessProjectionContract = defineContract(AccessProjectionSchema, {
  id: "access.AccessProjection",
  kind: "entity",
  description: "Projection of a principal's grants in one organization, read by Security Rules.",
  examples: [
    {
      id: `${EXAMPLE_IDS.organization}_${EXAMPLE_IDS.otherUser}`,
      tenantId: EXAMPLE_IDS.organization,
      principalId: EXAMPLE_IDS.otherUser,
      principalType: "user",
      orgWide: false,
      projectIds: [EXAMPLE_IDS.project],
      unitIds: [],
      visibleProjectIds: [EXAMPLE_IDS.project],
      isRevoked: false,
      version: 4,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
