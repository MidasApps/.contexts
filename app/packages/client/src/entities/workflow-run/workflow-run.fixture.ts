import type { WorkflowCatalogEntry, WorkflowRun } from "@core/contracts";
import { IDS } from "#/shared/testing/fixtures.ts";

/** Test data: a run of the fixture organization (wire shape, before parsing). */
export const buildWorkflowRun = (
  overrides: Partial<Record<keyof WorkflowRun, unknown>> = {},
): Record<string, unknown> => ({
  runId: "run-1",
  workflowId: "approval-demo",
  tenantId: IDS.organization,
  status: "running",
  startedBy: IDS.user,
  scheduleId: null,
  approvalRequestId: null,
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:01:00.000Z",
  ...overrides,
});

export const buildWorkflowCatalogEntry = (overrides: Partial<WorkflowCatalogEntry> = {}): WorkflowCatalogEntry => ({
  id: "approval-demo",
  description: "Collects an input and waits for an approval.",
  startable: true,
  schedulable: false,
  inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  ...overrides,
});
