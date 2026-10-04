// Identity `/v1` descriptors (SP1 spec §7.3: me, access context, sessions, desktop sessions,
// devices and activations, API keys, platform impersonation).
import { z } from "zod";
import { AccessContextQuerySchema, AccessContextSchema } from "../access/access-context.schema.ts";
import { MyGrantSchema, MyGrantsQuerySchema } from "../access/my-grant.schema.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationParamsSchema } from "../tenancy/endpoints.ts";
import { OrganizationSchema } from "../tenancy/organization.schema.ts";
import { SetActiveOrganizationInputSchema } from "./active-organization-input.schema.ts";
import { ApiKeySchema, CreateApiKeyInputSchema, CreateApiKeyResponseSchema } from "./api-key.schema.ts";
import {
  CreateDesktopSessionResponseSchema,
  ExchangeDesktopSessionInputSchema,
  ExchangeDesktopSessionResponseSchema,
} from "./desktop-session.schema.ts";
import { DeviceSchema } from "./device.schema.ts";
import {
  CreateDeviceActivationInputSchema,
  CreateDeviceActivationResponseSchema,
  RedeemDeviceActivationInputSchema,
  RedeemDeviceActivationResponseSchema,
} from "./device-activation.schema.ts";
import { ApiKeyIdSchema, DeviceIdSchema, ImpersonationSessionIdSchema, SessionIdSchema } from "./ids.schema.ts";
import { StartImpersonationInputSchema, StartImpersonationResponseSchema } from "./impersonation-session.schema.ts";
import { MeSchema } from "./me.schema.ts";
import { SessionSummarySchema } from "./session.schema.ts";
import { UpdateMeInputSchema } from "./update-me-input.schema.ts";

const NOT_FOUND = ["NOT_FOUND"] as const;
const FORBIDDEN = ["FORBIDDEN"] as const;
const UNAUTHORIZED = ["UNAUTHORIZED"] as const;

export const getMeEndpoint = defineEndpoint({
  id: "identity.getMe",
  method: "GET",
  path: "/v1/me",
  auth: "user",
  responses: { 200: dataEnvelope(MeSchema) },
  summary: "Reads the signed-in user; creates the user doc on the first call.",
});

export const updateMeEndpoint = defineEndpoint({
  id: "identity.updateMe",
  method: "PATCH",
  path: "/v1/me",
  auth: "user",
  body: UpdateMeInputSchema,
  responses: { 200: dataEnvelope(MeSchema) },
  summary: "Changes the display name, photo or preferences of the signed-in user.",
});

export const setActiveOrganizationEndpoint = defineEndpoint({
  id: "identity.setActiveOrganization",
  method: "PUT",
  path: "/v1/me/active-organization",
  auth: "user",
  body: SetActiveOrganizationInputSchema,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  rateLimit: "active-organization-switch",
  summary: "Switches the active organization and syncs claims (any live grant in the organization).",
});

export const syncClaimsEndpoint = defineEndpoint({
  id: "identity.syncClaims",
  method: "POST",
  path: "/v1/me/claims/sync",
  auth: "user",
  responses: { 204: null },
  rateLimit: "claims-sync",
  summary: "Rewrites the custom claims from the source of truth (heals a failed sync).",
});

export const listMyOrganizationsEndpoint = defineEndpoint({
  id: "identity.listMyOrganizations",
  method: "GET",
  path: "/v1/me/organizations",
  auth: "user",
  query: PageQuerySchema,
  responses: { 200: listEnvelope(OrganizationSchema) },
  summary: "Lists the organizations where the signed-in user holds any grant.",
});

