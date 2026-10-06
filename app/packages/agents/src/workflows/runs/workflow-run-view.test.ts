import { describe, expect, it } from "vitest";
import { eventsOfRun, isTenantRun, toWorkflowRunView } from "./workflow-run-view.ts";

const T0 = Date.UTC(2026, 8, 30, 12, 0, 0);

const run = (snapshot: Record<string, unknown>, resourceId = "org1:u1") => ({
  workflowName: "approval-demo",
  runId: "run-1",
  resourceId,
  createdAt: new Date(T0),
  updatedAt: new Date(T0 + 5000),
  snapshot: { runId: "run-1", status: "running", context: {}, requestContext: { userId: "u1" }, ...snapshot },
});

describe("isTenantRun", () => {
  it("matches only resources of the tenant prefix", () => {
    expect(isTenantRun({ resourceId: "org1:u1" }, "org1")).toBe(true);
    expect(isTenantRun({ resourceId: "org10:u1" }, "org1")).toBe(false);
    expect(isTenantRun({}, "org1")).toBe(false);
  });
});

describe("toWorkflowRunView", () => {
  it("maps a suspended run with its approval request and starter", () => {
    const view = toWorkflowRunView(
      run({
        status: "suspended",
        context: {
          "request-human-approval": {
            status: "suspended",
            startedAt: T0 + 1,
            suspendedAt: T0 + 2,
            suspendPayload: { approvalRequestId: "ap1" },
          },
        },
      }),
    );
    expect(view).toMatchObject({
      runId: "run-1",
      workflowId: "approval-demo",
      tenantId: "org1",
      status: "suspended",
      startedBy: "u1",
      approvalRequestId: "ap1",
      scheduleId: null,
    });
  });

  it("says which step a failed run stopped at, never the error message", () => {
    const view = toWorkflowRunView(
      run({
        status: "failed",
        error: { name: "Error", message: "connect ECONNREFUSED 10.0.0.4:5432" },
        context: {
          input: { title: "x" },
          a: { status: "success", startedAt: T0 + 1, endedAt: T0 + 2 },
          "apply-note": {
            status: "failed",
            startedAt: T0 + 3,
            endedAt: T0 + 4,
            error: { message: "connect ECONNREFUSED 10.0.0.4:5432" },
          },
        },
      }),
    );
    expect(view?.failure).toEqual({ code: "STEP_FAILED", stepId: "apply-note" });
    expect(JSON.stringify(view)).not.toContain("ECONNREFUSED");
  });

  it("tells a guardrail stop from a failure, and a failure outside any step", () => {
    const tripped = toWorkflowRunView(
      run({
        status: "tripwire",
        tripwire: { reason: "blocked by moderation" },
        context: { a: { status: "failed", startedAt: T0 + 1, tripwire: { reason: "x" } } },
      }),
    );
    expect(tripped?.failure).toEqual({ code: "TRIPWIRE", stepId: "a" });
    expect(JSON.stringify(tripped)).not.toContain("moderation");
    expect(toWorkflowRunView(run({ status: "failed", context: {} }))?.failure).toEqual({
      code: "RUN_FAILED",
      stepId: null,
    });
    expect(toWorkflowRunView(run({ status: "success" }))?.failure).toBeNull();
    expect(toWorkflowRunView(run({ status: "canceled" }))?.failure).toBeNull();
  });

  it("returns null for a run without a tenant resource", () => {
    expect(toWorkflowRunView({ ...run({}), resourceId: undefined })).toBeNull();
  });
});

describe("eventsOfRun", () => {
  it("derives a stable, append-only event list from the snapshot", () => {
    const running = eventsOfRun(run({ context: { input: {}, a: { status: "running", startedAt: T0 + 1 } } }));
    expect(running.map((event) => [event.index, event.type, event.stepId])).toEqual([
      [0, "workflow-start", null],
      [1, "workflow-step-start", "a"],
    ]);
    const done = eventsOfRun(
      run({
        status: "success",
        context: {
          input: {},
          a: { status: "suspended", startedAt: T0 + 1, suspendedAt: T0 + 2 },
          b: { status: "success", startedAt: T0 + 3, endedAt: T0 + 4, output: { secret: "x" } },
        },
      }),
    );
    expect(done.slice(0, 2)).toEqual(running);
    expect(done.map((event) => event.type)).toEqual([
      "workflow-start",
      "workflow-step-start",
      "workflow-step-suspended",
      "workflow-step-start",
      "workflow-step-result",
      "workflow-finish",
    ]);
    expect(done.every((event) => !("output" in event))).toBe(true);
  });

  it("keeps the suspended event after the step resumes", () => {
    const events = eventsOfRun(
      run({
        status: "success",
        context: {
          a: { status: "success", startedAt: T0 + 1, suspendedAt: T0 + 2, resumedAt: T0 + 3, endedAt: T0 + 4 },
        },
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "workflow-start",
      "workflow-step-start",
      "workflow-step-suspended",
      "workflow-step-result",
      "workflow-finish",
    ]);
  });

  it("ends a canceled run with workflow-canceled", () => {
    expect(eventsOfRun(run({ status: "canceled" })).at(-1)).toMatchObject({
      type: "workflow-canceled",
      status: "canceled",
    });
  });
});
