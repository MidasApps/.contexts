import {
  cancelWorkflowRunEndpoint,
  getWorkflowRunEndpoint,
  listWorkflowRunsEndpoint,
  startWorkflowRunEndpoint,
} from "@core/contracts";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import { dataResponse } from "#/services/shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { makeCancelRun } from "../../application/use-cases/cancel-run.ts";
import { makeGetRun } from "../../application/use-cases/get-run.ts";
import { makeListRuns } from "../../application/use-cases/list-runs.ts";
import { makeStartRun } from "../../application/use-cases/start-run.ts";
import { workflowCallScope, workflowGatewayErrorResponse } from "./workflow-call-scope.ts";

export const WORKFLOW_RUN_PERMISSIONS = {
  read: "core.workflow-run.read",
  start: "core.workflow-run.start",
  cancel: "core.workflow-run.cancel",
} as const;

export type WorkflowRunsRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: WorkflowRuntimeGateway;
  readonly resolveAccessContext: ResolveAccessContext;
};

/**
 * `/v1/workflows/runs` (list, read, cancel) and `POST /v1/workflows/{workflowId}/runs` (SP5 spec
 * §3.6, decision 0040): auth (pipeline) → validate (pipeline) → authorize the permission at the
 * organization → the runtime route with the caller's own Bearer, which scopes runs by the
 * `tenantId:` resource prefix (another tenant's run is 404) and authorizes again.
 */
export const buildWorkflowRunsRoutes = (deps: WorkflowRunsRouteDeps): Record<string, RouteHandler> => {
  const listRuns = makeListRuns(deps);
  const getRun = makeGetRun(deps);
  const cancelRun = makeCancelRun(deps);
  const startRun = makeStartRun(deps);
  const scopeOf = (
    ctx: Parameters<typeof workflowCallScope>[0]["ctx"],
    organizationId: Parameters<typeof workflowCallScope>[0]["organizationId"],
    permission: string,
  ) => workflowCallScope({ ctx, organizationId, permission, resolveAccessContext: deps.resolveAccessContext });
  return {
    [listWorkflowRunsEndpoint.id]: withApiRoute(listWorkflowRunsEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, ctx.input.query.organizationId, WORKFLOW_RUN_PERMISSIONS.read);
      if (scope instanceof Response) return scope;
      const { workflowId, status, cursor, limit } = ctx.input.query;
      const result = await listRuns(scope, {
        limit,
        ...(workflowId === undefined ? {} : { workflowId }),
        ...(status === undefined ? {} : { status }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return result.ok
        ? dataResponse({ data: result.data.runs, meta: { page: result.data.page } })
        : workflowGatewayErrorResponse(result.error, ctx.requestId);
    }),
    [getWorkflowRunEndpoint.id]: withApiRoute(getWorkflowRunEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, ctx.input.query.organizationId, WORKFLOW_RUN_PERMISSIONS.read);
      if (scope instanceof Response) return scope;
      const result = await getRun(scope, ctx.input.params.runId);
      return result.ok
        ? dataResponse({ data: result.data })
        : workflowGatewayErrorResponse(result.error, ctx.requestId);
    }),
    [cancelWorkflowRunEndpoint.id]: withApiRoute(cancelWorkflowRunEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, ctx.input.query.organizationId, WORKFLOW_RUN_PERMISSIONS.cancel);
      if (scope instanceof Response) return scope;
      const result = await cancelRun(scope, ctx.input.params.runId);
      return result.ok
        ? new Response(null, { status: 204 })
        : workflowGatewayErrorResponse(result.error, ctx.requestId);
    }),
    [startWorkflowRunEndpoint.id]: withApiRoute(startWorkflowRunEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, ctx.input.query.organizationId, WORKFLOW_RUN_PERMISSIONS.start);
      if (scope instanceof Response) return scope;
      const result = await startRun(scope, {
        workflowId: ctx.input.params.workflowId,
        inputData: ctx.input.body.inputData,
      });
      return result.ok
        ? dataResponse({ data: result.data }, { status: 202 })
        : workflowGatewayErrorResponse(result.error, ctx.requestId);
    }),
  };
};
