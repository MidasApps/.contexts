import { z } from "zod";
import { defineContract } from "../contract.ts";
import { personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { MEMBERSHIP_EXAMPLE } from "./membership.schema.ts";
import { roleRefsField } from "./role-ref.schema.ts";

/** Grants roles to an existing member; new people join through invitations, devices through activation. */
export const GrantMembershipInputSchema = z.strictObject({
  userId: UserIdSchema.meta(personal("Uid of the user to grant.")),
  node: tenantNodeRefField("Node to grant at; must be in the path's organization."),
  roles: roleRefsField("Roles to grant; each must be within the caller's permissions (no escalation)."),
});
export type GrantMembershipInput = z.infer<typeof GrantMembershipInputSchema>;

export const GrantMembershipInputContract = defineContract(GrantMembershipInputSchema, {
  id: "access.GrantMembershipInput",
  kind: "command",
  description: "Grants roles to a user at a node (core.member.update); one membership per user and node.",
  examples: [{ userId: MEMBERSHIP_EXAMPLE.principalId, node: MEMBERSHIP_EXAMPLE.node, roles: MEMBERSHIP_EXAMPLE.roles }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.member.update",
});
