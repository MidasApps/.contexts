import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { PlatformRoleSchema } from "../identity/platform-staff.schema.ts";

/** `PUT /v1/admin/staff/{userId}`: makes a user staff with a role, or changes the role (decision 0075). */
export const SetPlatformStaffRoleInputSchema = z.strictObject({
  role: PlatformRoleSchema.meta(none("`platform-admin` (every platform permission) or `platform-support` (reads).")),
});
export type SetPlatformStaffRoleInput = z.infer<typeof SetPlatformStaffRoleInputSchema>;

export const SetPlatformStaffRoleInputContract = defineContract(SetPlatformStaffRoleInputSchema, {
  id: "platform.SetPlatformStaffRoleInput",
  kind: "command",
  description: "Grants a staff role to a user, or changes it; staff still need MFA to use it.",
  examples: [{ role: "platform-support" }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.staff.manage",
});
