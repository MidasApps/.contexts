import type { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";
import { createFakeWorkflowApprovalPort } from "../testing/fake-ports.ts";
import type { StoredRun } from "../workflows/runs/workflow-run-view.ts";
import { platformScheduleIdOf } from "../workflows/schedules/platform-schedules.ts";
import { scheduleIdOf, type StoredSchedule } from "../workflows/schedules/tenant-schedule-view.ts";
import { actOnAdminSchedule, AdminRunsQuerySchema, cancelAdminRun, listAdminRuns, listAdminSchedules } from "./operations-console.ts";

const TENANT_A = "TenantAaaaaaaaaaaaaaa";
const TENANT_B = "TenantBbbbbbbbbbbbbbb";
const USER = "uA1b2C3d4E5f6G7h8I9j";
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

type WorkflowsStore = {
  persistWorkflowSnapshot: (args: { workflowName: string; runId: string; resourceId?: string; snapshot: Record<string, unknown> }) => Promise<void>;
  listWorkflowRuns: (args: Record<string, unknown>) => Promise<{ runs: StoredRun[] }>;
  getWorkflowRunById: (args: { runId: string }) => Promise<StoredRun | null>;
};

// Runs in Mastra's real in-memory workflow store; the workflow object only records cancels.
const mastraWithRuns = async (runs: { runId: string; workflowName: string; tenantId: string | null; status: string; approvalRequestId?: string }[]) => {
  const storage = new InMemoryStore();
  const store = (await storage.getStore("workflows")) as unknown as WorkflowsStore;
  for (const run of runs) {
    await store.persistWorkflowSnapshot({
      workflowName: run.workflowName,
      runId: run.runId,
      ...(run.tenantId === null ? {} : { resourceId: `${run.tenantId}:${USER}` }),
      snapshot: { runId: run.runId, status: run.status, value: {}, context: contextOf(run.approvalRequestId), activePaths: [], serializedStepGraph: [], suspendedPaths: {}, waitingPaths: {}, timestamp: NOW, requestContext: run.tenantId === null ? {} : { userId: USER } },
    });
  }
  const canceled: { runId: string | undefined; resourceId: string | undefined }[] = [];
  const workflow = {
    createRun: (args: { runId?: string; resourceId?: string }) => Promise.resolve({ cancel: () => Promise.resolve(void canceled.push({ runId: args.runId, resourceId: args.resourceId })) }),
  };
  const mastra = { getStorage: () => storage, getWorkflow: () => workflow } as unknown as Mastra;
  return { mastra, canceled };
};

// A run suspended in the HITL step stores the approval request id as the step's suspend payload.
const contextOf = (approvalRequestId: string | undefined) =>
  approvalRequestId === undefined ? {} : { "request-human-approval": { status: "suspended", startedAt: NOW, suspendPayload: { approvalRequestId } } };

const CANCEL = { approvals: createFakeWorkflowApprovalPort(), requestId: "r", logger: { error: () => undefined } };

const RUNS = [
  { runId: "run-a", workflowName: "approval-demo", tenantId: TENANT_A, status: "suspended" },
  { runId: "run-b", workflowName: "approval-demo", tenantId: TENANT_B, status: "success" },
  { runId: "run-platform", workflowName: "usage-report", tenantId: null, status: "success" },
];

const query = (input: Record<string, string> = {}) => AdminRunsQuerySchema.parse(input);

describe("staff workflow runs over Mastra storage (decision 0043)", () => {
  it("lists every tenant's runs and the platform runs, or one tenant's", async () => {
    const { mastra } = await mastraWithRuns(RUNS);
    const all = await listAdminRuns(mastra, query());
    expect(all.runs.map((run) => [run.runId, run.tenantId]).sort()).toEqual([
      ["run-a", TENANT_A],
      ["run-b", TENANT_B],
      ["run-platform", null],
    ]);
    expect(all.page).toEqual({ cursor: null, hasMore: false, limit: 20 });
    const own = await listAdminRuns(mastra, query({ tenantId: TENANT_A }));
    expect(own.runs.map((run) => [run.runId, run.status, run.startedBy])).toEqual([["run-a", "suspended", USER]]);
  });

  it("filters by workflow and status and pages by offset", async () => {
    const { mastra } = await mastraWithRuns(RUNS);
    expect((await listAdminRuns(mastra, query({ workflowId: "usage-report" }))).runs.map((run) => run.runId)).toEqual(["run-platform"]);
    expect((await listAdminRuns(mastra, query({ status: "suspended" }))).runs.map((run) => run.runId)).toEqual(["run-a"]);
    const first = await listAdminRuns(mastra, query({ limit: "2" }));
    expect(first.runs).toHaveLength(2);
    expect(first.page).toEqual({ cursor: "2", hasMore: true, limit: 2 });
    const second = await listAdminRuns(mastra, query({ limit: "2", cursor: "2" }));
    expect(second.runs).toHaveLength(1);
    expect(new Set([...first.runs, ...second.runs].map((run) => run.runId)).size).toBe(3);
    expect(AdminRunsQuerySchema.safeParse({ cursor: "abc" }).success).toBe(false);
  });

  it("cancels any tenant's run with its resource and returns the run for the audit; unknown is null", async () => {
    const { mastra, canceled } = await mastraWithRuns(RUNS);
    expect(await cancelAdminRun(mastra, "run-b", CANCEL)).toMatchObject({ runId: "run-b", tenantId: TENANT_B, workflowId: "approval-demo" });
    expect(await cancelAdminRun(mastra, "run-platform", CANCEL)).toMatchObject({ tenantId: null });
    expect(canceled).toEqual([
      { runId: "run-b", resourceId: `${TENANT_B}:${USER}` },
      { runId: "run-platform", resourceId: undefined },
    ]);
    expect(await cancelAdminRun(mastra, "nope", CANCEL)).toBeNull();
    expect(await cancelAdminRun(mastra, "../etc", CANCEL)).toBeNull();
  });

  // Follow-up 82: a staff cancel settles the request the run waited for, like a tenant cancel.
  it("cancels the approval request a suspended run waits for", async () => {
    const approvals = createFakeWorkflowApprovalPort();
    const { approvalId } = await approvals.requestWorkflowApproval({
      principal: { type: "user", uid: USER, mfa: false },
      node: { level: "organization", tenantId: TENANT_A },
      permission: "core.workflow-run.approve-demo",
      action: { workflowId: "approval-demo", runId: "run-wait", stepId: "request-human-approval" },
      summary: "s",
      requestId: "r",
    });
    const { mastra, canceled } = await mastraWithRuns([{ runId: "run-wait", workflowName: "approval-demo", tenantId: TENANT_A, status: "suspended", approvalRequestId: approvalId }]);
    expect(await cancelAdminRun(mastra, "run-wait", { ...CANCEL, approvals })).toMatchObject({ runId: "run-wait", approvalRequestId: approvalId });
    expect(canceled.map((run) => run.runId)).toEqual(["run-wait"]);
    expect(approvals.records.get(approvalId)?.status).toBe("cancelled");
  });
});

const tenantSchedule = (tenantId: string, slug: string): StoredSchedule => ({
  id: scheduleIdOf(tenantId, slug),
  workflowId: "usage-report",
  cron: "0 9 * * *",
  timezone: "America/Sao_Paulo",
  status: "active",
  nextFireAt: NOW + 3_600_000,
  inputData: {},
  metadata: { tenantId, createdBy: USER },
  createdAt: NOW,
  updatedAt: NOW,
});

const platformSchedule: StoredSchedule = {
  id: platformScheduleIdOf("approval-expiry-sweep"),
  workflowId: "approval-expiry-sweep",
  cron: "*/15 * * * *",
  timezone: "UTC",
  status: "active",
  nextFireAt: NOW + 900_000,
  lastFireAt: NOW,
  inputData: {},
  metadata: { platform: true },
  createdAt: NOW,
  updatedAt: NOW,
};

const mastraWithSchedules = (rows: StoredSchedule[]) => {
  const fired: string[] = [];
  const setStatus = (id: string, status: "active" | "paused") => {
    const index = rows.findIndex((row) => row.id === id);
    const next = { ...(rows[index] as StoredSchedule), status };
    rows[index] = next;
    return Promise.resolve(next);
  };
  const schedules = {
    list: () => Promise.resolve(rows),
    get: (id: string) => Promise.resolve(rows.find((row) => row.id === id) ?? null),
    pause: (id: string) => setStatus(id, "paused"),
    resume: (id: string) => setStatus(id, "active"),
    run: (id: string) => Promise.resolve({ scheduleId: (fired.push(id), id) }),
  };
  return { mastra: { schedules } as unknown as Mastra, fired };
};

describe("staff schedules over Mastra Schedules (decision 0043)", () => {
  it("lists platform and tenant schedules, or one tenant's without the platform rows", async () => {
    const { mastra } = mastraWithSchedules([platformSchedule, tenantSchedule(TENANT_A, "daily"), tenantSchedule(TENANT_B, "daily")]);
    const all = await listAdminSchedules(mastra, null);
    expect(all.map((schedule) => [schedule.scope, schedule.tenantId, schedule.createdBy])).toEqual([
      ["platform", null, null],
      ["tenant", TENANT_A, USER],
      ["tenant", TENANT_B, USER],
    ]);
    expect(all[0]).toMatchObject({ id: "schedule_platform-approval-expiry-sweep", timezone: "UTC", lastFireAt: "2026-10-01T12:00:00.000Z" });
    expect((await listAdminSchedules(mastra, TENANT_B)).map((schedule) => schedule.tenantId)).toEqual([TENANT_B]);
  });

  it("pauses, resumes and fires any schedule; a paused one has no next fire; unknown is null", async () => {
    const tenantRow = tenantSchedule(TENANT_A, "daily");
    const { mastra, fired } = mastraWithSchedules([platformSchedule, tenantRow]);
    expect(await actOnAdminSchedule(mastra, platformSchedule.id, "pause")).toMatchObject({ status: "paused", nextFireAt: null, scope: "platform" });
    expect(await actOnAdminSchedule(mastra, platformSchedule.id, "resume")).toMatchObject({ status: "active", nextFireAt: "2026-10-01T12:15:00.000Z" });
    expect(await actOnAdminSchedule(mastra, tenantRow.id, "run")).toMatchObject({ id: tenantRow.id, tenantId: TENANT_A });
    expect(fired).toEqual([tenantRow.id]);
    expect(await actOnAdminSchedule(mastra, "schedule_missing", "pause")).toBeNull();
    expect(await actOnAdminSchedule(mastra, "not-a-schedule", "run")).toBeNull();
  });
});
