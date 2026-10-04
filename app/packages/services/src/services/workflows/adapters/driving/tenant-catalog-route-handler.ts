import { listAgentCatalogEndpoint, listWorkflowCatalogEndpoint } from "@core/contracts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { dataResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { workflowCallScope, workflowGatewayErrorResponse } from "./workflow-call-scope.ts";

export const TENANT_CATALOG_PERMISSIONS = {
  agents: "core.agent-settings.read",
  workflows: "core.workflow-run.read",
} as const;

export type TenantCatalogRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: Pick<WorkflowRuntimeGateway, "listAgentCatalog" | "listWorkflowCatalog">;
  readonly resolveAccessContext: ResolveAccessContext;
};

/**
 * `GET /v1/agents` and `GET /v1/workflows` (SP5 Task 14, the tenant settings pages): what the
 * runtime offers the organization of the call. Auth and validation by the pipeline, then the read
 * permission at the organization, then the runtime catalog route with the caller's own Bearer
 * (it reads the tenant from the verified context and authorizes again). Read only: agents, skills
 * and workflows are defined in code, so there is nothing to create here.
 */
export const buildTenantCatalogRoutes = (deps: TenantCatalogRouteDeps): Record<string, RouteHandler> => ({
  [listAgentCatalogEndpoint.id]: withApiRoute(listAgentCatalogEndpoint, deps.pipeline, async (ctx) => {
    const scope = await workflowCallScope({
      ctx,
      organizationId: ctx.input.query.organizationId,
      permission: TENANT_CATALOG_PERMISSIONS.agents,
      resolveAccessContext: deps.resolveAccessContext,
    });
    if (scope instanceof Response) return scope;
    const result = await deps.gateway.listAgentCatalog(scope);
    return result.ok ? dataResponse({ data: result.data }) : workflowGatewayErrorResponse(result.error, ctx.requestId);
  }),
  [listWorkflowCatalogEndpoint.id]: withApiRoute(listWorkflowCatalogEndpoint, deps.pipeline, async (ctx) => {
    const scope = await workflowCallScope({
      ctx,
      organizationId: ctx.input.query.organizationId,
      permission: TENANT_CATALOG_PERMISSIONS.workflows,
      resolveAccessContext: deps.resolveAccessContext,
    });
    if (scope instanceof Response) return scope;
    const result = await deps.gateway.listWorkflowCatalog(scope);
    return result.ok ? dataResponse({ data: result.data }) : workflowGatewayErrorResponse(result.error, ctx.requestId);
  }),
});
