import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import {
  createFakeAccessPort,
  createFakeWorkflowApprovalPort,
  type FakeWorkflowApprovalPort,
} from "../../testing/fake-ports.ts";
import { createWorkflowCatalog, policyOf } from "../workflow-catalog.ts";
import {
  handleCancelRun,
  handleGetRun,
  handleListRuns,
  handleStartRun,
  type WorkflowRunRouteDeps,
} from "./workflow-run-routes.ts";
import type { StoredRun } from "./workflow-run-view.ts";

const OTHER = "Zz8sK2lPq0WnR5tYu3bV";
const T0 = new Date("2026-09-30T12:00:00.000Z");

const stored = (runId: string, tenantId: string): StoredRun => ({
  workflowName: "approval-demo",
  runId,
  resourceId: `${tenantId}:${TEST_UID}`,
  createdAt: T0,
  updatedAt: T0,
  snapshot: { status: "running", context: {}, requestContext: { userId: TEST_UID } },
});

const fakeMastra = (runs: StoredRun[]) => {
  const canceled: string[] = [];
  const started: unknown[] = [];
  const store = {
    listWorkflowRuns: ({ page = 0 }: { page?: number }) => Promise.resolve({ runs: page === 0 ? runs : [] }),
    getWorkflowRunById: ({ runId }: { runId: string }) =>
      Promise.resolve(runs.find((run) => run.runId === runId) ?? null),
  };
  const workflow = {
    inputSchema: {
      "~standard": {
        validate: (value: unknown) =>
          (value as { title?: unknown }).title === undefined
            ? { issues: [{ message: "required", path: ["title"] }] }
            : { value },
      },
    },
    createRun: ({ runId }: { runId?: string } = {}) =>
      Promise.resolve({
        runId: runId ?? "new-run",
        cancel: () => {
          canceled.push(runId ?? "");
          return Promise.resolve();
        },
        start: (args: unknown) => {
          started.push(args);
          return Promise.resolve({ status: "success" });
        },
      }),
  };
  const mastra = {
    getStorage: () => ({ getStore: () => Promise.resolve(store) }),
    getWorkflow: () => workflow,
  } as unknown as Mastra;
  return { mastra, canceled, started };
};

const deps = (
  permissions: readonly string[],
  approvals: FakeWorkflowApprovalPort = createFakeWorkflowApprovalPort(),
): WorkflowRunRouteDeps => ({
  access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] }),
  approvals,
  catalog: createWorkflowCatalog([policyOf("approval-demo", { startable: true }), policyOf("catalog-reindex")]),
  logger: { info: () => undefined, error: () => undefined },
});

const context = () => new RequestContext<unknown>(buildAgentContextEntries());
const READ = ["core.workflow-run.read"];

