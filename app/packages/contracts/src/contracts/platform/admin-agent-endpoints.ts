// Staff catalog of the registered agents (`/v1/admin/agents`, decision 0044).
import { z } from "zod";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { AdminAgentSchema } from "./admin-agent.schema.ts";

export const adminListAgentsEndpoint = defineEndpoint({
  id: "admin.listAgents",
  method: "GET",
  path: "/v1/admin/agents",
  auth: "user",
  responses: { 200: dataEnvelope(z.array(AdminAgentSchema)) },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"], 502: ["UPSTREAM_UNAVAILABLE"] },
  summary: "Lists the agents registered in the runtime with their subagents, tools, skills and permission ceiling (staff, platform.agent.manage).",
});

export const ADMIN_AGENT_ENDPOINTS: readonly EndpointDefinition[] = [adminListAgentsEndpoint];
