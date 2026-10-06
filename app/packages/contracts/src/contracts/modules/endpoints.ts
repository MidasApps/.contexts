// Module settings `/v1` descriptors (decision 0015 §6; SP2 spec §6).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { ModuleIdSchema } from "./module-manifest.schema.ts";
import { ModuleSettingsSchema, ModuleSettingsValuesSchema } from "./module-settings.schema.ts";

export const ModuleSettingsParamsSchema = z.object({
  organizationId: OrganizationIdSchema.meta(none("Organization id.")),
  moduleId: ModuleIdSchema.meta(none("Installed module id.")),
});

export const getModuleSettingsEndpoint = defineEndpoint({
  id: "modules.getModuleSettings",
  method: "GET",
  path: "/v1/organizations/{organizationId}/module-settings/{moduleId}",
  auth: "principal",
  params: ModuleSettingsParamsSchema,
  responses: { 200: dataEnvelope(ModuleSettingsSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Reads a module's settings in an organization (the module's read permission).",
});

export const updateModuleSettingsEndpoint = defineEndpoint({
  id: "modules.updateModuleSettings",
  method: "PUT",
  path: "/v1/organizations/{organizationId}/module-settings/{moduleId}",
  auth: "principal",
  params: ModuleSettingsParamsSchema,
  body: ModuleSettingsValuesSchema,
  responses: { 200: dataEnvelope(ModuleSettingsSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Replaces a module's settings, validated by its settings contract (the module's update permission).",
});

export const MODULES_ENDPOINTS: readonly EndpointDefinition[] = [
  getModuleSettingsEndpoint,
  updateModuleSettingsEndpoint,
];
