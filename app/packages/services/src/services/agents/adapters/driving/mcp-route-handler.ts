import { callMcpEndpoint, FORWARDED_HEADERS, type Principal, type TenantId } from "@core/contracts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { authorizeOrganization } from "../../../knowledge/adapters/driving/knowledge-documents-route-handler.ts";
import { apiError } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type {
  AgentCallScope,
  AgentRuntimeGateway,
  McpGatewayResponse,
} from "../../application/ports/agent-runtime-gateway.ts";
import { gatewayErrorResponse } from "../driven/mastra-error-mapper.ts";
import { mcpHeadersOf } from "../driven/mastra-request.ts";

export const MCP_USE_PERMISSION = "core.mcp.use";
/** Mastra MCP server id (`@core/agents` `CORE_MCP_SERVER_ID`). */
export const CORE_MCP_SERVER = "core";

const BEARER = /^Bearer\s+(\S+)$/i;

type McpRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: AgentRuntimeGateway;
  readonly resolveAccessContext: ResolveAccessContext;
};

/**
 * The organization of the call: an API key acts only in its own organization (a different
 * `organizationId` is 403); a user names it in the query, like `GET /v1/me/context`.
 */
const tenantOf = (
  principal: Principal,
  organizationId: TenantId | undefined,
  requestId: string,
): TenantId | Response => {
  if (principal.type === "service" || principal.type === "device") {
    return organizationId === undefined || organizationId === principal.tenantId
      ? principal.tenantId
      : apiError(403, "FORBIDDEN", requestId);
  }
  return (
    organizationId ?? apiError(400, "VALIDATION_FAILED", requestId, [{ field: "organizationId", issue: "REQUIRED" }])
  );
};

const toResponse = (answer: McpGatewayResponse): Response =>
  new Response(answer.body, {
    status: answer.status,
    headers: { ...answer.headers, ...(answer.contentType === null ? {} : { "content-type": answer.contentType }) },
  });

/**
 * `POST /v1/mcp` (SP3 Task 24, decision 0027 D3-15): the public entry of the core MCP server.
 * Auth (user Bearer or API key) → validate (JSON-RPC 2.0 message) → `core.mcp.use` at the
 * organization → the gateway proxies the message to Mastra `/api/mcp/core/mcp` with the
 * caller's own Bearer, the resolved scope and the MCP transport headers only. Requests are
 * stateless (MCP 2026-07-28), so there is no GET stream or DELETE; `Mcp-Session-Id` passes
 * through untouched. Rate limit `mcp-call` per principal.
 */
export const buildMcpRoutes = (deps: McpRouteDeps): Record<string, RouteHandler> => ({
  [callMcpEndpoint.id]: withApiRoute(
    callMcpEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request }) => {
      const tenantId = tenantOf(principal, input.query.organizationId, requestId);
      if (tenantId instanceof Response) return tenantId;
      const denied = await authorizeOrganization({
        authorize,
        principal,
        tenantId,
        permission: MCP_USE_PERMISSION,
        requestId,
      });
      if (denied !== null) return denied;
      const context = await deps.resolveAccessContext({ principal, node: { level: "organization", tenantId } });
      const bearer = BEARER.exec(request.headers.get(FORWARDED_HEADERS.authorization) ?? "")?.[1];
      if (context === null || bearer === undefined) return apiError(403, "FORBIDDEN", requestId);
      const traceparent = request.headers.get(FORWARDED_HEADERS.traceparent);
      const scope: AgentCallScope = {
        bearer,
        tenantId,
        regional: context.regional,
        requestId,
        ...(traceparent === null ? {} : { traceparent }),
        signal: request.signal,
      };
      const answer = await deps.gateway.callMcp({
        scope,
        serverId: CORE_MCP_SERVER,
        body: input.body,
        headers: mcpHeadersOf(request.headers),
      });
      return answer.ok ? toResponse(answer.data) : gatewayErrorResponse(answer.error, requestId);
    },
  ),
});
