import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** Staff roles (SP1 spec §3.4): admin holds every `platform.*`; support reads and impersonates. */
export const PLATFORM_ROLES = ["platform-admin", "platform-support"] as const;
export const PlatformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;

export const PlatformStaffSchema = z.object({
  uid: UserIdSchema.meta(personal("Firebase Auth uid of the staff member (document id).")),
  role: PlatformRoleSchema.meta(none("Staff role.")),
  isActive: z.boolean().meta(none("Inactive staff hold no platform permission.")),
  createdAt: IsoDateTimeSchema.meta(none("When the staff record was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the staff record last changed (UTC).")),
});
export type PlatformStaff = z.infer<typeof PlatformStaffSchema>;

export const PlatformStaffContract = defineContract(PlatformStaffSchema, {
  id: "identity.PlatformStaff",
  kind: "entity",
  description: "A platform staff member; access also requires MFA (SP1 spec §3.4).",
  examples: [
    { uid: EXAMPLE_IDS.otherUser, role: "platform-support", isActive: true, createdAt: EXAMPLE_TIMES.created, updatedAt: EXAMPLE_TIMES.updated },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
});
