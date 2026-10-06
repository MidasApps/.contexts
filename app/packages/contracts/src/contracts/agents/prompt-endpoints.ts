// Prompt store `/v1` descriptors (SP5 spec §4, decision 0038): staff platform prompts, tenant addenda.
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import { ActivatePromptVersionInputSchema, PromptActivationSchema } from "./prompt-activation.schema.ts";
import { PromptAgentIdSchema, PromptEvalResultSchema, PromptSeedSchema } from "./prompt-eval.schema.ts";
import { CreatePromptVersionInputSchema, PromptVersionIdSchema, PromptVersionSchema } from "./prompt-version.schema.ts";

const agentParams = z.object({ agentId: PromptAgentIdSchema.meta(none("Agent whose prompt this is.")) });
const versionParams = agentParams.extend({ versionId: PromptVersionIdSchema.meta(none("Prompt version.")) });
const STAFF = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;
const ACTIVATION_ERRORS = { 400: ["VALIDATION_FAILED"], 404: ["NOT_FOUND"], 409: ["EVAL_REQUIRED"] } as const;
const EVAL_ERRORS = {
  404: ["NOT_FOUND"],
  422: ["EVAL_DATASET_MISSING"],
  502: ["UPSTREAM_UNAVAILABLE"],
  503: ["UPSTREAM_UNAVAILABLE"],
} as const;

export const adminListPromptVersionsEndpoint = defineEndpoint({
  id: "prompts.adminListVersions",
  method: "GET",
  path: "/v1/admin/agents/{agentId}/prompt-versions",
  auth: "user",
  params: agentParams,
  responses: { 200: dataEnvelope(z.array(PromptVersionSchema)) },
  errors: STAFF,
  summary: "Lists the platform prompt versions of an agent, newest first (staff, platform.prompt.manage).",
});

export const adminCreatePromptVersionEndpoint = defineEndpoint({
  id: "prompts.adminCreateVersion",
  method: "POST",
  path: "/v1/admin/agents/{agentId}/prompt-versions",
  auth: "user",
  params: agentParams,
  body: CreatePromptVersionInputSchema,
  responses: { 201: dataEnvelope(PromptVersionSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF },
  summary: "Writes a new platform prompt version (never an update).",
});

export const adminEvaluatePromptVersionEndpoint = defineEndpoint({
  id: "prompts.adminEvaluateVersion",
  method: "POST",
  path: "/v1/admin/agents/{agentId}/prompt-versions/{versionId}/eval",
  auth: "user",
  params: versionParams,
  responses: { 200: dataEnvelope(PromptEvalResultSchema) },
  errors: { ...STAFF, ...EVAL_ERRORS },
  idempotency: "optional",
  summary: "Runs the agent's eval set with the version and records the verdict.",
});

export const adminListPromptActivationsEndpoint = defineEndpoint({
  id: "prompts.adminListActivations",
  method: "GET",
  path: "/v1/admin/agents/{agentId}/activations",
  auth: "user",
  params: agentParams,
  responses: { 200: dataEnvelope(z.array(PromptActivationSchema)) },
  errors: STAFF,
  summary: "Lists the activations of the platform prompt, newest (active) first.",
});

export const adminActivatePromptEndpoint = defineEndpoint({
  id: "prompts.adminActivate",
  method: "POST",
  path: "/v1/admin/agents/{agentId}/activations",
  auth: "user",
  params: agentParams,
  body: ActivatePromptVersionInputSchema,
  responses: { 201: dataEnvelope(PromptActivationSchema) },
  errors: { ...STAFF, ...ACTIVATION_ERRORS },
  summary:
    "Activates a platform version (eval-gated; staff may force with a reason). A rollback activates an older version.",
});

export const listAddendumVersionsEndpoint = defineEndpoint({
  id: "prompts.listAddendumVersions",
  method: "GET",
  path: "/v1/agents/{agentId}/prompt-addendum/versions",
  auth: "principal",
  params: agentParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(PromptVersionSchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's addendum versions of an agent (core.prompt.read).",
});

export const createAddendumVersionEndpoint = defineEndpoint({
  id: "prompts.createAddendumVersion",
  method: "POST",
  path: "/v1/agents/{agentId}/prompt-addendum/versions",
  auth: "user",
  params: agentParams,
  query: OrganizationQuerySchema,
  body: CreatePromptVersionInputSchema,
  responses: { 201: dataEnvelope(PromptVersionSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"] },
  summary:
    "Writes a new addendum version; it is appended to the platform prompt, never replaces it (core.prompt.write).",
});

export const evaluateAddendumVersionEndpoint = defineEndpoint({
  id: "prompts.evaluateAddendumVersion",
  method: "POST",
  path: "/v1/agents/{agentId}/prompt-addendum/versions/{versionId}/eval",
  auth: "user",
  params: versionParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(PromptEvalResultSchema) },
  errors: { 403: ["FORBIDDEN"], ...EVAL_ERRORS },
  idempotency: "optional",
  summary: "Runs the agent's eval set with the platform prompt plus this addendum (core.prompt.write).",
});

export const listAddendumActivationsEndpoint = defineEndpoint({
  id: "prompts.listAddendumActivations",
  method: "GET",
  path: "/v1/agents/{agentId}/prompt-addendum/activations",
  auth: "principal",
  params: agentParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(PromptActivationSchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the addendum activations, newest (active) first (core.prompt.read).",
});

export const activateAddendumEndpoint = defineEndpoint({
  id: "prompts.activateAddendum",
  method: "POST",
  path: "/v1/agents/{agentId}/prompt-addendum/activations",
  auth: "user",
  params: agentParams,
  query: OrganizationQuerySchema,
  body: ActivatePromptVersionInputSchema,
  responses: { 201: dataEnvelope(PromptActivationSchema) },
  errors: { 403: ["FORBIDDEN"], ...ACTIVATION_ERRORS },
  summary: "Activates an addendum version with a passing eval (core.prompt.write; only staff may force).",
});

export const adminGetPromptSeedEndpoint = defineEndpoint({
  id: "prompts.adminGetSeed",
  method: "GET",
  path: "/v1/admin/agents/{agentId}/prompt-seed",
  auth: "user",
  params: agentParams,
  responses: { 200: dataEnvelope(PromptSeedSchema) },
  errors: { ...STAFF, 404: ["NOT_FOUND"], 502: ["UPSTREAM_UNAVAILABLE"] },
  summary:
    "The instructions the agent ships with in code, to start a first version from (staff, platform.prompt.manage).",
});

export const PROMPT_ENDPOINTS: readonly EndpointDefinition[] = [
  adminListPromptVersionsEndpoint,
  adminGetPromptSeedEndpoint,
  adminCreatePromptVersionEndpoint,
  adminEvaluatePromptVersionEndpoint,
  adminListPromptActivationsEndpoint,
  adminActivatePromptEndpoint,
  listAddendumVersionsEndpoint,
  createAddendumVersionEndpoint,
  evaluateAddendumVersionEndpoint,
  listAddendumActivationsEndpoint,
  activateAddendumEndpoint,
];