describe("workflow run routes", () => {
  it("lists only runs whose resource is in the caller's tenant", async () => {
    const { mastra } = fakeMastra([stored("a", TEST_TENANT), stored("b", OTHER), stored("c", TEST_TENANT)]);
    const response = await handleListRuns(
      deps(READ),
      "http://mastra/workflow-runs?limit=1",
    )({ mastra, requestContext: context() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ runId: "a", tenantId: TEST_TENANT }],
      meta: { page: { cursor: "1", hasMore: true, limit: 1 } },
    });
  });

  it("answers 404 for another tenant's run and 403 without the permission", async () => {
    const { mastra } = fakeMastra([stored("b", OTHER)]);
    expect((await handleGetRun(deps(READ), "b", "run")({ mastra, requestContext: context() })).status).toBe(404);
    expect((await handleGetRun(deps([]), "b", "events")({ mastra, requestContext: context() })).status).toBe(403);
  });

  it("returns the derived events of an own run", async () => {
    const { mastra } = fakeMastra([stored("a", TEST_TENANT)]);
    const response = await handleGetRun(deps(READ), "a", "events")({ mastra, requestContext: context() });
    expect(await response.json()).toMatchObject({
      data: { run: { runId: "a" }, events: [{ index: 0, type: "workflow-start" }] },
    });
  });

  it("cancels an own run with core.workflow-run.cancel and never another tenant's", async () => {
    const { mastra, canceled } = fakeMastra([stored("a", TEST_TENANT), stored("b", OTHER)]);
    const cancelDeps = deps(["core.workflow-run.cancel"]);
    expect((await handleCancelRun(cancelDeps, "b")({ mastra, requestContext: context() })).status).toBe(404);
    expect((await handleCancelRun(deps(READ), "a")({ mastra, requestContext: context() })).status).toBe(403);
    expect((await handleCancelRun(cancelDeps, "a")({ mastra, requestContext: context() })).status).toBe(204);
    expect(canceled).toEqual(["a"]);
  });

  // Follow-up 82: approvers must not keep seeing a request whose run is gone.
  it("cancels the approval request a suspended run waits for, after the run", async () => {
    const approvals = createFakeWorkflowApprovalPort();
    const { approvalId } = await approvals.requestWorkflowApproval({
      principal: { type: "user", uid: TEST_UID, mfa: false },
      node: { level: "organization", tenantId: TEST_TENANT },
      permission: "core.workflow-run.approve-demo",
      action: { workflowId: "approval-demo", runId: "s", stepId: "request-human-approval" },
      summary: "s",
      requestId: "r",
    });
    const suspended: StoredRun = {
      ...stored("s", TEST_TENANT),
      snapshot: {
        status: "suspended",
        context: {
          "request-human-approval": {
            status: "suspended",
            startedAt: 1,
            suspendPayload: { approvalRequestId: approvalId },
          },
        },
        requestContext: { userId: TEST_UID },
      },
    };
    const { mastra, canceled } = fakeMastra([suspended]);
    expect(
      (await handleCancelRun(deps(["core.workflow-run.cancel"], approvals), "s")({ mastra, requestContext: context() }))
        .status,
    ).toBe(204);
    expect(canceled).toEqual(["s"]);
    expect(approvals.records.get(approvalId)?.status).toBe("cancelled");
  });

  it("keeps the run cancelled and logs when its approval request cannot be cancelled", async () => {
    const approvals = createFakeWorkflowApprovalPort();
    const failing = { ...approvals, cancelWorkflowApproval: () => Promise.reject(new Error("firestore down")) };
    const errors: string[] = [];
    const suspended: StoredRun = {
      ...stored("s", TEST_TENANT),
      snapshot: {
        status: "suspended",
        context: {
          "request-human-approval": {
            status: "suspended",
            startedAt: 1,
            suspendPayload: { approvalRequestId: "wfApproval0001" },
          },
        },
        requestContext: {},
      },
    };
    const { mastra, canceled } = fakeMastra([suspended]);
    const routeDeps = {
      ...deps(["core.workflow-run.cancel"], failing),
      logger: { info: () => undefined, error: (event: string) => void errors.push(event) },
    };
    expect((await handleCancelRun(routeDeps, "s")({ mastra, requestContext: context() })).status).toBe(204);
    expect(canceled).toEqual(["s"]);
    expect(errors).toEqual(["workflow_run_approval_cancel_failed"]);
  });

  it("starts only startable workflows with valid input", async () => {
    const { mastra, started } = fakeMastra([]);
    const start = deps(["core.workflow-run.start"]);
    const call = (workflowId: string, body: unknown) =>
      handleStartRun(start, workflowId, () => Promise.resolve(body))({ mastra, requestContext: context() });
    expect((await call("catalog-reindex", { inputData: {} })).status).toBe(422);
    expect((await call("unknown", { inputData: {} })).status).toBe(404);
    const invalid = await call("approval-demo", { inputData: {} });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", details: [{ field: "inputData.title" }] },
    });
    const ok = await call("approval-demo", { inputData: { title: "Note" } });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ data: { runId: "new-run" } });
    expect(started).toHaveLength(1);
  });
});
