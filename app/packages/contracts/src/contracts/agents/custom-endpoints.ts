// `/v1` descriptors of tenant-defined agents and skills (decision 0046).
import { z } from "zod";
import type { ContractDefinition } from "../contract.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import {
  CreateCustomAgentInputContract,
  CreateCustomAgentInputSchema,
  CustomAgentContract,
  CustomAgentIdSchema,
  CustomAgentSchema,
  UpdateCustomAgentInputContract,
  UpdateCustomAgentInputSchema,
} from "./custom-agent.schema.ts";
import {
  ChatAgentOptionContract,
  ChatAgentOptionSchema,
  CustomAgentOptionsContract,
  CustomAgentOptionsSchema,
} from "./custom-agent-options.schema.ts";
import {
  CreateCustomSkillInputContract,
  CreateCustomSkillInputSchema,
  CustomSkillContract,
  CustomSkillIdSchema,
  CustomSkillSchema,
  UpdateCustomSkillInputContract,
  UpdateCustomSkillInputSchema,
} from "./custom-skill.schema.ts";

const agentParams = z.object({ agentId: CustomAgentIdSchema.meta(none("Custom agent id.")) });
const skillParams = z.object({ skillId: CustomSkillIdSchema.meta(none("Custom skill id.")) });
const FORBIDDEN = ["FORBIDDEN"] as const;
const NOT_FOUND = ["NOT_FOUND"] as const;
const LIMIT = ["CUSTOM_LIMIT_REACHED"] as const;

export const createCustomAgentEndpoint = defineEndpoint({
  id: "custom-agents.create",
  method: "POST",
  path: "/v1/agents",
  auth: "principal",
  query: OrganizationQuerySchema,
  body: CreateCustomAgentInputSchema,
  responses: { 201: dataEnvelope(CustomAgentSchema) },
  errors: { 403: FORBIDDEN, 422: LIMIT },
  idempotency: "optional",
  summary:
    "Creates an agent of the organization (core.agent-settings.update); the plan caps how many and how long their instructions are.",
});

export const getCustomAgentEndpoint = defineEndpoint({
  id: "custom-agents.get",
  method: "GET",
  path: "/v1/agents/{agentId}",
  auth: "principal",
  params: agentParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(CustomAgentSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Reads one agent of the organization (core.agent-settings.read).",
});

export const updateCustomAgentEndpoint = defineEndpoint({
  id: "custom-agents.update",
  method: "PATCH",
  path: "/v1/agents/{agentId}",
  auth: "principal",
  params: agentParams,
  query: OrganizationQuerySchema,
  body: UpdateCustomAgentInputSchema,
  responses: { 200: dataEnvelope(CustomAgentSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Changes an agent's configuration or enables or disables it (core.agent-settings.update).",
});

export const deleteCustomAgentEndpoint = defineEndpoint({
  id: "custom-agents.delete",
  method: "DELETE",
  path: "/v1/agents/{agentId}",
  auth: "principal",
  params: agentParams,
  query: OrganizationQuerySchema,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Deletes an agent of the organization (core.agent-settings.update); its conversations stay readable.",
});

export const getCustomAgentOptionsEndpoint = defineEndpoint({
  id: "custom-agents.options",
  method: "GET",
  path: "/v1/agent-options",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(CustomAgentOptionsSchema) },
  errors: { 403: FORBIDDEN },
  summary:
    "Reads the models, tools and platform skills an agent may select, with the plan limits and their use (core.agent-settings.read).",
});

export const listChatAgentsEndpoint = defineEndpoint({
  id: "custom-agents.listChatAgents",
  method: "GET",
  path: "/v1/chat-agents",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(ChatAgentOptionSchema)) },
  errors: { 403: FORBIDDEN },
  summary:
    "Lists the agents the caller can chat with: the assistant and the organization's enabled agents (core.chat.use).",
});

export const listCustomSkillsEndpoint = defineEndpoint({
  id: "custom-skills.list",
  method: "GET",
  path: "/v1/skills",
  auth: "principal",
  query: OrganizationQuerySchema.extend(PageQuerySchema.shape),
  responses: { 200: listEnvelope(CustomSkillSchema) },
  errors: { 403: FORBIDDEN },
  summary: "Lists the organization's own skills, newest first (core.agent-settings.read).",
});

export const createCustomSkillEndpoint = defineEndpoint({
  id: "custom-skills.create",
  method: "POST",
  path: "/v1/skills",
  auth: "principal",
  query: OrganizationQuerySchema,
  body: CreateCustomSkillInputSchema,
  responses: { 201: dataEnvelope(CustomSkillSchema) },
  errors: { 403: FORBIDDEN, 409: ["CONFLICT"], 422: LIMIT },
  idempotency: "optional",
  summary: "Creates a skill of the organization (core.agent-settings.update); 409 when the name is taken.",
});

export const getCustomSkillEndpoint = defineEndpoint({
  id: "custom-skills.get",
  method: "GET",
  path: "/v1/skills/{skillId}",
  auth: "principal",
  params: skillParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(CustomSkillSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Reads one skill of the organization (core.agent-settings.read).",
});

export const updateCustomSkillEndpoint = defineEndpoint({
  id: "custom-skills.update",
  method: "PATCH",
  path: "/v1/skills/{skillId}",
  auth: "principal",
  params: skillParams,
  query: OrganizationQuerySchema,
  body: UpdateCustomSkillInputSchema,
  responses: { 200: dataEnvelope(CustomSkillSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 409: ["CONFLICT"] },
  summary: "Changes a skill or enables or disables it (core.agent-settings.update).",
});

export const deleteCustomSkillEndpoint = defineEndpoint({
  id: "custom-skills.delete",
  method: "DELETE",
  path: "/v1/skills/{skillId}",
  auth: "principal",
  params: skillParams,
  query: OrganizationQuerySchema,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Deletes a skill of the organization (core.agent-settings.update); agents that selected it run without it.",
});

export const CUSTOM_AGENT_ENDPOINTS: readonly EndpointDefinition[] = [
  createCustomAgentEndpoint,
  getCustomAgentEndpoint,
  updateCustomAgentEndpoint,
  deleteCustomAgentEndpoint,
  getCustomAgentOptionsEndpoint,
  listChatAgentsEndpoint,
  listCustomSkillsEndpoint,
  createCustomSkillEndpoint,
  getCustomSkillEndpoint,
  updateCustomSkillEndpoint,
  deleteCustomSkillEndpoint,
];

export const CUSTOM_AGENT_CONTRACTS: readonly ContractDefinition[] = [
  CustomAgentContract,
  CreateCustomAgentInputContract,
  UpdateCustomAgentInputContract,
  CustomSkillContract,
  CreateCustomSkillInputContract,
  UpdateCustomSkillInputContract,
  CustomAgentOptionsContract,
  ChatAgentOptionContract,
];
