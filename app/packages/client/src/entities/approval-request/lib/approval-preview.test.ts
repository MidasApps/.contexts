import { describe, expect, it } from "vitest";
import { routeHref } from "#/shared/lib/router/route-paths.ts";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { approvalPreviewOf, approvalRequestRoute } from "./approval-preview.ts";

describe("approvalPreviewOf", () => {
  it("links a workflow-resume request to its run progress under the request's organization", () => {
    const preview = approvalPreviewOf(buildApprovalRequest());
    expect(preview).toEqual({
      kind: "workflow-resume",
      workflowId: "approval-demo",
      runId: "run-1",
      runRoute: { id: "settings", organizationId: "OrgAaaaaaaaaaaaaaaaaa", section: "workflows", rest: "runs/run-1" },
    });
    expect(preview.kind === "workflow-resume" ? routeHref(preview.runRoute) : "").toBe(
      "/o/OrgAaaaaaaaaaaaaaaaaa/settings/workflows/runs/run-1",
    );
  });

  it("addresses one request under its organization's settings", () => {
    expect(routeHref(approvalRequestRoute("org 1", "Ap1"))).toBe("/o/org%201/settings/approvals/Ap1");
  });

  it("shows the before/after of an agent-command request", () => {
    const request = buildApprovalRequest({
      action: {
        kind: "agent-command",
        input: { commandId: "tenancy.CreateProjectInput", preview: { before: null, after: { name: "Alpha" } } },
        summary: "Create project Alpha",
      },
    });
    expect(approvalPreviewOf(request)).toEqual({
      kind: "agent-command",
      commandId: "tenancy.CreateProjectInput",
      before: null,
      after: { name: "Alpha" },
      hasDiff: true,
    });
  });

  it("falls back to the summary for other kinds and malformed inputs", () => {
    expect(
      approvalPreviewOf(
        buildApprovalRequest({ action: { kind: "sample-delete-invoice", input: {}, summary: "Delete invoice 42" } }),
      ),
    ).toEqual({ kind: "summary", summary: "Delete invoice 42" });
    expect(
      approvalPreviewOf(
        buildApprovalRequest({ action: { kind: "workflow-resume", input: { runId: 5 }, summary: "Broken" } }),
      ),
    ).toEqual({ kind: "summary", summary: "Broken" });
  });
});
