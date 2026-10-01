import {
  createScheduleEndpoint,
  deleteScheduleEndpoint,
  getScheduleEndpoint,
  listSchedulesEndpoint,
  pauseScheduleEndpoint,
  resumeScheduleEndpoint,
  runScheduleNowEndpoint,
  updateScheduleEndpoint,
} from "@core/contracts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { WorkflowGatewayResult, WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { makeCreateSchedule } from "../../application/use-cases/create-schedule.ts";
import { makeDeleteSchedule } from "../../application/use-cases/delete-schedule.ts";
import { makeListSchedules } from "../../application/use-cases/list-schedules.ts";
import { makePauseSchedule } from "../../application/use-cases/pause-schedule.ts";
import { makeResumeSchedule } from "../../application/use-cases/resume-schedule.ts";
import { makeRunScheduleNow } from "../../application/use-cases/run-schedule-now.ts";
import { makeUpdateSchedule } from "../../application/use-cases/update-schedule.ts";
import { workflowCallScope, workflowGatewayErrorResponse } from "./workflow-call-scope.ts";

export const SCHEDULE_PERMISSIONS = { read: "core.schedule.read", write: "core.schedule.write" } as const;

export type SchedulesRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: WorkflowRuntimeGateway;
  readonly resolveAccessContext: ResolveAccessContext;
};

const answer = <T>(result: WorkflowGatewayResult<T>, requestId: string, status: 200 | 201 | 202 = 200): Response =>
  result.ok ? dataResponse({ data: result.data }, { status }) : workflowGatewayErrorResponse(result.error, requestId);

type ScopeContext = Parameters<typeof workflowCallScope>[0]["ctx"] & { readonly input: { readonly query: { readonly organizationId?: Parameters<typeof workflowCallScope>[0]["organizationId"] } } };

/**
 * `/v1/schedules` (SP5 spec §3.5, decision 0037): auth (pipeline) → validate (pipeline) → authorize
 * `core.schedule.read|write` at the organization → the runtime's `/tenant-schedules` routes with the
 * caller's own Bearer. The runtime owns the policy (minimum interval from its env, `schedulable`
 * workflows, the workflow's input schema) and answers another tenant's schedule as 404.
 */
export const buildSchedulesRoutes = (deps: SchedulesRouteDeps): Record<string, RouteHandler> => {
  const list = makeListSchedules(deps);
  const create = makeCreateSchedule(deps);
  const update = makeUpdateSchedule(deps);
  const pause = makePauseSchedule(deps);
  const resume = makeResumeSchedule(deps);
  const runNow = makeRunScheduleNow(deps);
  const remove = makeDeleteSchedule(deps);
  const scopeOf = (ctx: ScopeContext, permission: string) =>
    workflowCallScope({ ctx, organizationId: ctx.input.query.organizationId, permission, resolveAccessContext: deps.resolveAccessContext });
  return {
    [listSchedulesEndpoint.id]: withApiRoute(listSchedulesEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.read);
      return scope instanceof Response ? scope : answer(await list(scope), ctx.requestId);
    }),
    [getScheduleEndpoint.id]: withApiRoute(getScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.read);
      return scope instanceof Response ? scope : answer(await deps.gateway.getSchedule(scope, ctx.input.params.scheduleId), ctx.requestId);
    }),
    [createScheduleEndpoint.id]: withApiRoute(createScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      return scope instanceof Response ? scope : answer(await create(scope, ctx.input.body), ctx.requestId, 201);
    }),
    [updateScheduleEndpoint.id]: withApiRoute(updateScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      return scope instanceof Response ? scope : answer(await update(scope, ctx.input.params.scheduleId, ctx.input.body), ctx.requestId);
    }),
    [pauseScheduleEndpoint.id]: withApiRoute(pauseScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      return scope instanceof Response ? scope : answer(await pause(scope, ctx.input.params.scheduleId), ctx.requestId);
    }),
    [resumeScheduleEndpoint.id]: withApiRoute(resumeScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      return scope instanceof Response ? scope : answer(await resume(scope, ctx.input.params.scheduleId), ctx.requestId);
    }),
    [runScheduleNowEndpoint.id]: withApiRoute(runScheduleNowEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      return scope instanceof Response ? scope : answer(await runNow(scope, ctx.input.params.scheduleId), ctx.requestId, 202);
    }),
    [deleteScheduleEndpoint.id]: withApiRoute(deleteScheduleEndpoint, deps.pipeline, async (ctx) => {
      const scope = await scopeOf(ctx, SCHEDULE_PERMISSIONS.write);
      if (scope instanceof Response) return scope;
      const result = await remove(scope, ctx.input.params.scheduleId);
      return result.ok ? new Response(null, { status: 204 }) : workflowGatewayErrorResponse(result.error, ctx.requestId);
    }),
  };
};
