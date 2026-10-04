import {
  CreateScheduleInputSchema,
  SCHEDULE_PREVIEW_FIRES,
  SchedulePreviewInputSchema,
  UpdateScheduleInputSchema,
} from "@core/contracts";
import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import type { z } from "zod";
import type { AccessPort } from "../../runtime/runtime-ports.ts";
import {
  authorizeCaller,
  dataJson,
  type FieldIssue,
  inputsOf,
  type RouteInputs,
  routeError,
  validateWorkflowInput,
} from "../runs/workflow-route-http.ts";
import type { WorkflowCatalog } from "../workflow-catalog.ts";
import { checkSchedule, previewFires } from "./schedule-policy.ts";
import {
  isTenantSchedule,
  type StoredSchedule,
  scheduledRunContextOf,
  scheduleIdOf,
  toScheduleView,
} from "./tenant-schedule-view.ts";

/** Custom routes of tenant schedules (SP5 spec §3.5, decision 0037); `/v1/schedules` calls them. */
export const TENANT_SCHEDULE_ROUTES_PATTERN = "/tenant-schedules/*";
export const SCHEDULE_PERMISSIONS = { read: "core.schedule.read", write: "core.schedule.write" } as const;

export type TenantScheduleRouteDeps = {
  readonly access: AccessPort;
  readonly catalog: WorkflowCatalog;
  readonly minIntervalMinutes: number;
  readonly logger: Pick<Logger, "info" | "error">;
  /** Test seam; defaults to `Date.now`. */
  readonly now?: () => number;
};

type SchedulesApi = Pick<
  Mastra["schedules"],
  "list" | "get" | "create" | "update" | "pause" | "resume" | "run" | "delete"
>;

const schedulesOf = (mastra: Mastra): SchedulesApi => mastra.schedules;

const issuesOf = (error: z.ZodError): FieldIssue[] =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "body", issue: issue.code.toUpperCase() }));

const guarded =
  (deps: TenantScheduleRouteDeps, event: string, handle: (inputs: RouteInputs) => Promise<Response>) =>
  async (inputs: RouteInputs) => {
    try {
      return await handle(inputs);
    } catch (error: unknown) {
      deps.logger.error(event, { requestId: inputs.requestContext.get("requestId"), err: error });
      return routeError("INTERNAL_ERROR", inputs.requestContext);
    }
  };

/** The tenant's schedule, or `null` (unknown, or another tenant's: both answer 404). */
const ownSchedule = async (mastra: Mastra, tenantId: string, id: string): Promise<StoredSchedule | null> => {
  if (!/^schedule_[a-z0-9-]{1,120}$/.test(id)) return null;
  const schedule = (await schedulesOf(mastra).get(id)) as StoredSchedule | null;
  return schedule !== null && isTenantSchedule(schedule, tenantId) ? schedule : null;
};

const viewResponse = (schedule: unknown, inputs: RouteInputs, status = 200): Response => {
  const view = toScheduleView(schedule as StoredSchedule);
  return view === null ? routeError("INTERNAL_ERROR", inputs.requestContext) : dataJson(view, { status });
};

// Policy, schedulable flag and the workflow's own input schema: the same checks on create and update.
const checkWrite = async (
  deps: TenantScheduleRouteDeps,
  inputs: RouteInputs,
  plan: { workflowId: string; cron: string; timezone: string; inputData: unknown },
): Promise<Response | null> => {
  const policy = deps.catalog.get(plan.workflowId);
  if (policy === undefined) return routeError("NOT_FOUND", inputs.requestContext);
  if (!policy.schedulable) return routeError("WORKFLOW_NOT_SCHEDULABLE", inputs.requestContext);
  const violation = checkSchedule({
    cron: plan.cron,
    timezone: plan.timezone,
    minIntervalMinutes: deps.minIntervalMinutes,
    now: (deps.now ?? Date.now)(),
  });
  if (violation !== null)
    return routeError(violation.code, inputs.requestContext, [{ field: violation.field, issue: violation.issue }]);
  const valid = await validateWorkflowInput(inputs.mastra.getWorkflow(plan.workflowId).inputSchema, plan.inputData);
  return valid.ok ? null : routeError("VALIDATION_FAILED", inputs.requestContext, valid.details);
};

export const handleListSchedules = (deps: TenantScheduleRouteDeps) =>
  guarded(deps, "schedules_list_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const all = (await schedulesOf(inputs.mastra).list()) as StoredSchedule[];
    const views = all
      .filter((schedule) => isTenantSchedule(schedule, caller.data.context.tenantId))
      .flatMap((schedule) => toScheduleView(schedule) ?? []);
    return dataJson(views);
  });

export const handleGetSchedule = (deps: TenantScheduleRouteDeps, id: string) =>
  guarded(deps, "schedule_read_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const schedule = await ownSchedule(inputs.mastra, caller.data.context.tenantId, id);
    return schedule === null ? routeError("NOT_FOUND", inputs.requestContext) : viewResponse(schedule, inputs);
  });

