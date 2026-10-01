import type { RegionalSettings, WorkflowEvent, WorkflowRun } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { WorkflowGatewayResult, WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { buildWorkflowRunStreamRoutes } from "./workflow-run-stream-route-handler.ts";
import { buildWorkflowRunsRoutes } from "./workflow-runs-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };

const runOf = (tenantId: string, status: WorkflowRun["status"] = "running"): WorkflowRun =>
  ({
    runId: "run-1",
    workflowId: "approval-demo",
    tenantId,
    status,
    startedBy: "mia",
    scheduleId: null,
    approvalRequestId: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  }) as WorkflowRun;

const event = (index: number, type: WorkflowEvent["type"], status: WorkflowEvent["status"]): WorkflowEvent => ({
  index,
  type,
  stepId: type.startsWith("workflow-step") ? "apply" : null,
  status,
  occurredAt: "2026-09-30T12:00:00.000Z",
});

const notFound = { ok: false as const, error: { code: "NOT_FOUND", status: 404 } };

/** The runtime's tenant scoping: only ORG_A has the run; each poll moves the run forward. */
const fakeGateway = (frames: { status: WorkflowRun["status"]; events: WorkflowEvent[] }[]) => {
  const calls: { op: string; scope: AgentCallScope; arg?: unknown }[] = [];
  let poll = 0;
  const own = <T>(scope: AgentCallScope, value: T): Promise<WorkflowGatewayResult<T>> => Promise.resolve(scope.tenantId === ORG_A ? { ok: true, data: value } : notFound);
  const gateway: Partial<WorkflowRuntimeGateway> = {
    listRuns: (scope, query) => {
      calls.push({ op: "list", scope, arg: query });
      return own(scope, { runs: [runOf(ORG_A)], page: { cursor: null, hasMore: false, limit: query.limit } });
    },
    getRun: (scope) => own(scope, runOf(ORG_A)),
    cancelRun: (scope, runId) => {
      calls.push({ op: "cancel", scope, arg: runId });
      return own(scope, null);
    },
    startRun: (scope, input) => {
      calls.push({ op: "start", scope, arg: input });
      return Promise.resolve(input.workflowId === "catalog-reindex" ? { ok: false, error: { code: "WORKFLOW_NOT_STARTABLE", status: 422 } } : { ok: true, data: { runId: "run-9" } });
    },
    getRunEvents: (scope) => {
      const frame = frames[Math.min(poll, frames.length - 1)] ?? { status: "running", events: [] };
      poll += 1;
      return own(scope, { run: runOf(ORG_A, frame.status), events: frame.events });
    },
  };
  return { gateway: gateway as WorkflowRuntimeGateway, calls };
};

const setup = (frames: { status: WorkflowRun["status"]; events: WorkflowEvent[] }[] = []) => {
  const { pipeline } = makeInMemoryPipeline({
    now: "2026-09-30T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const { gateway, calls } = fakeGateway(frames);
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(node.level === "organization" ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL } : null);
  const routes = {
    ...buildWorkflowRunsRoutes({ pipeline, gateway, resolveAccessContext }),
    ...buildWorkflowRunStreamRoutes({ pipeline, gateway, resolveAccessContext, wait: () => Promise.resolve() }),
  };
  return { routes, calls };
};

describe("/v1/workflows/runs", () => {
  it("lists the organization's runs with the caller's Bearer and tenant", async () => {
    const { routes, calls } = setup();
    const response = await callRoute(routes, "workflows.listRuns", `/v1/workflows/runs?organizationId=${ORG_A}&status=running&limit=5`, { as: "mia" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ runId: "run-1", tenantId: ORG_A }], meta: { page: { hasMore: false, limit: 5 } } });
    expect(calls[0]).toMatchObject({ op: "list", scope: { bearer: "mia-token", tenantId: ORG_A }, arg: { status: "running", limit: 5 } });
  });

  it("requires the organization for users and the read permission there", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "workflows.listRuns", "/v1/workflows/runs", { as: "mia" })).status).toBe(400);
    expect((await callRoute(routes, "workflows.listRuns", `/v1/workflows/runs?organizationId=${ORG_A}`, { as: "bob" })).status).toBe(404);
  });

  it("answers 404 for another tenant's run", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "workflows.getRun", `/v1/workflows/runs/run-1?organizationId=${ORG_B}`, { as: "bob" })).status).toBe(404);
    expect((await callRoute(routes, "workflows.getRun", `/v1/workflows/runs/run-1?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(200);
  });

  it("cancels with core.workflow-run.cancel only (204)", async () => {
    const { routes, calls } = setup();
    const url = `/v1/workflows/runs/run-1/cancel?organizationId=${ORG_A}`;
    expect((await callRoute(routes, "workflows.cancelRun", url, { method: "POST", as: "mia" })).status).toBe(403);
    expect(calls.filter((call) => call.op === "cancel")).toHaveLength(0);
    expect((await callRoute(routes, "workflows.cancelRun", url, { method: "POST", as: "alice" })).status).toBe(204);
  });

  it("starts a startable workflow (202) and passes the runtime's 422 for others", async () => {
    const { routes } = setup();
    const started = await callRoute(routes, "workflows.startRun", `/v1/workflows/approval-demo/runs?organizationId=${ORG_A}`, { method: "POST", as: "mia", body: { inputData: { title: "Note" } } });
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ data: { runId: "run-9" } });
    const refused = await callRoute(routes, "workflows.startRun", `/v1/workflows/catalog-reindex/runs?organizationId=${ORG_A}`, { method: "POST", as: "mia", body: { inputData: {} } });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: { code: "WORKFLOW_NOT_STARTABLE" } });
  });
});

describe("GET /v1/workflows/runs/{runId}/stream", () => {
  const frames = [
    { status: "running" as const, events: [event(0, "workflow-start", "running"), event(1, "workflow-step-start", "running")] },
    { status: "success" as const, events: [event(0, "workflow-start", "running"), event(1, "workflow-step-start", "running"), event(2, "workflow-step-result", "success"), event(3, "workflow-finish", "success")] },
  ];

  it("streams each event once with its index as the SSE id, then done", async () => {
    const { routes } = setup(frames);
    const response = await callRoute(routes, "workflows.streamRun", `/v1/workflows/runs/run-1/stream?organizationId=${ORG_A}`, { as: "mia" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const text = await response.text();
    expect(text.match(/^id: \d+$/gm)).toEqual(["id: 0", "id: 1", "id: 2", "id: 3"]);
    expect(text.trimEnd().endsWith('event: done\ndata: {"requestId":' + JSON.stringify(text.match(/"requestId":"([^"]+)"/)?.[1]) + ',"status":"success"}')).toBe(true);
  });

  it("resumes after Last-Event-Id", async () => {
    const { routes } = setup(frames);
    const response = await callRoute(routes, "workflows.streamRun", `/v1/workflows/runs/run-1/stream?organizationId=${ORG_A}`, { as: "mia", headers: { "last-event-id": "1" } });
    expect((await response.text()).match(/^id: \d+$/gm)).toEqual(["id: 2", "id: 3"]);
  });

  it("answers the envelope before streaming for another tenant's run", async () => {
    const { routes } = setup(frames);
    const response = await callRoute(routes, "workflows.streamRun", `/v1/workflows/runs/run-1/stream?organizationId=${ORG_B}`, { as: "bob" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
