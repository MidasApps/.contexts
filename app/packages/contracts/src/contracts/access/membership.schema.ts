import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { roleRefsField } from "./role-ref.schema.ts";

export const MembershipIdSchema = firestoreIdSchema<"MembershipId">();
export type MembershipId = z.infer<typeof MembershipIdSchema>;

/** Principals that hold grants; API keys act through their owner's grants instead. */
export const GrantPrincipalTypeSchema = z.enum(["user", "device"]);
export type GrantPrincipalType = z.infer<typeof GrantPrincipalTypeSchema>;

/** A grant: roles of one principal at one node, inherited downwards (decision 0006 §2). */
export const MembershipSchema = z.object({
  id: MembershipIdSchema.meta(none("Automatic id of the membership.")),
  tenantId: TenantIdSchema.meta(none("Organization of the grant.")),
  principalType: GrantPrincipalTypeSchema.meta(none("`user` or `device`.")),
  principalId: z.string().min(1).meta(personal("User uid or device id holding the grant.")),
  node: tenantNodeRefField("Node the grant applies to; it also covers every node below."),
  roles: roleRefsField("Roles granted at the node (1-10)."),
  grantedBy: UserIdSchema.meta(personal("User who created the grant.")),
  createdAt: IsoDateTimeSchema.meta(none("When the grant was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the grant last changed (UTC).")),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const MEMBERSHIP_EXAMPLE = {
  id: EXAMPLE_IDS.membership,
  tenantId: EXAMPLE_IDS.organization,
  principalType: "user",
  principalId: EXAMPLE_IDS.otherUser,
  node: { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project },
  roles: [{ kind: "custom", roleId: EXAMPLE_IDS.role }],
  grantedBy: EXAMPLE_IDS.user,
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
} as const;

export const MembershipContract = defineContract(MembershipSchema, {
  id: "access.Membership",
  kind: "entity",
  description: "A grant of roles to a user or device at an organization, project or unit.",
  examples: [MEMBERSHIP_EXAMPLE],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.member.read",
});
