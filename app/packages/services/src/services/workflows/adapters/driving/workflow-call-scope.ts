import { FORWARDED_HEADERS, type Principal, type TenantId } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { authorizeOrganization } from "../../../knowledge/adapters/driving/knowledge-documents-route-handler.ts";
import { apiError } from "../../../shared/http/api-errors.ts";
import type { WorkflowGatewayError } from "../../application/ports/workflow-runtime-gateway.ts";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * The organization of the call: an API key or device acts only in its own one (another is 403);
 * a user names it in `?organizationId=` (like `/v1/mcp`). Never read from the body.
 */
export const tenantOfCall = (
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

type ScopeArgs = {
  readonly ctx: {
    readonly principal: Principal;
    readonly authorize: Authorize;
    readonly requestId: string;
    readonly request: Request;
  };
  readonly organizationId: TenantId | undefined;
  readonly permission: string;
  readonly resolveAccessContext: ResolveAccessContext;
};

/**
 * Handler order of `/v1` (auth already done by the pipeline): organization → authorize the
 * permission there → resolve the caller's context → the Mastra call scope with the caller's own
 * Bearer. The runtime authorizes again from the same Bearer.
 */
export const workflowCallScope = async (args: ScopeArgs): Promise<AgentCallScope | Response> => {
  const { principal, authorize, requestId } = args.ctx;
  const tenantId = tenantOfCall(principal, args.organizationId, requestId);
  if (tenantId instanceof Response) return tenantId;
  const denied = await authorizeOrganization({
    authorize,
    principal: principal,
    tenantId,
    permission: args.permission,
    requestId,
  });
  if (denied !== null) return denied;
  return (
    (await runtimeCallScope({ ctx: args.ctx, tenantId, resolveAccessContext: args.resolveAccessContext })) ??
    apiError(403, "FORBIDDEN", requestId)
  );
};

/**
 * The Mastra call scope of a caller already authorized at the organization: its access context
 * and its own Bearer. `null` without either.
 */
export const runtimeCallScope = async (args: {
  readonly ctx: Pick<ScopeArgs["ctx"], "principal" | "requestId" | "request">;
  readonly tenantId: TenantId;
  readonly resolveAccessContext: ResolveAccessContext;
}): Promise<AgentCallScope | null> => {
  const { principal, requestId, request } = args.ctx;
  const { tenantId } = args;
  const context = await args.resolveAccessContext({ principal: principal, node: { level: "organization", tenantId } });
  const bearer = BEARER.exec(request.headers.get(FORWARDED_HEADERS.authorization) ?? "")?.[1];
  if (context === null || bearer === undefined) return null;
  const traceparent = request.headers.get(FORWARDED_HEADERS.traceparent);
  return {
    bearer,
    tenantId,
    regional: context.regional,
    requestId,
    ...(traceparent === null ? {} : { traceparent }),
    signal: request.signal,
  };
};

/** `/v1` answer of a gateway error: status, code and (validation) details only. */
export const workflowGatewayErrorResponse = (error: WorkflowGatewayError, requestId: string): Response => {
  const response = apiError(
    error.status,
    error.code,
    requestId,
    error.details === undefined ? undefined : [...error.details],
  );
  if (error.status === 429) response.headers.set("retry-after", "1");
  return response;
};
