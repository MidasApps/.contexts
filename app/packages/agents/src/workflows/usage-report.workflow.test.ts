import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { AGENT_PRINCIPAL_KEY } from "../context/agent-request-context.ts";
import {
  createFakeAccessPort,
  createFakeUsageReportPort,
  createRecordingNotificationPort,
} from "../testing/fake-ports.ts";
import { createUsageReportWorkflow, USAGE_REPORT_WORKFLOW_ID } from "./usage-report.workflow.ts";

const run = async (
  usageReport: Parameters<typeof createUsageReportWorkflow>[0]["usageReport"],
  requestContext = new RequestContext<unknown>(),
) => {
  const workflow = createUsageReportWorkflow({
    access: createFakeAccessPort({}),
    notifications: createRecordingNotificationPort(),
    usageReport,
  });
  const mastra = new Mastra({ workflows: { [workflow.id]: workflow }, logger: false });
  const result = await (await mastra.getWorkflow(USAGE_REPORT_WORKFLOW_ID).createRun()).start({
    inputData: {},
    requestContext,
  });
  return result.status === "success" ? result.result : result.status;
};

describe("usage-report workflow", () => {
  it("keeps reporting the other tenants when one fails", async () => {
    const fake = createFakeUsageReportPort({ tenantIds: ["t1", "t2", "t3"] });
    const result = await run({
      listTenantIds: fake.listTenantIds,
      reportTenant: (input) =>
        input.tenantId === "t2" ? Promise.reject(new Error("db down")) : fake.reportTenant(input),
    });
    expect(result).toEqual({ tenants: 3, failed: 1, alerts: 0 });
    expect(fake.reported.sort()).toEqual(["t1", "t3"]);
  });

  it("reports nobody for a run whose context carries a principal but no valid context", async () => {
    const fake = createFakeUsageReportPort({ tenantIds: ["t1"] });
    const context = new RequestContext<unknown>([[AGENT_PRINCIPAL_KEY, { type: "user", uid: "u1", mfa: false }]]);
    expect(await run(fake, context)).toEqual({ tenants: 0, failed: 0, alerts: 0 });
    expect(fake.reported).toEqual([]);
  });
});
