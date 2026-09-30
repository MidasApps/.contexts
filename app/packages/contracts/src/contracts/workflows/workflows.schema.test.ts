import { describe, expect, it } from "vitest";
import {
  HUMAN_APPROVAL_DECISIONS,
  HumanApprovalResumeContract,
  HumanApprovalResumeSchema,
  WorkflowResumeActionInputContract,
  WorkflowResumeActionInputSchema,
} from "./human-approval-resume.schema.ts";
import { CreateScheduleInputContract, CreateScheduleInputSchema, CronExpressionSchema, ScheduleContract, UpdateScheduleInputContract } from "./schedule.schema.ts";
import { StartWorkflowRunInputContract, WorkflowRunContract, WorkflowRunSchema } from "./workflow-run.schema.ts";
import { WorkflowEventContract, WorkflowEventSchema } from "./workflow-event.schema.ts";

const contracts = [
  HumanApprovalResumeContract,
  WorkflowResumeActionInputContract,
  ScheduleContract,
  CreateScheduleInputContract,
  UpdateScheduleInputContract,
  WorkflowRunContract,
  StartWorkflowRunInputContract,
  WorkflowEventContract,
];

describe("workflow contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    expect(contract.meta.examples.length).toBeGreaterThan(0);
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });
});

describe("HumanApprovalResumeSchema", () => {
  it("accepts only the four settled decisions", () => {
    expect(HUMAN_APPROVAL_DECISIONS).toEqual(["approved", "rejected", "expired", "cancelled"]);
    for (const decision of HUMAN_APPROVAL_DECISIONS) expect(HumanApprovalResumeSchema.safeParse({ decision }).success).toBe(true);
    expect(HumanApprovalResumeSchema.safeParse({ decision: "executed" }).success).toBe(false);
    expect(HumanApprovalResumeSchema.safeParse({ decision: "approved", reason: "x".repeat(501) }).success).toBe(false);
  });

  it("names the workflow, run and step of a workflow-resume action", () => {
    expect(WorkflowResumeActionInputSchema.safeParse({ workflowId: "approval-demo", runId: "r1", stepId: "request-human-approval" }).success).toBe(true);
    expect(WorkflowResumeActionInputSchema.safeParse({ workflowId: "approval-demo", runId: "", stepId: "s" }).success).toBe(false);
    expect(WorkflowResumeActionInputSchema.safeParse({ workflowId: "Approval Demo", runId: "r1", stepId: "s" }).success).toBe(false);
  });
});

describe("CronExpressionSchema", () => {
  it("accepts five fields only", () => {
    for (const cron of ["0 9 * * *", "*/15 * * * *", "30 4 * * 1-5", "0 0 1,15 * *", "0 12 * * MON"]) expect(CronExpressionSchema.safeParse(cron).success).toBe(true);
    for (const cron of ["* * * *", "0 0 9 * * *", "0 0 9 * * * 2026", "", "0 9 * * * ; rm", "@daily"]) expect(CronExpressionSchema.safeParse(cron).success).toBe(false);
  });
});

describe("CreateScheduleInputSchema", () => {
  const [example] = CreateScheduleInputContract.meta.examples as [Record<string, unknown>];

  it("requires an IANA time zone", () => {
    expect(CreateScheduleInputSchema.safeParse({ ...example, timezone: "America/New_York" }).success).toBe(true);
    for (const timezone of ["+03:00", "GMT-3", "Mars/Olympus", undefined]) expect(CreateScheduleInputSchema.safeParse({ ...example, timezone }).success).toBe(false);
  });

  it("keeps inputData opaque (validated by the workflow schema on the server)", () => {
    expect(CreateScheduleInputSchema.safeParse({ ...example, inputData: { anything: [1, { nested: true }] } }).success).toBe(true);
    expect(CreateScheduleInputSchema.safeParse({ ...example, slug: "Daily Report" }).success).toBe(false);
  });
});

describe("WorkflowRunSchema and WorkflowEventSchema", () => {
  it("uses Mastra's run statuses", () => {
    const [run] = WorkflowRunContract.meta.examples as [Record<string, unknown>];
    for (const status of ["running", "success", "failed", "suspended", "canceled", "tripwire", "paused"]) expect(WorkflowRunSchema.safeParse({ ...run, status }).success).toBe(true);
    expect(WorkflowRunSchema.safeParse({ ...run, status: "done" }).success).toBe(false);
  });

  it("indexes events from zero for Last-Event-Id", () => {
    const [event] = WorkflowEventContract.meta.examples as [Record<string, unknown>];
    expect(WorkflowEventSchema.safeParse({ ...event, index: -1 }).success).toBe(false);
    expect(WorkflowEventSchema.safeParse({ ...event, type: "workflow-unknown" }).success).toBe(false);
  });
});
