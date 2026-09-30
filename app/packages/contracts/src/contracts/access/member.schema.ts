import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { MembershipIdSchema } from "./membership.schema.ts";
import { roleRefsField } from "./role-ref.schema.ts";

const MemberGrantSchema = z.object({
  membershipId: MembershipIdSchema.meta(none("Membership id of the grant.")),
  node: tenantNodeRefField("Node of the grant."),
  roles: roleRefsField("Roles held at the node."),
});

/** A user of an organization with all their grants there (list item of GET .../members). */
export const MemberSchema = z.object({
  uid: UserIdSchema.meta(personal("Firebase Auth uid.")),
  displayName: z.string().max(120).meta(personal("Display name; may be empty.")),
  email: z.email().meta(personal("Email address, shown to people who can read members.")),
  grants: z.array(MemberGrantSchema).min(1).meta(none("Every grant of the user in the organization.")),
});
export type Member = z.infer<typeof MemberSchema>;

export const MemberContract = defineContract(MemberSchema, {
  id: "access.Member",
  kind: "view",
  description: "A member of an organization with their grants (core.member.read).",
  examples: [
    {
      uid: EXAMPLE_IDS.otherUser,
      displayName: "Bruno Lima",
      email: "bruno@example.com",
      grants: [
        {
          membershipId: EXAMPLE_IDS.membership,
          node: { level: "organization", tenantId: EXAMPLE_IDS.organization },
          roles: [{ kind: "system", key: "member" }],
        },
      ],
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.member.read",
});
