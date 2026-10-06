// Agent runtime `/v1` descriptors (SP3 spec §9, decision 0027 amendment of Task 24).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";

/**
 * One MCP message (JSON-RPC 2.0, MCP revision 2026-07-28). The protocol owns its fields
 * (`id`, `params`, `result`, `error`), so the object stays loose; the core MCP server
 * validates every method and its params.
 */
export const McpMessageSchema = z
  .looseObject({
    jsonrpc: z.literal("2.0").meta(none("JSON-RPC version.")),
    method: z.string().min(1).max(200).meta(none("MCP method, e.g. tools/list or tools/call.")),
  })
  .meta(none("A JSON-RPC 2.0 request or notification of the Model Context Protocol."));

/** The answer: a JSON-RPC result or error (or an SSE stream of them, `text/event-stream`). */
export const McpResponseSchema = z
  .looseObject({ jsonrpc: z.literal("2.0").meta(none("JSON-RPC version.")) })
  .meta(none("A JSON-RPC 2.0 response of the Model Context Protocol."));

export const callMcpEndpoint = defineEndpoint({
  id: "agents.callMcp",
  method: "POST",
  path: "/v1/mcp",
  auth: "principal",
  query: z.strictObject({
    organizationId: OrganizationIdSchema.optional().meta(
      none("Organization to act in; required for users, and when given it must be an API key's own organization."),
    ),
  }),
  body: McpMessageSchema,
  responses: { 200: McpResponseSchema },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  rateLimit: "mcp-call",
  summary:
    "Model Context Protocol endpoint of the core MCP server: read tools, the assistant and catalog resources (core.mcp.use).",
});

export const AGENTS_ENDPOINTS: readonly EndpointDefinition[] = [callMcpEndpoint];
