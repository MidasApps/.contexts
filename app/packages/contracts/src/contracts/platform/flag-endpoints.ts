// Feature flag `/v1` descriptors (SP5 spec §5, decision 0039): tenant view and overrides, staff console.
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import { FeatureFlagKeySchema, FeatureFlagSchema, SetFeatureFlagValueInputSchema, TenantFlagValueInputSchema } from "./feature-flag.schema.ts";

const flagParams = z.object({ flagKey: FeatureFlagKeySchema.meta(none("Flag key (`chat.voice`).")) });

export const listFlagsEndpoint = defineEndpoint({
  id: "flags.list",
  method: "GET",
  path: "/v1/flags",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(FeatureFlagSchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the flags an organization may override, with their effective values (core.flag.read).",
});

export const setTenantFlagEndpoint = defineEndpoint({
  id: "flags.setTenantValue",
  method: "PUT",
  path: "/v1/flags/{flagKey}",
  auth: "user",
  params: flagParams,
  query: OrganizationQuerySchema,
  body: TenantFlagValueInputSchema,
  responses: { 200: dataEnvelope(FeatureFlagSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Overrides a tenant-overridable flag for the organization; it may not enable what the environment disables (core.flag.write).",
});

export const clearTenantFlagEndpoint = defineEndpoint({
  id: "flags.clearTenantOverride",
  method: "DELETE",
  path: "/v1/flags/{flagKey}",
  auth: "user",
  params: flagParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(FeatureFlagSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Removes the organization's own override of a tenant-overridable flag, so the environment value applies again; idempotent (core.flag.write).",
});

export const adminListFlagsEndpoint = defineEndpoint({
  id: "flags.adminList",
  method: "GET",
  path: "/v1/admin/flags",
  auth: "user",
  query: z.object({ organizationId: OrganizationIdSchema.optional().meta(none("Show this organization's overrides.")) }),
  responses: { 200: dataEnvelope(z.array(FeatureFlagSchema)) },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"] },
  summary: "Lists every flag of the registry with values and expiry warnings (staff, platform.flag.manage).",
});

export const adminSetFlagEndpoint = defineEndpoint({
  id: "flags.adminSetValue",
  method: "PUT",
  path: "/v1/admin/flags/{flagKey}",
  auth: "user",
  params: flagParams,
  body: SetFeatureFlagValueInputSchema,
  responses: { 200: dataEnvelope(FeatureFlagSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN", "MFA_REQUIRED"], 404: ["NOT_FOUND"] },
  summary: "Sets a flag for the environment or overrides it for one organization (staff, audited with targetTenantId).",
});

export const adminClearFlagOverrideEndpoint = defineEndpoint({
  id: "flags.adminClearOverride",
  method: "DELETE",
  path: "/v1/admin/flags/{flagKey}/overrides/{organizationId}",
  auth: "user",
  params: z.object({
    flagKey: FeatureFlagKeySchema.meta(none("Flag key (`chat.voice`).")),
    organizationId: OrganizationIdSchema.meta(none("Organization whose override is removed.")),
  }),
  responses: { 200: dataEnvelope(FeatureFlagSchema) },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"], 404: ["NOT_FOUND"] },
  summary: "Removes an organization's override of a flag, so the environment value applies again; idempotent (staff, platform.flag.manage; audited with targetTenantId).",
});

export const FLAG_ENDPOINTS: readonly EndpointDefinition[] = [listFlagsEndpoint, setTenantFlagEndpoint, clearTenantFlagEndpoint, adminListFlagsEndpoint, adminSetFlagEndpoint, adminClearFlagOverrideEndpoint];
