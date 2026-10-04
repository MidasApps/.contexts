import {
  DeviceActivationIdSchema,
  DeviceIdSchema,
  DeviceLabelSchema,
  IsoDateTimeSchema,
  RoleRefSchema,
  TenantIdSchema,
  TenantNodeRefSchema,
  UserIdSchema,
} from "@core/contracts";
import { z } from "zod";

/**
 * A `device-activations/{id}` record (SP1 spec §4): server-only, never on the wire. The code
 * itself is never stored (`codeHash` elsewhere in the document); `expiresAt` is also the TTL.
 */
export const DeviceActivationRecordSchema = z.object({
  id: DeviceActivationIdSchema,
  tenantId: TenantIdSchema,
  label: DeviceLabelSchema,
  node: TenantNodeRefSchema,
  roles: z.array(RoleRefSchema).min(1).max(10),
  status: z.enum(["pending", "redeemed", "revoked"]),
  expiresAt: IsoDateTimeSchema,
  createdBy: UserIdSchema,
  deviceId: DeviceIdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DeviceActivationRecord = z.infer<typeof DeviceActivationRecordSchema>;
