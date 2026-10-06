// Staff management (`/v1/admin/staff`, decision 0075): who is platform staff and with which role.
import { z } from "zod";
import { personal } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { PlatformStaffSchema } from "../identity/platform-staff.schema.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { SetPlatformStaffRoleInputSchema } from "./admin-staff.schema.ts";

const STAFF = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;
const staffParams = z.object({ userId: UserIdSchema.meta(personal("Uid of the user.")) });

export const adminListStaffEndpoint = defineEndpoint({
  id: "admin.listStaff",
  method: "GET",
  path: "/v1/admin/staff",
  auth: "user",
  responses: { 200: dataEnvelope(z.array(PlatformStaffSchema)) },
  errors: STAFF,
  summary: "Lists the platform staff, active and revoked, with their roles (staff, platform.staff.manage).",
});

export const adminSetStaffRoleEndpoint = defineEndpoint({
  id: "admin.setStaffRole",
  method: "PUT",
  path: "/v1/admin/staff/{userId}",
  auth: "user",
  params: staffParams,
  body: SetPlatformStaffRoleInputSchema,
  responses: { 200: dataEnvelope(PlatformStaffSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF, 404: ["NOT_FOUND"], 422: ["STAFF_SELF_CHANGE"] },
  summary:
    "Makes a user staff with a role, or changes it; never one's own (staff, platform.staff.manage, audited PLATFORM_STAFF_GRANTED).",
});

export const adminRevokeStaffEndpoint = defineEndpoint({
  id: "admin.revokeStaff",
  method: "DELETE",
  path: "/v1/admin/staff/{userId}",
  auth: "user",
  params: staffParams,
  responses: { 204: null },
  errors: { ...STAFF, 404: ["NOT_FOUND"], 422: ["STAFF_SELF_CHANGE"] },
  summary:
    "Revokes a staff member and ends their open support sessions; never oneself (staff, platform.staff.manage, audited PLATFORM_STAFF_REVOKED).",
});

export const ADMIN_STAFF_ENDPOINTS: readonly EndpointDefinition[] = [
  adminListStaffEndpoint,
  adminSetStaffRoleEndpoint,
  adminRevokeStaffEndpoint,
];
