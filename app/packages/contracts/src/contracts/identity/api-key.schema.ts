import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal, sensitive } from "../field-docs.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { ApiKeyIdSchema } from "./ids.schema.ts";

/** Longest lifetime of an API key (SP1 spec §6.3, decision 0008). */
export const API_KEY_MAX_LIFETIME_DAYS = 365;
export const API_KEY_MAX_SCOPES = 200;
const DAY_MS = 86_400_000;

export const ApiKeyStatusSchema = z.enum(["active", "revoked"]);
export type ApiKeyStatus = z.infer<typeof ApiKeyStatusSchema>;

/** Why a key was revoked: by a person, or because its owner left or lost access. */
export const ApiKeyRevokedReasonSchema = z.enum(["revoked", "owner-removed"]);
export type ApiKeyRevokedReason = z.infer<typeof ApiKeyRevokedReasonSchema>;

/** Public part of a key (`<prefix>_<publicId>_<secret>`): 12 chars of RFC 4648 base32. */
export const ApiKeyPublicIdSchema = z.string().regex(/^[A-Z2-7]{12}$/, { error: "Expected 12 base32 characters." });

export const ApiKeyNameSchema = z.string().trim().min(1).max(80);

const scopesField = z
  .array(PermissionSchema)
  .min(1)
  .max(API_KEY_MAX_SCOPES)
  .refine(hasUniqueItems, { error: "Scopes must be distinct." })
  .meta(none("Permissions the key may use; always intersected with the owner's current grants."));

/** A key as listed; the secret and its hash never leave the server. */
export const ApiKeySchema = z.object({
  id: ApiKeyIdSchema.meta(none("API key id.")),
  tenantId: TenantIdSchema.meta(none("Organization the key acts in.")),
  name: ApiKeyNameSchema.meta(none("Name given by the owner.")),
  publicId: ApiKeyPublicIdSchema.meta(none("Public, non-secret part of the key, to recognize it in lists.")),
  scopes: scopesField,
  node: tenantNodeRefField("Node the key is limited to; it acts only there and below."),
  ownerUid: UserIdSchema.meta(personal("User who created and owns the key.")),
  expiresAt: IsoDateTimeSchema.meta(none("When the key stops working (UTC); at most 365 days after creation.")),
  lastUsedAt: IsoDateTimeSchema.nullable().meta(none("Last successful use, updated at most once a minute (UTC).")),
  status: ApiKeyStatusSchema.meta(none("`revoked` keys answer 401.")),
  revokedReason: ApiKeyRevokedReasonSchema.optional().meta(none("Why the key was revoked.")),
  createdAt: IsoDateTimeSchema.meta(none("When the key was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the key last changed (UTC).")),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

const API_KEY_EXAMPLE = {
  id: EXAMPLE_IDS.apiKey,
  tenantId: EXAMPLE_IDS.organization,
  name: "Reporting export",
  publicId: "K7QX2M4PZ6AB",
  scopes: ["core.project.read", "core.unit.read"],
  node: { level: "organization", tenantId: EXAMPLE_IDS.organization },
  ownerUid: EXAMPLE_IDS.user,
  expiresAt: "2027-03-29T14:30:00.000Z",
  lastUsedAt: null,
  status: "active",
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.created,
} as const;

export const ApiKeyContract = defineContract(ApiKeySchema, {
  id: "identity.ApiKey",
  kind: "entity",
  description: "A scoped API key (service principal) owned by a user of the organization; no secret.",
  examples: [API_KEY_EXAMPLE],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.api-key.read",
});

export const CreateApiKeyInputSchema = z.strictObject({
  name: ApiKeyNameSchema.meta(none("Name of the key.")),
  scopes: scopesField,
  node: tenantNodeRefField("Node the key is limited to."),
  expiresAt: IsoDateTimeSchema.meta(none("Required expiry (UTC), after now and at most 365 days ahead.")),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

export const CreateApiKeyInputContract = defineContract(CreateApiKeyInputSchema, {
  id: "identity.CreateApiKeyInput",
  kind: "command",
  description: "Creates an API key; scopes must be within the caller's permissions at the node.",
  examples: [{ name: API_KEY_EXAMPLE.name, scopes: API_KEY_EXAMPLE.scopes, node: API_KEY_EXAMPLE.node, expiresAt: API_KEY_EXAMPLE.expiresAt }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.api-key.create",
});

export const CreateApiKeyResponseSchema = z.object({
  apiKey: z.object(ApiKeySchema.shape).meta(personal("The created key, as later listed.")),
  secret: z
    .string()
    .min(1)
    .max(200)
    .meta(sensitive("Full key `<prefix>_<publicId>_<secret>`, returned only in this response.")),
});
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

export const CreateApiKeyResponseContract = defineContract(CreateApiKeyResponseSchema, {
  id: "identity.CreateApiKeyResponse",
  kind: "view",
  description: "One-time answer of API key creation, with the full key.",
  examples: [{ apiKey: API_KEY_EXAMPLE, secret: "core_K7QX2M4PZ6AB_q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C" }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
});

export type ApiKeyExpiryIssue = "EXPIRY_NOT_IN_FUTURE" | "EXPIRY_TOO_FAR";

/**
 * Checks an API key expiry against the injected clock (the bound depends on `now`,
 * so it lives beside the schema instead of in it; decision 0008).
 * @returns the issue code, or null when `now < expiresAt <= now + 365 days`.
 */
export const apiKeyExpiryIssue = (args: { expiresAt: string; now: Date }): ApiKeyExpiryIssue | null => {
  const expiresAtMs = Date.parse(args.expiresAt);
  const nowMs = args.now.getTime();
  if (!(expiresAtMs > nowMs)) return "EXPIRY_NOT_IN_FUTURE";
  return expiresAtMs - nowMs > API_KEY_MAX_LIFETIME_DAYS * DAY_MS ? "EXPIRY_TOO_FAR" : null;
};