export const getAccessContextEndpoint = defineEndpoint({
  id: "identity.getAccessContext",
  method: "GET",
  path: "/v1/me/context",
  auth: "principal",
  query: AccessContextQuerySchema,
  responses: { 200: dataEnvelope(AccessContextSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Resolves effective permissions and regional settings at a node (core.organization.read).",
});

export const listMyGrantsEndpoint = defineEndpoint({
  id: "identity.listMyGrants",
  method: "GET",
  path: "/v1/me/grants",
  auth: "user",
  query: MyGrantsQuerySchema,
  responses: { 200: listEnvelope(MyGrantSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Lists the live nodes where the signed-in user holds grants in an organization, widest first.",
});

export const listSessionsEndpoint = defineEndpoint({
  id: "identity.listSessions",
  method: "GET",
  path: "/v1/me/sessions",
  auth: "user",
  query: PageQuerySchema,
  responses: { 200: listEnvelope(SessionSummarySchema) },
  summary: "Lists the active web and desktop sessions of the signed-in user.",
});

export const revokeSessionEndpoint = defineEndpoint({
  id: "identity.revokeSession",
  method: "DELETE",
  path: "/v1/me/sessions/{sessionId}",
  auth: "user",
  params: z.object({ sessionId: SessionIdSchema.meta(none("Session id.")) }),
  responses: { 204: null },
  errors: { 404: NOT_FOUND },
  summary: "Revokes one of the signed-in user's sessions.",
});

export const revokeAllSessionsEndpoint = defineEndpoint({
  id: "identity.revokeAllSessions",
  method: "POST",
  path: "/v1/me/sessions/revoke-all",
  auth: "user",
  responses: { 204: null },
  summary: "Signs out everywhere: revokes refresh tokens and every session record.",
});

export const createDesktopSessionEndpoint = defineEndpoint({
  id: "identity.createDesktopSession",
  method: "POST",
  path: "/v1/me/desktop-sessions",
  auth: "user",
  responses: { 201: dataEnvelope(CreateDesktopSessionResponseSchema) },
  summary: "Creates a desktop session and returns its secret once.",
});

export const exchangeDesktopSessionEndpoint = defineEndpoint({
  id: "identity.exchangeDesktopSession",
  method: "POST",
  path: "/v1/desktop-sessions/exchange",
  auth: "none",
  body: ExchangeDesktopSessionInputSchema,
  responses: { 200: dataEnvelope(ExchangeDesktopSessionResponseSchema) },
  errors: { 401: UNAUTHORIZED },
  rateLimit: "desktop-exchange",
  summary: "Exchanges a desktop session secret for a custom token and a rotated secret.",
});

export const listDevicesEndpoint = defineEndpoint({
  id: "identity.listDevices",
  method: "GET",
  path: "/v1/organizations/{organizationId}/devices",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(DeviceSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the devices of an organization (core.device.read).",
});

export const revokeDeviceEndpoint = defineEndpoint({
  id: "identity.revokeDevice",
  method: "DELETE",
  path: "/v1/devices/{deviceId}",
  auth: "user",
  params: z.object({ deviceId: DeviceIdSchema.meta(none("Device id.")) }),
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Revokes a device: grants removed, tokens revoked, Auth user disabled (core.device.revoke).",
});

export const createDeviceActivationEndpoint = defineEndpoint({
  id: "identity.createDeviceActivation",
  method: "POST",
  path: "/v1/organizations/{organizationId}/device-activations",
  auth: "user",
  params: OrganizationParamsSchema,
  body: CreateDeviceActivationInputSchema,
  responses: { 201: dataEnvelope(CreateDeviceActivationResponseSchema) },
  errors: { 403: [...FORBIDDEN, "ESCALATION_FORBIDDEN"], 404: NOT_FOUND },
  idempotency: "optional",
  summary: "Creates a one-time device activation code (core.device.create).",
});

export const redeemDeviceActivationEndpoint = defineEndpoint({
  id: "identity.redeemDeviceActivation",
  method: "POST",
  path: "/v1/device-activations/redeem",
  auth: "none",
  body: RedeemDeviceActivationInputSchema,
  responses: { 200: dataEnvelope(RedeemDeviceActivationResponseSchema) },
  errors: { 401: UNAUTHORIZED },
  rateLimit: "device-redeem",
  summary: "Redeems an activation code: creates the device and returns its custom token.",
});

export const listApiKeysEndpoint = defineEndpoint({
  id: "identity.listApiKeys",
  method: "GET",
  path: "/v1/organizations/{organizationId}/api-keys",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(ApiKeySchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the API keys of an organization, never their secrets (core.api-key.read).",
});

export const createApiKeyEndpoint = defineEndpoint({
  id: "identity.createApiKey",
  method: "POST",
  path: "/v1/organizations/{organizationId}/api-keys",
  auth: "user",
  params: OrganizationParamsSchema,
  body: CreateApiKeyInputSchema,
  responses: { 201: dataEnvelope(CreateApiKeyResponseSchema) },
  errors: { 403: [...FORBIDDEN, "ESCALATION_FORBIDDEN"], 404: NOT_FOUND },
  idempotency: "optional",
  summary: "Creates a scoped API key and returns the full key once (core.api-key.create).",
});

export const revokeApiKeyEndpoint = defineEndpoint({
  id: "identity.revokeApiKey",
  method: "DELETE",
  path: "/v1/api-keys/{apiKeyId}",
  auth: "user",
  params: z.object({ apiKeyId: ApiKeyIdSchema.meta(none("API key id.")) }),
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Revokes an API key (core.api-key.revoke).",
});

export const startImpersonationEndpoint = defineEndpoint({
  id: "identity.startImpersonation",
  method: "POST",
  path: "/v1/platform/impersonation-sessions",
  auth: "user",
  body: StartImpersonationInputSchema,
  responses: { 201: dataEnvelope(StartImpersonationResponseSchema) },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"], 404: NOT_FOUND },
  summary: "Starts read-only, time-boxed impersonation of a user (platform.user.impersonate with MFA).",
});

export const endImpersonationEndpoint = defineEndpoint({
  id: "identity.endImpersonation",
  method: "POST",
  path: "/v1/platform/impersonation-sessions/{sessionId}/end",
  auth: "user",
  params: z.object({ sessionId: ImpersonationSessionIdSchema.meta(none("Impersonation session id.")) }),
  responses: { 204: null },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"], 404: NOT_FOUND },
  summary: "Ends an impersonation session early.",
});

export const IDENTITY_ENDPOINTS: readonly EndpointDefinition[] = [
  getMeEndpoint,
  updateMeEndpoint,
  setActiveOrganizationEndpoint,
  syncClaimsEndpoint,
  listMyOrganizationsEndpoint,
  getAccessContextEndpoint,
  listMyGrantsEndpoint,
  listSessionsEndpoint,
  revokeSessionEndpoint,
  revokeAllSessionsEndpoint,
  createDesktopSessionEndpoint,
  exchangeDesktopSessionEndpoint,
  listDevicesEndpoint,
  revokeDeviceEndpoint,
  createDeviceActivationEndpoint,
  redeemDeviceActivationEndpoint,
  listApiKeysEndpoint,
  createApiKeyEndpoint,
  revokeApiKeyEndpoint,
  startImpersonationEndpoint,
  endImpersonationEndpoint,
];
