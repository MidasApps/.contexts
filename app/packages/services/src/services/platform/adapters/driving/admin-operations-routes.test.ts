import type { AdminAgent, AdminSchedule, AdminWorkflowRun, Connector, TenantId } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { LogRecord } from "../../../shared/observability/logger.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { OperationsGateway } from "../../application/ports/operations-gateway.ts";
import { createMastraOperationsGateway } from "../driven/mastra-operations-gateway.ts";
import { buildAdminLogsRoutes } from "./admin-logs-route-handler.ts";
import { buildAdminOperationsRoutes } from "./admin-operations-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const NOW = "2026-10-01T12:00:00.000Z";

const run = (overrides: Partial<AdminWorkflowRun> = {}): AdminWorkflowRun =>
  ({
    runId: "run-1",
    workflowId: "approval-demo",
    tenantId: ORG_A,
    status: "suspended",
    startedBy: null,
    scheduleId: null,
    approvalRequestId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as AdminWorkflowRun;

const schedule = (overrides: Partial<AdminSchedule> = {}): AdminSchedule =>
  ({
    id: "schedule_3fa9c0e1b2d4a6f8-daily",
    scope: "tenant",
    tenantId: ORG_A,
    workflowId: "usage-report",
    cron: "0 9 * * *",
    timezone: "America/Sao_Paulo",
    status: "active",
    nextFireAt: NOW,
    lastFireAt: null,
    createdBy: "alice",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as AdminSchedule;

const PLATFORM = schedule({
  id: "schedule_platform-usage-report",
  scope: "platform",
  tenantId: null,
  createdBy: null,
  timezone: "UTC",
});

const KNOWLEDGE: AdminAgent = {
  id: "knowledge",
  name: "Knowledge",
  description: "Answers from the knowledge base.",
  role: "subagent",
  enablement: "per-organization",
  subagents: [],
  tools: ["knowledge.searchKnowledge"],
  toolsVaryByOrganization: false,
  skills: ["knowledge-citations"],
  permissions: ["core.chat.use", "core.knowledge.read"],
};

/** The runtime's console routes: records what `/v1/admin` asks for. */
const fakeOperations = () => {
  const calls: unknown[] = [];
  const gateway: OperationsGateway = {
    listRuns: (query) => (
      calls.push(["listRuns", query]),
      Promise.resolve({ ok: true, data: { runs: [run()], page: { cursor: "20", hasMore: true, limit: query.limit } } })
    ),
    cancelRun: ({ runId }) => {
      calls.push(["cancelRun", runId]);
      if (runId === "missing") return Promise.resolve({ ok: false, error: { code: "NOT_FOUND", status: 404 } });
      return Promise.resolve({
        ok: true,
        data: run({ runId, tenantId: runId === "platform-run" ? null : (ORG_B as TenantId) }),
      });
    },
    listAgents: () => (calls.push(["listAgents"]), Promise.resolve({ ok: true, data: [KNOWLEDGE] })),
    getPromptSeed: ({ agentId }) => {
      calls.push(["getPromptSeed", agentId]);
      return Promise.resolve(
        agentId === "knowledge"
          ? { ok: true, data: { agentId: "knowledge", body: "Seed instructions." } }
          : { ok: false, error: { code: "NOT_FOUND", status: 404 } },
      );
    },
    listSchedules: (query) => (
      calls.push(["listSchedules", query.tenantId]),
      Promise.resolve({ ok: true, data: query.tenantId === null ? [PLATFORM, schedule()] : [schedule()] })
    ),
    actOnSchedule: ({ scheduleId, action }) => {
      calls.push(["actOnSchedule", scheduleId, action]);
      if (scheduleId === "schedule_missing")
        return Promise.resolve({ ok: false, error: { code: "NOT_FOUND", status: 404 } });
      const row = scheduleId === PLATFORM.id ? PLATFORM : schedule({ id: scheduleId });
      return Promise.resolve({
        ok: true,
        data: action === "pause" ? { ...row, status: "paused", nextFireAt: null } : row,
      });
    },
  };
  return { gateway, calls };
};

const setup = (options: { appEnv?: string; logs?: readonly LogRecord[] | null } = {}) => {
  const { pipeline, auditLog } = makeInMemoryPipeline({
    now: NOW,
    members: [{ uid: "alice", tenantId: ORG_A, role: "owner" }],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "sue", role: "platform-support", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
    ],
  });
  const { gateway, calls } = fakeOperations();
  const connectorCalls: unknown[] = [];
  const routes = {
    ...buildAdminOperationsRoutes({
      pipeline,
      operations: gateway,
      listConnectors: (args) => (
        connectorCalls.push(args),
        Promise.resolve({ items: [{ id: "c1", tenantId: args.tenantId } as unknown as Connector], nextCursor: null })
      ),
    }),
    ...buildAdminLogsRoutes({
      pipeline,
      appEnv: options.appEnv ?? "local",
      readLogs: () => (options.logs === undefined ? [] : options.logs),
    }),
  };
  return { routes, calls, connectorCalls, auditLog };
};

const platformAudit = (auditLog: ReturnType<typeof setup>["auditLog"]) =>
  auditLog
    .entries("platform")
    .map((entry) => [entry.action, entry.target.type, entry.target.id, entry.targetTenantId ?? null, entry.outcome]);

const ENDPOINTS: [string, string, string][] = [
  ["admin.listWorkflowRuns", "GET", "/v1/admin/workflow-runs"],
  ["admin.cancelWorkflowRun", "POST", "/v1/admin/workflow-runs/run-1/cancel"],
  ["admin.listSchedules", "GET", "/v1/admin/schedules"],
  ["admin.pauseSchedule", "POST", `/v1/admin/schedules/${PLATFORM.id}/pause`],
  ["admin.resumeSchedule", "POST", `/v1/admin/schedules/${PLATFORM.id}/resume`],
  ["admin.runScheduleNow", "POST", `/v1/admin/schedules/${PLATFORM.id}/run`],
  ["admin.listConnectors", "GET", `/v1/admin/connectors?organizationId=${ORG_A}`],
  ["admin.listLogs", "GET", "/v1/admin/logs"],
];

describe("GET /v1/admin/agents", () => {
  it("answers the runtime's agent catalog to staff with platform.agent.manage only", async () => {
    const { routes, calls } = setup();
    const listed = await callRoute(routes, "admin.listAgents", "/v1/admin/agents", { as: "sam" });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ data: [KNOWLEDGE] });
    for (const as of ["alice", "nomfa", "sue"])
      expect((await callRoute(routes, "admin.listAgents", "/v1/admin/agents", { as })).status).toBe(403);
    expect(calls).toEqual([["listAgents"]]);
  });

  it("reads the catalog from the runtime and answers 502 when it is malformed or unreachable", async () => {
    const answers = (body: unknown, status = 200) =>
      createMastraOperationsGateway({
        baseUrl: "http://runtime/",
        serverlessToken: null,
        fetch: () => Promise.resolve(Response.json(body, { status })),
      });
    expect(await answers({ data: [KNOWLEDGE] }).listAgents({ requestId: "r1" })).toEqual({
      ok: true,
      data: [KNOWLEDGE],
    });
    expect(await answers({ data: [{ id: "knowledge" }] }).listAgents({ requestId: "r1" })).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
    expect(await answers({}, 500).listAgents({ requestId: "r1" })).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
  });
});

// Follow-up 86: the prompt editor starts from the code seed when the store has no version.
describe("GET /v1/admin/agents/{agentId}/prompt-seed", () => {
  it("answers the agent's code seed to staff with platform.prompt.manage only, 404 from the runtime as is", async () => {
    const { routes, calls } = setup();
    const seed = await callRoute(routes, "prompts.adminGetSeed", "/v1/admin/agents/knowledge/prompt-seed", {
      as: "sam",
    });
    expect(seed.status).toBe(200);
    expect(await seed.json()).toEqual({ data: { agentId: "knowledge", body: "Seed instructions." } });
    expect(
      (await callRoute(routes, "prompts.adminGetSeed", "/v1/admin/agents/web/prompt-seed", { as: "sam" })).status,
    ).toBe(404);
    for (const as of ["alice", "nomfa"])
      expect(
        (await callRoute(routes, "prompts.adminGetSeed", "/v1/admin/agents/knowledge/prompt-seed", { as })).status,
      ).toBe(403);
    expect(calls).toEqual([
      ["getPromptSeed", "knowledge"],
      ["getPromptSeed", "web"],
    ]);
  });

  it("reads the seed from the runtime and answers 502 when it is malformed", async () => {
    const answers = (body: unknown, status = 200) =>
      createMastraOperationsGateway({
        baseUrl: "http://runtime/",
        serverlessToken: null,
        fetch: () => Promise.resolve(Response.json(body, { status })),
      });
    const seed = { agentId: "knowledge", body: "Seed instructions." };
    expect(await answers({ data: seed }).getPromptSeed({ agentId: "knowledge", requestId: "r1" })).toEqual({
      ok: true,
      data: seed,
    });
    expect(
      await answers({ data: { agentId: "knowledge" } }).getPromptSeed({ agentId: "knowledge", requestId: "r1" }),
    ).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    expect(await answers({}, 404).getPromptSeed({ agentId: "knowledge", requestId: "r1" })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", status: 404 },
    });
  });
});