export const handleCreateSchedule = (deps: TenantScheduleRouteDeps, readBody: () => Promise<unknown>) =>
  guarded(deps, "schedule_create_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.write,
    });
    if (!caller.ok) return caller.response;
    const body = CreateScheduleInputSchema.safeParse(await readBody().catch(() => undefined));
    if (!body.success) return routeError("VALIDATION_FAILED", inputs.requestContext, issuesOf(body.error));
    const { workflowId, slug, cron, timezone, inputData = {} } = body.data;
    const refused = await checkWrite(deps, inputs, { workflowId, cron, timezone, inputData });
    if (refused !== null) return refused;
    const { context, principal } = caller.data;
    const id = scheduleIdOf(context.tenantId, slug);
    if ((await schedulesOf(inputs.mastra).get(id)) !== null) return routeError("CONFLICT", inputs.requestContext);
    const created = await schedulesOf(inputs.mastra).create({
      id,
      workflowId,
      cron,
      timezone,
      inputData,
      requestContext: scheduledRunContextOf({ context, principal, scheduleId: id }),
      resourceId: `${context.tenantId}:${context.userId}`,
      metadata: { tenantId: context.tenantId, createdBy: context.userId },
    });
    deps.logger.info("schedule_created", {
      requestId: context.requestId,
      tenantId: context.tenantId,
      scheduleId: id,
      workflowId,
    });
    return viewResponse(created, inputs, 201);
  });

/** The next fires of an unsaved cron from now, in its zone (the editor's preview; core.schedule.read). */
export const handlePreviewSchedule = (deps: TenantScheduleRouteDeps, readBody: () => Promise<unknown>) =>
  guarded(deps, "schedule_preview_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const body = SchedulePreviewInputSchema.safeParse(await readBody().catch(() => undefined));
    if (!body.success) return routeError("VALIDATION_FAILED", inputs.requestContext, issuesOf(body.error));
    const fires = previewFires({ ...body.data, now: (deps.now ?? Date.now)(), count: SCHEDULE_PREVIEW_FIRES });
    if (fires === null)
      return routeError("VALIDATION_FAILED", inputs.requestContext, [{ field: "cron", issue: "INVALID_CRON" }]);
    return dataJson({ nextFireTimes: fires.map((fire) => new Date(fire).toISOString()) });
  });

export const handleUpdateSchedule = (deps: TenantScheduleRouteDeps, id: string, readBody: () => Promise<unknown>) =>
  guarded(deps, "schedule_update_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.write,
    });
    if (!caller.ok) return caller.response;
    const body = UpdateScheduleInputSchema.safeParse(await readBody().catch(() => undefined));
    if (!body.success) return routeError("VALIDATION_FAILED", inputs.requestContext, issuesOf(body.error));
    const current = await ownSchedule(inputs.mastra, caller.data.context.tenantId, id);
    if (current?.workflowId === undefined || current.timezone === undefined)
      return routeError("NOT_FOUND", inputs.requestContext);
    const next = {
      workflowId: current.workflowId,
      cron: body.data.cron ?? current.cron,
      timezone: body.data.timezone ?? current.timezone,
      inputData: body.data.inputData ?? current.inputData ?? {},
    };
    const refused = await checkWrite(deps, inputs, next);
    if (refused !== null) return refused;
    const updated = await schedulesOf(inputs.mastra).update(id, {
      cron: next.cron,
      timezone: next.timezone,
      inputData: next.inputData,
    });
    return viewResponse(updated, inputs);
  });

export const handleScheduleAction = (
  deps: TenantScheduleRouteDeps,
  id: string,
  action: "pause" | "resume" | "run" | "delete",
) =>
  guarded(deps, `schedule_${action}_failed`, async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: SCHEDULE_PERMISSIONS.write,
    });
    if (!caller.ok) return caller.response;
    if ((await ownSchedule(inputs.mastra, caller.data.context.tenantId, id)) === null)
      return routeError("NOT_FOUND", inputs.requestContext);
    const schedules = schedulesOf(inputs.mastra);
    deps.logger.info(`schedule_${action}`, {
      requestId: caller.data.context.requestId,
      tenantId: caller.data.context.tenantId,
      scheduleId: id,
    });
    if (action === "delete") {
      await schedules.delete(id);
      return new Response(null, { status: 204 });
    }
    if (action === "run") return dataJson({ scheduleId: (await schedules.run(id)).scheduleId }, { status: 202 });
    return viewResponse(action === "pause" ? await schedules.pause(id) : await schedules.resume(id), inputs);
  });

/** All require Mastra auth and read the tenant from the verified context; another tenant's schedule is 404. */
export const createTenantScheduleRoutes = (deps: TenantScheduleRouteDeps): ApiRoute[] => [
  registerApiRoute("/tenant-schedules", {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleListSchedules(deps)(inputsOf(c)),
  }),
  registerApiRoute("/tenant-schedules", {
    method: "POST",
    requiresAuth: true,
    handler: (c) => handleCreateSchedule(deps, () => c.req.json())(inputsOf(c)),
  }),
  // A static segment: no `POST /tenant-schedules/:scheduleId` exists for it to collide with.
  registerApiRoute("/tenant-schedules/preview", {
    method: "POST",
    requiresAuth: true,
    handler: (c) => handlePreviewSchedule(deps, () => c.req.json())(inputsOf(c)),
  }),
  registerApiRoute("/tenant-schedules/:scheduleId", {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleGetSchedule(deps, c.req.param("scheduleId"))(inputsOf(c)),
  }),
  registerApiRoute("/tenant-schedules/:scheduleId", {
    method: "PATCH",
    requiresAuth: true,
    handler: (c) => handleUpdateSchedule(deps, c.req.param("scheduleId"), () => c.req.json())(inputsOf(c)),
  }),
  registerApiRoute("/tenant-schedules/:scheduleId", {
    method: "DELETE",
    requiresAuth: true,
    handler: (c) => handleScheduleAction(deps, c.req.param("scheduleId"), "delete")(inputsOf(c)),
  }),
  ...(["pause", "resume", "run"] as const).map((action) =>
    registerApiRoute(`/tenant-schedules/:scheduleId/${action}`, {
      method: "POST",
      requiresAuth: true,
      handler: (c) => handleScheduleAction(deps, c.req.param("scheduleId"), action)(inputsOf(c)),
    }),
  ),
];
