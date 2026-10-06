// Staff settings of the runtime's models and their prices (`/v1/admin/models`, decision 0072).
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { ModelSettingsSchema, UpdateModelSettingsInputSchema } from "./model-settings.schema.ts";

const STAFF_ERRORS = { 403: ["FORBIDDEN", "MFA_REQUIRED"], 502: ["UPSTREAM_UNAVAILABLE"] } as const;

export const adminGetModelSettingsEndpoint = defineEndpoint({
  id: "admin.getModelSettings",
  method: "GET",
  path: "/v1/admin/models",
  auth: "user",
  responses: { 200: dataEnvelope(ModelSettingsSchema) },
  errors: STAFF_ERRORS,
  summary: "The model of each runtime role and the price of each model (staff, platform.model.manage).",
});

export const adminUpdateModelSettingsEndpoint = defineEndpoint({
  id: "admin.updateModelSettings",
  method: "PUT",
  path: "/v1/admin/models",
  auth: "user",
  body: UpdateModelSettingsInputSchema,
  responses: { 200: dataEnvelope(ModelSettingsSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS },
  summary:
    "Replaces the model of each text role and the staff prices; a role needs a priced model of a configured provider (staff, platform.model.manage).",
});

export const ADMIN_MODEL_ENDPOINTS: readonly EndpointDefinition[] = [
  adminGetModelSettingsEndpoint,
  adminUpdateModelSettingsEndpoint,
];