describe("/v1/admin operations: staff with MFA only", () => {
  it.each(ENDPOINTS)(
    "%s refuses a tenant owner (403 FORBIDDEN) and staff without MFA (403 MFA_REQUIRED), audited, before acting",
    async (id, method, url) => {
      const { routes, calls, connectorCalls, auditLog } = setup();
      const owner = await callRoute(routes, id, url, { method, as: "alice" });
      expect([owner.status, ((await owner.json()) as { error: { code: string } }).error.code]).toEqual([
        403,
        "FORBIDDEN",
      ]);
      const noMfa = await callRoute(routes, id, url, { method, as: "nomfa" });
      expect([noMfa.status, ((await noMfa.json()) as { error: { code: string } }).error.code]).toEqual([
        403,
        "MFA_REQUIRED",
      ]);
      expect((await callRoute(routes, id, url, { method })).status).toBe(401);
      expect(calls).toEqual([]);
      expect(connectorCalls).toEqual([]);
      expect(auditLog.entries("platform").map((entry) => [entry.action, entry.outcome])).toEqual([
        ["PLATFORM_ACCESS_DENIED", "denied"],
        ["PLATFORM_ACCESS_DENIED", "denied"],
      ]);
    },
  );

  it("refuses the write operations to the support role, which may still read connectors and logs", async () => {
    const { routes, calls } = setup();
    expect((await callRoute(routes, "admin.listWorkflowRuns", "/v1/admin/workflow-runs", { as: "sue" })).status).toBe(
      403,
    );
    expect(
      (
        await callRoute(routes, "admin.pauseSchedule", `/v1/admin/schedules/${PLATFORM.id}/pause`, {
          method: "POST",
          as: "sue",
        })
      ).status,
    ).toBe(403);
    expect(calls).toEqual([]);
    expect(
      (await callRoute(routes, "admin.listConnectors", `/v1/admin/connectors?organizationId=${ORG_A}`, { as: "sue" }))
        .status,
    ).toBe(200);
    expect((await callRoute(routes, "admin.listLogs", "/v1/admin/logs", { as: "sue" })).status).toBe(200);
  });
});

