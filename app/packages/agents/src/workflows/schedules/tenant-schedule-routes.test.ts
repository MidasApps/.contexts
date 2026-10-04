import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { AGENT_PRINCIPAL_KEY } from "../../context/agent-request-context.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import { createFakeAccessPort } from "../../testing/fake-ports.ts";
import { SCHEDULE_ID_CONTEXT_KEY } from "../runs/workflow-run-view.ts";
import { createWorkflowCatalog, policyOf } from "../workflow-catalog.ts";
import {
  handleCreateSchedule,
  handleGetSchedule,
  handleListSchedules,
  handlePreviewSchedule,
  handleScheduleAction,
  type TenantScheduleRouteDeps,
} from "./tenant-schedule-routes.ts";
import { type StoredSchedule, scheduleIdOf } from "./tenant-schedule-view.ts";

const OTHER = "Zz8sK2lPq0WnR5tYu3bV";
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const WRITER = ["core.schedule.read", "core.schedule.write"];

const stored = (tenantId: string, slug: string): StoredSchedule => ({
  id: scheduleIdOf(tenantId, slug),
  workflowId: "usage-report",
  cron: "0 9 * * *",
  timezone: "America/Sao_Paulo",
  status: "active",
  nextFireAt: NOW + 3_600_000,
  inputData: {},
  metadata: { tenantId, createdBy: TEST_UID },
  createdAt: NOW,
  updatedAt: NOW,
});

const fakeMastra = (rows: StoredSchedule[]) => {
  const createdInputs: Record<string, unknown>[] = [];
  const schedules = {
    list: () => Promise.resolve(rows),
    get: (id: string) => Promise.resolve(rows.find((row) => row.id === id) ?? null),
    create: (input: Record<string, unknown>) => {
      createdInputs.push(input);
      const row = {
        ...stored(TEST_TENANT, "x"),
        id: String(input["id"]),
        cron: String(input["cron"]),
        timezone: String(input["timezone"]),
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    pause: (id: string) => Promise.resolve({ ...rows.find((row) => row.id === id), status: "paused" }),
  };
  const workflow = { inputSchema: undefined };
  return { mastra: { schedules, getWorkflow: () => workflow } as unknown as Mastra, createdInputs };
};

const deps = (permissions: readonly string[], minIntervalMinutes = 15): TenantScheduleRouteDeps => ({
  access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] }),
  catalog: createWorkflowCatalog([
    policyOf("usage-report", { schedulable: true }),
    policyOf("approval-demo", { startable: true }),
  ]),
  minIntervalMinutes,
  logger: { info: () => undefined, error: () => undefined },
  now: () => NOW,
});

const context = () => new RequestContext<unknown>(buildAgentContextEntries({ permissions: WRITER }));
const body = { workflowId: "usage-report", slug: "daily-usage", cron: "0 9 * * *", timezone: "America/Sao_Paulo" };

