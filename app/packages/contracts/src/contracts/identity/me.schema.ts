import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { PlatformRoleSchema } from "./platform-staff.schema.ts";
import { USER_FIELDS } from "./user.schema.ts";

/** What the signed-in user may start from the UI; the server still enforces each rule (decision 0050). */
export const MeCapabilitiesSchema = z.object({
  createOrganization: z
    .boolean()
    .meta(
      none(
        "Whether POST /v1/organizations would let the caller in (self-serve on, or MFA platform staff; never under impersonation).",
      ),
    ),
});
export type MeCapabilities = z.infer<typeof MeCapabilitiesSchema>;

/** The signed-in user (`GET /v1/me`, SP1 spec §7.3). */
export const MeSchema = z.object({
  uid: UserIdSchema.meta(personal("Firebase Auth uid.")),
  ...USER_FIELDS,
  isPlatformStaff: z.boolean().meta(none("Whether an active platform-staff doc exists for the user.")),
  platformRole: PlatformRoleSchema.optional().meta(none("Staff role; present only for active staff.")),
  mfaEnrolled: z.boolean().meta(none("Whether the account has at least one second factor enrolled.")),
  capabilities: MeCapabilitiesSchema.meta(
    none("Actions the UI may offer the caller; it hides the ones the server would refuse."),
  ),
  organizationDefaultProject: z
    .boolean()
    .meta(
      none(
        "Whether the server creates every organization with its one project (ORGANIZATION_DEFAULT_PROJECT). The shell then offers no project creation while the organization has a project, opens a single visible project directly and hides the project switcher.",
      ),
    ),
});
export type Me = z.infer<typeof MeSchema>;

export const MeContract = defineContract(MeSchema, {
  id: "identity.Me",
  kind: "view",
  description: "Profile, preferences, staff flags, capabilities and access version of the signed-in user.",
  examples: [
    {
      uid: EXAMPLE_IDS.user,
      email: "ana@example.com",
      displayName: "Ana Souza",
      preferences: { locale: "pt-BR", theme: "system", notifications: { productUpdates: false, securityAlerts: true } },
      lastContext: { organizationId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project },
      accessVersion: 3,
      isPlatformStaff: false,
      mfaEnrolled: true,
      capabilities: { createOrganization: true },
      organizationDefaultProject: false,
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
