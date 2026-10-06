import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { ApiKeyIdSchema, DeviceIdSchema, ImpersonationSessionIdSchema, SessionIdSchema } from "./ids.schema.ts";

const tenantId = TenantIdSchema.meta(none("The only organization this principal can act in."));

const UserPrincipalSchema = z.strictObject({
  type: z.literal("user").meta(none("A person signed in with Firebase Auth.")),
  uid: UserIdSchema.meta(personal("Firebase Auth uid of the user.")),
  mfa: z.boolean().meta(none("Whether the verified token proves a second factor (SP1 spec §3.4).")),
  sessionId: SessionIdSchema.optional().meta(
    none(
      "Web or desktop session whose exchange minted the token (developer claim `sessionId` of a custom-token sign-in).",
    ),
  ),
  impersonation: z
    .strictObject({
      sessionId: ImpersonationSessionIdSchema.meta(none("Active impersonation session (read-only, time-boxed).")),
      staffUid: UserIdSchema.meta(personal("Uid of the platform staff member acting as the user.")),
    })
    .optional()
    .meta(personal("Present when platform staff acts as this user (SP1 spec §6.6).")),
});

const DevicePrincipalSchema = z.strictObject({
  type: z.literal("device").meta(none("A device activated with a code; signs in with a custom token.")),
  deviceId: DeviceIdSchema.meta(none("Device id; also its Firebase Auth uid.")),
  tenantId,
});

const ServicePrincipalSchema = z.strictObject({
  type: z.literal("service").meta(none("An API key; acts with its scopes intersected with its owner's grants.")),
  apiKeyId: ApiKeyIdSchema.meta(none("API key id.")),
  tenantId,
  ownerUid: UserIdSchema.meta(personal("User who owns the key; the key never exceeds their permissions.")),
});

/**
 * Who is calling (SP1 spec §3.1). Platform staff is a `user` with an active
 * `platform-staff/{uid}` doc, not a principal type.
 */
export const PrincipalSchema = z.discriminatedUnion("type", [
  UserPrincipalSchema,
  DevicePrincipalSchema,
  ServicePrincipalSchema,
]);
export type Principal = z.infer<typeof PrincipalSchema>;
export type UserPrincipal = z.infer<typeof UserPrincipalSchema>;
export type DevicePrincipal = z.infer<typeof DevicePrincipalSchema>;
export type ServicePrincipal = z.infer<typeof ServicePrincipalSchema>;

export const PrincipalContract = defineContract(PrincipalSchema, {
  id: "identity.Principal",
  kind: "view",
  description: "The authenticated caller of a /v1 request: a user, a device or an API key (service).",
  examples: [
    { type: "user", uid: EXAMPLE_IDS.user, mfa: true },
    { type: "device", deviceId: EXAMPLE_IDS.device, tenantId: EXAMPLE_IDS.organization },
    { type: "service", apiKeyId: EXAMPLE_IDS.apiKey, tenantId: EXAMPLE_IDS.organization, ownerUid: EXAMPLE_IDS.user },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
});
