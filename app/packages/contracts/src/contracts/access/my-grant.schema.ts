import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { roleRefsField } from "./role-ref.schema.ts";

/** `GET /v1/me/grants?organizationId=…`: the organization whose grants to list, paged. */
export const MyGrantsQuerySchema = PageQuerySchema.extend({
  organizationId: OrganizationIdSchema.meta(none("Organization whose grants of the caller to list.")),
});
export type MyGrantsQuery = z.infer<typeof MyGrantsQuerySchema>;

/**
 * A node where the signed-in user holds a live grant (decision 0030 A7): the node is live and
 * `getEffectivePermissions` accepts it there. Grants on one node are merged. The client lands a
 * member on its widest node (organization, then project, then unit).
 */
export const MyGrantSchema = z.object({
  node: tenantNodeRefField("Node of the grant; it also covers every node below."),
  roles: roleRefsField("Roles the caller holds at the node (merged over its grants there)."),
});
export type MyGrant = z.infer<typeof MyGrantSchema>;

export const MyGrantContract = defineContract(MyGrantSchema, {
  id: "access.MyGrant",
  kind: "view",
  description: "A live node where the signed-in user holds a grant, with its roles there (GET /v1/me/grants).",
  examples: [
    {
      node: {
        level: "unit",
        tenantId: EXAMPLE_IDS.organization,
        projectId: EXAMPLE_IDS.project,
        unitId: EXAMPLE_IDS.unit,
      },
      roles: [{ kind: "system", key: "member" }],
    },
  ],
  pii: "none",
  tenancyScope: "user",
  relations: [],
});
