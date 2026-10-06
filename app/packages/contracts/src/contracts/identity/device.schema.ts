import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { DeviceIdSchema } from "./ids.schema.ts";

export const DeviceStatusSchema = z.enum(["active", "revoked"]);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const DeviceLabelSchema = z.string().trim().min(1).max(80);

export const DeviceSchema = z.object({
  id: DeviceIdSchema.meta(none("Device id; also the Firebase Auth uid of the device.")),
  tenantId: TenantIdSchema.meta(none("Organization the device belongs to.")),
  label: DeviceLabelSchema.meta(none("Name given at activation, e.g. `Front desk tablet`.")),
  node: tenantNodeRefField("Node the device was activated at; its grant lives there."),
  status: DeviceStatusSchema.meta(none("`revoked` devices cannot sign in.")),
  lastSeenAt: IsoDateTimeSchema.nullable().meta(none("Last authenticated request (UTC); null before the first one.")),
  createdAt: IsoDateTimeSchema.meta(none("When the device was activated (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the device last changed (UTC).")),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceContract = defineContract(DeviceSchema, {
  id: "identity.Device",
  kind: "entity",
  description: "A device principal of an organization, activated with a one-time code (SP1 spec §6.4).",
  examples: [
    {
      id: EXAMPLE_IDS.device,
      tenantId: EXAMPLE_IDS.organization,
      label: "Front desk tablet",
      node: { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project },
      status: "active",
      lastSeenAt: EXAMPLE_TIMES.updated,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.device.read",
});
