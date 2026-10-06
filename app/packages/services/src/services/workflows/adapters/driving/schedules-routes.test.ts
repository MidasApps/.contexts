import type { RegionalSettings, Schedule } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import type { WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { buildSchedulesRoutes } from "./schedules-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const SCHEDULE_ID = "schedule_3fa9c0e1b2d4a6f8-daily-usage";
const REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Sao_Paulo",
  currency: "BRL",
};

const schedule = {
  id: SCHEDULE_ID,
  tenantId: ORG_A,
  workflowId: "usage-report",
  cron: "0 9 * * *",
  timezone: "America/Sao_Paulo",
  inputData: {},
  status: "active",
  nextFireAt: "2026-10-01T12:00:00.000Z",
  lastFireAt: null,
  createdBy: "alice",
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
} as Schedule;

/** The runtime: only ORG_A owns the schedule; only `usage-report` is schedulable. */
const fakeGateway = () => {
  const calls: { op: string; scope: AgentCallScope; arg?: unknown }[] = [];
  const own = <T>(scope: AgentCallScope, value: T) =>
    Promise.resolve(
      scope.tenantId === ORG_A
        ? { ok: true as const, data: value }
        : { ok: false as const, error: { code: "NOT_FOUND", status: 404 } },
    );
  const gateway: Partial<WorkflowRuntimeGateway> = {
    listSchedules: (scope) => own(scope, [schedule]),
    getSchedule: (scope) => own(scope, schedule),
    createSchedule: (scope, input) => {
      calls.push({ op: "create", scope, arg: input });
      return Promise.resolve(
        input.workflowId === "usage-report"
          ? { ok: true, data: schedule }
          : { ok: false, error: { code: "WORKFLOW_NOT_SCHEDULABLE", status: 422 } },
      );
    },
    actOnSchedule: (scope, id, action) => {
      calls.push({ op: action, scope, arg: id });
      return own(scope, action === "run" ? { scheduleId: id } : schedule);
    },
    deleteSchedule: (scope) => own(scope, null),
    previewSchedule: (scope, input) => {
      calls.push({ op: "preview", scope, arg: input });
      return Promise.resolve({ ok: true, data: { nextFireTimes: ["2026-10-01T12:00:00.000Z"] } });
    },
  };
  return { gateway: gateway as WorkflowRuntimeGateway, calls };
};

const setup = () => {
  const { pipeline } = makeInMemoryPipeline({
    now: "2026-09-30T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const { gateway, calls } = fakeGateway();
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(
      node.level === "organization"
        ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL }
        : null,
    );
  return { routes: buildSchedulesRoutes({ pipeline, gateway, resolveAccessContext }), calls };
};

const create = { workflowId: "usage-report", slug: "daily-usage", cron: "0 9 * * *", timezone: "America/Sao_Paulo" };

describe("/v1/schedules", () => {
  it("creates with core.schedule.write and the caller's Bearer (201)", async () => {
    const { routes, calls } = setup();
    const response = await callRoute(routes, "schedules.create", `/v1/schedules?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: create,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: schedule });
    expect(calls[0]).toMatchObject({ op: "create", scope: { bearer: "alice-token", tenantId: ORG_A }, arg: create });
  });

  it("refuses members without core.schedule.write and passes the runtime's 422 for a non-schedulable workflow", async () => {
    const { routes, calls } = setup();
    expect(
      (
        await callRoute(routes, "schedules.create", `/v1/schedules?organizationId=${ORG_A}`, {
          method: "POST",
          as: "mia",
          body: create,
        })
      ).status,
    ).toBe(403);
    expect(calls).toHaveLength(0);
    const refused = await callRoute(routes, "schedules.create", `/v1/schedules?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { ...create, workflowId: "approval-demo" },
    });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: { code: "WORKFLOW_NOT_SCHEDULABLE" } });
  });

  it("rejects a cron with seconds or a missing time zone before the runtime (400)", async () => {
    const { routes, calls } = setup();
    expect(
      (
        await callRoute(routes, "schedules.create", `/v1/schedules?organizationId=${ORG_A}`, {
          method: "POST",
          as: "alice",
          body: { ...create, cron: "0 0 9 * * *" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await callRoute(routes, "schedules.create", `/v1/schedules?organizationId=${ORG_A}`, {
          method: "POST",
          as: "alice",
          body: { ...create, timezone: undefined },
        })
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("previews the next fires of an unsaved cron with core.schedule.read", async () => {
    const { routes, calls } = setup();
    const body = { cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" };
    expect(
      (
        await callRoute(routes, "schedules.preview", `/v1/schedules/preview?organizationId=${ORG_A}`, {
          method: "POST",
          as: "mia",
          body,
        })
      ).status,
    ).toBe(403);
    const response = await callRoute(routes, "schedules.preview", `/v1/schedules/preview?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { nextFireTimes: ["2026-10-01T12:00:00.000Z"] } });
    expect(calls[0]).toMatchObject({ op: "preview", scope: { bearer: "alice-token", tenantId: ORG_A }, arg: body });
    expect(calls).toHaveLength(1);
  });

  it("refuses a malformed preview before the runtime (400)", async () => {
    const { routes, calls } = setup();
    const response = await callRoute(routes, "schedules.preview", `/v1/schedules/preview?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { cron: "0 0 9 * * *", timezone: "America/Sao_Paulo" },
    });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("answers 404 for another tenant's schedule", async () => {
    const { routes } = setup();
    expect(
      (await callRoute(routes, "schedules.get", `/v1/schedules/${SCHEDULE_ID}?organizationId=${ORG_B}`, { as: "bob" }))
        .status,
    ).toBe(404);
    expect(
      (
        await callRoute(routes, "schedules.pause", `/v1/schedules/${SCHEDULE_ID}/pause?organizationId=${ORG_B}`, {
          method: "POST",
          as: "bob",
        })
      ).status,
    ).toBe(404);
  });

  it("pauses, runs now (202) and deletes (204) an own schedule", async () => {
    const { routes } = setup();
    const base = `/v1/schedules/${SCHEDULE_ID}`;
    expect(
      (
        await callRoute(routes, "schedules.pause", `${base}/pause?organizationId=${ORG_A}`, {
          method: "POST",
          as: "alice",
        })
      ).status,
    ).toBe(200);
    const run = await callRoute(routes, "schedules.runNow", `${base}/run?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
    });
    expect(run.status).toBe(202);
    expect(await run.json()).toEqual({ data: { scheduleId: SCHEDULE_ID } });
    expect(
      (
        await callRoute(routes, "schedules.delete", `${base}?organizationId=${ORG_A}`, {
          method: "DELETE",
          as: "alice",
        })
      ).status,
    ).toBe(204);
  });
});
