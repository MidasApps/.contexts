import { z } from "zod";
import { defineContract } from "../contract.ts";
import { roleRefsField } from "../access/role-ref.schema.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, sensitive } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { CustomTokenSchema } from "./desktop-session.schema.ts";
import { DeviceLabelSchema } from "./device.schema.ts";
import { DeviceActivationIdSchema, DeviceIdSchema } from "./ids.schema.ts";

export const DEVICE_ACTIVATION_TTL_MINUTES = 10;

/** 8 Crockford base32 chars (40 bits), as shown to the admin (SP1 spec §6.4). */
export const DeviceActivationCodeSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, { error: "Expected 8 Crockford base32 chars." });

/** What a person types: case, dashes and spaces are normalized by the server (decision 0008). */
export const DeviceActivationCodeInputSchema = z.string().trim().min(8).max(16);

export const CreateDeviceActivationInputSchema = z.strictObject({
  label: DeviceLabelSchema.meta(none("Name of the device to activate.")),
  node: tenantNodeRefField("Node the device will be granted at."),
  roles: roleRefsField("Roles of the device grant (no escalation)."),
});
export type CreateDeviceActivationInput = z.infer<typeof CreateDeviceActivationInputSchema>;

export const CreateDeviceActivationInputContract = defineContract(CreateDeviceActivationInputSchema, {
  id: "identity.CreateDeviceActivationInput",
  kind: "command",
  description: "Creates a one-time device activation code (core.device.create).",
  examples: [
    {
      label: "Front desk tablet",
      node: { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project },
      roles: [{ kind: "system", key: "device" }],
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.device.create",
});

export const CreateDeviceActivationResponseSchema = z.object({
  id: DeviceActivationIdSchema.meta(none("Activation id.")),
  code: DeviceActivationCodeSchema.meta(sensitive("One-time code to type on the device; shown once.")),
  expiresAt: IsoDateTimeSchema.meta(none("When the code expires (UTC), 10 minutes after creation.")),
});
export type CreateDeviceActivationResponse = z.infer<typeof CreateDeviceActivationResponseSchema>;

export const CreateDeviceActivationResponseContract = defineContract(CreateDeviceActivationResponseSchema, {
  id: "identity.CreateDeviceActivationResponse",
  kind: "view",
  description: "Answer of activation creation with the one-time code.",
  examples: [{ id: EXAMPLE_IDS.deviceActivation, code: "7KQ2M9XA", expiresAt: "2026-09-29T14:40:00.000Z" }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
});

export const RedeemDeviceActivationInputSchema = z.strictObject({
  code: DeviceActivationCodeInputSchema.meta(sensitive("Activation code as typed on the device.")),
});
export type RedeemDeviceActivationInput = z.infer<typeof RedeemDeviceActivationInputSchema>;

export const RedeemDeviceActivationInputContract = defineContract(RedeemDeviceActivationInputSchema, {
  id: "identity.RedeemDeviceActivationInput",
  kind: "command",
  description: "Redeems an activation code (no auth; 5 failures per 15 min per IP).",
  examples: [{ code: "7kq2-m9xa" }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
});

export const RedeemDeviceActivationResponseSchema = z.object({
  deviceId: DeviceIdSchema.meta(none("Id of the new device.")),
  tenantId: TenantIdSchema.meta(none("Organization of the device.")),
  customToken: CustomTokenSchema.meta(sensitive("Custom token with `principalType: device` and `tenantId`.")),
});
export type RedeemDeviceActivationResponse = z.infer<typeof RedeemDeviceActivationResponseSchema>;

export const RedeemDeviceActivationResponseContract = defineContract(RedeemDeviceActivationResponseSchema, {
  id: "identity.RedeemDeviceActivationResponse",
  kind: "view",
  description: "Answer of a successful redeem: the device signs in with the custom token.",
  examples: [{ deviceId: EXAMPLE_IDS.device, tenantId: EXAMPLE_IDS.organization, customToken: "eyJhbGciOiJSUzI1NiJ9.eyJkZXYiOjF9.c2ln" }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
});
