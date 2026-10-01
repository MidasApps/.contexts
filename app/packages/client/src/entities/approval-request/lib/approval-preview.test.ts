import { describe, expect, it } from "vitest";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { approvalPreviewOf } from "./approval-preview.ts";

describe("approvalPreviewOf", () => {
  it("links a workflow-resume request to its run progress", () => {
    expect(approvalPreviewOf(buildApprovalRequest())).toEqual({ kind: "workflow-resume", workflowId: "approval-demo", runId: "run-1", runHref: "/settings/workflows/runs/run-1" });
  });

  it("shows the before/after of an agent-command request", () => {
    const request = buildApprovalRequest({
      action: { kind: "agent-command", input: { commandId: "tenancy.CreateProjectInput", preview: { before: null, after: { name: "Alpha" } } }, summary: "Create project Alpha" },
    });
    expect(approvalPreviewOf(request)).toEqual({ kind: "agent-command", commandId: "tenancy.CreateProjectInput", before: null, after: { name: "Alpha" }, hasDiff: true });
  });

  it("falls back to the summary for other kinds and malformed inputs", () => {
    expect(approvalPreviewOf(buildApprovalRequest({ action: { kind: "sample-delete-invoice", input: {}, summary: "Delete invoice 42" } }))).toEqual({ kind: "summary", summary: "Delete invoice 42" });
    expect(approvalPreviewOf(buildApprovalRequest({ action: { kind: "workflow-resume", input: { runId: 5 }, summary: "Broken" } }))).toEqual({ kind: "summary", summary: "Broken" });
  });
});