describe("tenant schedule routes", () => {
  it("creates with the creator's context, resource and tenant metadata", async () => {
    const { mastra, createdInputs } = fakeMastra([]);
    const response = await handleCreateSchedule(deps(WRITER), () => Promise.resolve(body))({
      mastra,
      requestContext: context(),
    });
    expect(response.status).toBe(201);
    const id = scheduleIdOf(TEST_TENANT, "daily-usage");
    expect(await response.json()).toMatchObject({
      data: { id, tenantId: TEST_TENANT, createdBy: TEST_UID, status: "active" },
    });
    const input = createdInputs[0] ?? {};
    expect(input).toMatchObject({
      id,
      resourceId: `${TEST_TENANT}:${TEST_UID}`,
      metadata: { tenantId: TEST_TENANT, createdBy: TEST_UID },
    });
    expect(input["requestContext"]).toMatchObject({
      tenantId: TEST_TENANT,
      userId: TEST_UID,
      [AGENT_PRINCIPAL_KEY]: { uid: TEST_UID },
      [SCHEDULE_ID_CONTEXT_KEY]: id,
    });
  });

  it("refuses a non-schedulable workflow (422), a too frequent cron (422) and an existing slug (409)", async () => {
    const { mastra } = fakeMastra([stored(TEST_TENANT, "daily-usage")]);
    const call = (payload: unknown) =>
      handleCreateSchedule(deps(WRITER), () => Promise.resolve(payload))({ mastra, requestContext: context() });
    const notSchedulable = await call({ ...body, workflowId: "approval-demo", slug: "demo" });
    expect(notSchedulable.status).toBe(422);
    expect(await notSchedulable.json()).toMatchObject({ error: { code: "WORKFLOW_NOT_SCHEDULABLE" } });
    const frequent = await call({ ...body, slug: "every-minute", cron: "* * * * *" });
    expect(await frequent.json()).toMatchObject({
      error: { code: "SCHEDULE_INTERVAL_TOO_SHORT", details: [{ field: "cron", issue: "TOO_FREQUENT" }] },
    });
    expect((await call(body)).status).toBe(409);
  });

  it("lists only the tenant's schedules and answers 404 for another tenant's", async () => {
    const foreign = stored(OTHER, "daily-usage");
    const { mastra } = fakeMastra([stored(TEST_TENANT, "daily-usage"), foreign]);
    const list = await handleListSchedules(deps(WRITER))({ mastra, requestContext: context() });
    expect(((await list.json()) as { data: { tenantId: string }[] }).data.map((row) => row.tenantId)).toEqual([
      TEST_TENANT,
    ]);
    expect((await handleGetSchedule(deps(WRITER), foreign.id)({ mastra, requestContext: context() })).status).toBe(404);
    expect(
      (await handleScheduleAction(deps(WRITER), foreign.id, "pause")({ mastra, requestContext: context() })).status,
    ).toBe(404);
  });

  it("previews the next five fires of an unsaved cron from now, in its zone, with core.schedule.read", async () => {
    const { mastra } = fakeMastra([]);
    const preview = (payload: unknown, permissions: readonly string[] = ["core.schedule.read"]) =>
      handlePreviewSchedule(deps(permissions), () => Promise.resolve(payload))({ mastra, requestContext: context() });
    const response = await preview({ cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" });
    expect(response.status).toBe(200);
    // NOW is Wednesday 2026-09-30 12:00Z (09:00 in São Paulo): the 09:00 of that day has passed.
    expect(await response.json()).toEqual({
      data: {
        nextFireTimes: [
          "2026-10-01T12:00:00.000Z",
          "2026-10-02T12:00:00.000Z",
          "2026-10-05T12:00:00.000Z",
          "2026-10-06T12:00:00.000Z",
          "2026-10-07T12:00:00.000Z",
        ],
      },
    });
    expect((await preview({ cron: "0 9 * * *", timezone: "America/Sao_Paulo" }, [])).status).toBe(403);
  });

  it("refuses a preview whose cron the scheduler cannot read (400) and does not apply the minimum interval", async () => {
    const { mastra } = fakeMastra([]);
    const preview = (payload: unknown) =>
      handlePreviewSchedule(deps(["core.schedule.read"]), () => Promise.resolve(payload))({
        mastra,
        requestContext: context(),
      });
    const impossible = await preview({ cron: "99 9 * * *", timezone: "America/Sao_Paulo" });
    expect(impossible.status).toBe(400);
    expect(await impossible.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect((await preview({ cron: "0 9 * * *", timezone: "Mars/Base" })).status).toBe(400);
    expect((await preview({ cron: "* * * * *", timezone: "UTC" })).status).toBe(200);
  });

  it("needs core.schedule.write to change a schedule", async () => {
    const own = stored(TEST_TENANT, "daily-usage");
    const { mastra } = fakeMastra([own]);
    expect(
      (await handleScheduleAction(deps(["core.schedule.read"]), own.id, "pause")({ mastra, requestContext: context() }))
        .status,
    ).toBe(403);
    const paused = await handleScheduleAction(deps(WRITER), own.id, "pause")({ mastra, requestContext: context() });
    expect(await paused.json()).toMatchObject({ data: { status: "paused", nextFireAt: null } });
  });
});