describe("/v1/admin/workflow-runs", () => {
  it("lists every tenant or one, passing filters and the cursor through", async () => {
    const { routes, calls } = setup();
    const all = await callRoute(routes, "admin.listWorkflowRuns", "/v1/admin/workflow-runs", { as: "sam" });
    expect(await all.json()).toMatchObject({
      data: [{ runId: "run-1", tenantId: ORG_A }],
      meta: { page: { cursor: "20", hasMore: true, limit: 20 } },
    });
    await callRoute(
      routes,
      "admin.listWorkflowRuns",
      `/v1/admin/workflow-runs?organizationId=${ORG_B}&status=suspended&workflowId=approval-demo&cursor=20&limit=5`,
      { as: "sam" },
    );
    expect(calls).toEqual([
      ["listRuns", { tenantId: null, workflowId: undefined, status: undefined, cursor: undefined, limit: 20 }],
      ["listRuns", { tenantId: ORG_B, workflowId: "approval-demo", status: "suspended", cursor: "20", limit: 5 }],
    ]);
    expect(
      (await callRoute(routes, "admin.listWorkflowRuns", "/v1/admin/workflow-runs?status=nope", { as: "sam" })).status,
    ).toBe(400);
  });

  it("cancels a run and audits it on the platform log with the run's tenant; unknown is 404 and not audited", async () => {
    const { routes, auditLog } = setup();
    expect(
      (
        await callRoute(routes, "admin.cancelWorkflowRun", "/v1/admin/workflow-runs/run-9/cancel", {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await callRoute(routes, "admin.cancelWorkflowRun", "/v1/admin/workflow-runs/platform-run/cancel", {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await callRoute(routes, "admin.cancelWorkflowRun", "/v1/admin/workflow-runs/missing/cancel", {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(404);
    expect(platformAudit(auditLog)).toEqual([
      ["WORKFLOW_RUN_CANCELED", "workflow-run", "run-9", ORG_B, "success"],
      ["WORKFLOW_RUN_CANCELED", "workflow-run", "platform-run", null, "success"],
    ]);
    expect(auditLog.entries("platform")[0]?.actor).toMatchObject({ id: "sam" });
  });
});

describe("/v1/admin/schedules", () => {
  it("lists platform and tenant schedules, or one organization's", async () => {
    const { routes, calls } = setup();
    const all = (await (
      await callRoute(routes, "admin.listSchedules", "/v1/admin/schedules", { as: "sam" })
    ).json()) as { data: AdminSchedule[] };
    expect(all.data.map((row) => row.scope)).toEqual(["platform", "tenant"]);
    await callRoute(routes, "admin.listSchedules", `/v1/admin/schedules?organizationId=${ORG_A}`, { as: "sam" });
    expect(calls).toEqual([
      ["listSchedules", null],
      ["listSchedules", ORG_A],
    ]);
  });

  it("pauses, resumes and fires a schedule, audited with the tenant of a tenant schedule", async () => {
    const { routes, auditLog } = setup();
    const tenantId = "schedule_3fa9c0e1b2d4a6f8-daily";
    const paused = await callRoute(routes, "admin.pauseSchedule", `/v1/admin/schedules/${tenantId}/pause`, {
      method: "POST",
      as: "sam",
    });
    expect([paused.status, await paused.json()]).toEqual([
      200,
      { data: expect.objectContaining({ id: tenantId, status: "paused", nextFireAt: null }) as unknown },
    ]);
    expect(
      (
        await callRoute(routes, "admin.resumeSchedule", `/v1/admin/schedules/${PLATFORM.id}/resume`, {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(200);
    const fired = await callRoute(routes, "admin.runScheduleNow", `/v1/admin/schedules/${tenantId}/run`, {
      method: "POST",
      as: "sam",
    });
    expect([fired.status, await fired.json()]).toEqual([202, { data: { scheduleId: tenantId } }]);
    expect(
      (
        await callRoute(routes, "admin.pauseSchedule", "/v1/admin/schedules/schedule_missing/pause", {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await callRoute(routes, "admin.pauseSchedule", "/v1/admin/schedules/NOT_A_SCHEDULE/pause", {
          method: "POST",
          as: "sam",
        })
      ).status,
    ).toBe(400);
    expect(platformAudit(auditLog)).toEqual([
      ["SCHEDULE_PAUSED", "schedule", tenantId, ORG_A, "success"],
      ["SCHEDULE_RESUMED", "schedule", PLATFORM.id, null, "success"],
      ["SCHEDULE_RUN_REQUESTED", "schedule", tenantId, ORG_A, "success"],
    ]);
  });
});

describe("/v1/admin/connectors", () => {
  it("lists the connectors of the organization asked for, and requires one", async () => {
    const { routes, connectorCalls } = setup();
    const listed = await callRoute(
      routes,
      "admin.listConnectors",
      `/v1/admin/connectors?organizationId=${ORG_B}&limit=5`,
      { as: "sam" },
    );
    expect(await listed.json()).toMatchObject({
      data: [{ id: "c1", tenantId: ORG_B }],
      meta: { page: { hasMore: false, limit: 5 } },
    });
    expect(connectorCalls).toEqual([{ tenantId: ORG_B, page: { after: undefined, limit: 5 } }]);
    const missing = await callRoute(routes, "admin.listConnectors", "/v1/admin/connectors", { as: "sam" });
    expect([missing.status, await missing.json()]).toEqual([
      400,
      {
        error: expect.objectContaining({
          code: "VALIDATION_FAILED",
          details: [{ field: "organizationId", issue: "REQUIRED" }],
        }) as unknown,
      },
    ]);
    expect(
      (
        await callRoute(routes, "admin.listConnectors", `/v1/admin/connectors?organizationId=${ORG_B}&cursor=garbage`, {
          as: "sam",
        })
      ).status,
    ).toBe(400);
  });
});

const line = (index: number, overrides: Partial<LogRecord> = {}): LogRecord => ({
  timestamp: NOW,
  level: "info",
  message: `event_${String(index)}`,
  service: "web",
  env: "local",
  ...overrides,
});

describe("GET /v1/admin/logs", () => {
  it("returns the latest lines newest first, filtered by minimum level, text, trace and request", async () => {
    const logs = [
      line(1, { level: "debug" }),
      line(2, { requestId: "req-1", durationMs: 12 }),
      line(3, { level: "warn", traceId: "trace-1" }),
      line(4, {
        level: "error",
        message: "order_failed",
        traceId: "trace-1",
        err: { name: "Error", message: "boom", stack: "x".repeat(5000) },
      }),
    ];
    const { routes } = setup({ logs });
    const read = async (query: string) =>
      (
        (await (await callRoute(routes, "admin.listLogs", `/v1/admin/logs${query}`, { as: "sam" })).json()) as {
          data: { message: string; fields: Record<string, unknown> }[];
        }
      ).data;
    expect((await read("")).map((entry) => entry.message)).toEqual(["order_failed", "event_3", "event_2", "event_1"]);
    expect((await read("?level=warn")).map((entry) => entry.message)).toEqual(["order_failed", "event_3"]);
    expect((await read("?q=ORDER")).map((entry) => entry.message)).toEqual(["order_failed"]);
    expect((await read("?traceId=trace-1&limit=1")).map((entry) => entry.message)).toEqual(["order_failed"]);
    const [byRequest] = await read("?requestId=req-1");
    expect(byRequest).toEqual({
      timestamp: NOW,
      level: "info",
      message: "event_2",
      service: "web",
      env: "local",
      requestId: "req-1",
      traceId: null,
      fields: { durationMs: 12 },
    });
    const [failed] = await read("?level=error");
    expect((failed?.fields["err"] as { stack: string }).stack).toHaveLength(2000);
    expect((await callRoute(routes, "admin.listLogs", "/v1/admin/logs?limit=501", { as: "sam" })).status).toBe(400);
  });

  it("answers 404 outside local, and when the process keeps no ring", async () => {
    for (const options of [
      { appEnv: "prod", logs: [line(1)] },
      { appEnv: "staging", logs: [line(1)] },
      { appEnv: "local", logs: null },
    ]) {
      const { routes } = setup(options);
      expect((await callRoute(routes, "admin.listLogs", "/v1/admin/logs", { as: "sam" })).status).toBe(404);
    }
  });
});

describe("Mastra operations gateway", () => {
  const answer = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("calls the console routes without a user credential and parses the answers against the contracts", async () => {
    const seen: { url: string; method: string | undefined; headers: Record<string, string> }[] = [];
    const fetchFn = ((url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method, headers: init.headers as Record<string, string> });
      if (url.includes("/workflow-runs?"))
        return Promise.resolve(
          answer(200, { data: [run()], meta: { page: { cursor: null, hasMore: false, limit: 5 } } }),
        );
      if (url.endsWith("/cancel")) return Promise.resolve(answer(200, { data: run() }));
      if (url.endsWith("/pause")) return Promise.resolve(answer(404, { error: { code: "NOT_FOUND" } }));
      return Promise.resolve(answer(200, { data: [{ unexpected: true }] }));
    }) as unknown as typeof fetch;
    const gateway = createMastraOperationsGateway({
      baseUrl: "http://mastra.local/",
      serverlessToken: null,
      fetch: fetchFn,
    });
    expect(await gateway.listRuns({ tenantId: ORG_A, status: "suspended", limit: 5 })).toMatchObject({
      ok: true,
      data: { runs: [{ runId: "run-1" }], page: { hasMore: false } },
    });
    expect(await gateway.cancelRun({ runId: "run-1", requestId: "req-1" })).toMatchObject({
      ok: true,
      data: { runId: "run-1" },
    });
    expect(await gateway.actOnSchedule({ scheduleId: "schedule_x", action: "pause", requestId: "req-2" })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", status: 404 },
    });
    expect(await gateway.listSchedules({ tenantId: null })).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
    expect(seen.map((call) => [call.method, call.url])).toEqual([
      ["GET", `http://mastra.local/console/workflow-runs?tenantId=${ORG_A}&status=suspended&limit=5`],
      ["POST", "http://mastra.local/console/workflow-runs/run-1/cancel"],
      ["POST", "http://mastra.local/console/schedules/schedule_x/pause"],
      ["GET", "http://mastra.local/console/schedules"],
    ]);
    expect(seen.every((call) => !("authorization" in call.headers))).toBe(true);
    expect(seen[1]?.headers).toEqual({ "x-request-id": "req-1" });
  });

  it("answers 502 when the runtime is unreachable", async () => {
    const gateway = createMastraOperationsGateway({
      baseUrl: "http://mastra.local",
      serverlessToken: null,
      fetch: () => Promise.reject(new Error("down")),
    });
    expect(await gateway.listSchedules({ tenantId: null })).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
  });
});
