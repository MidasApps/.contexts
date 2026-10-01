// Tenant `/settings` descriptors added by SP5 Task 14 (spec §7): what the settings pages read that
// no earlier endpoint served: the agent and workflow catalogs of the runtime and the usage summary.
import { z } from "zod";
import { AgentCatalogEntryContract, AgentCatalogEntrySchema } from "./agents/agent-catalog.schema.ts";
import type { ContractDefinition } from "./contract.ts";
import { none } from "./field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "./http/endpoint.ts";
import { dataEnvelope } from "./http/envelopes.schema.ts";
import { UsageSummarySchema } from "./usage/usage-summary.schema.ts";
import { OrganizationQuerySchema } from "./workflows/endpoints.ts";
import { WorkflowCatalogEntryContract, WorkflowCatalogEntrySchema } from "./workflows/workflow-catalog.schema.ts";

export const listAgentCatalogEndpoint = defineEndpoint({
  id: "agents.listCatalog",
  method: "GET",
  path: "/v1/agents",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(AgentCatalogEntrySchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the subagents available to the organization with their enabled state, tools and skills (core.agent-settings.read).",
});

export const listWorkflowCatalogEndpoint = defineEndpoint({
  id: "workflows.listCatalog",
  method: "GET",
  path: "/v1/workflows",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(WorkflowCatalogEntrySchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the workflows the organization may start or schedule, with their input schema (core.workflow-run.read).",
});

export const getUsageSummaryEndpoint = defineEndpoint({
  id: "usage.getSummary",
  method: "GET",
  path: "/v1/usage",
  auth: "principal",
  query: OrganizationQuerySchema.extend({
    month: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
      .optional()
      .meta(none("Calendar month in UTC, YYYY-MM; defaults to the current month.")),
  }),
  responses: { 200: dataEnvelope(UsageSummarySchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Reads the organization's model usage and cost for a month against its budget caps (core.usage.read).",
});

export const SP5_SETTINGS_ENDPOINTS: readonly EndpointDefinition[] = [listAgentCatalogEndpoint, listWorkflowCatalogEndpoint, getUsageSummaryEndpoint];

export const SP5_SETTINGS_CONTRACTS: readonly ContractDefinition[] = [AgentCatalogEntryContract, WorkflowCatalogEntryContract];
