import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { AGENT_PRINCIPAL_KEY, readAgentContext } from "../context/agent-request-context.ts";
import type { AccessPort, NotificationPort, UsageReportPort } from "../runtime/runtime-ports.ts";
import { createReauthorizeScheduleCreatorStep } from "./steps/reauthorize-schedule-creator.step.ts";

export const USAGE_REPORT_WORKFLOW_ID = "usage-report";
/** Platform schedule (SP5 spec §3.2): hourly at minute 15, UTC. */
export const USAGE_REPORT_PLATFORM_CRON = "15 * * * *";
/** Tenants reported in parallel (spec §10). */
export const USAGE_REPORT_CONCURRENCY = 4;
/** A tenant schedule of the digest needs the usage read permission at run time. */
export const USAGE_READ_PERMISSION = "core.usage.read";

const InputSchema = z.strictObject({});
const TenantSchema = z.strictObject({ tenantId: z.string().min(1), requestId: z.string().min(1) });
const TenantResultSchema = z.strictObject({
  tenantId: z.string(),
  status: z.enum(["reported", "failed"]),
  rollups: z.int().min(0),
  exportedCalls: z.int().min(0),
  alerts: z.array(z.union([z.literal(80), z.literal(100)])),
});

export const UsageReportResultSchema = z.strictObject({
  tenants: z.int().min(0),
  failed: z.int().min(0),
  alerts: z.int().min(0),
});
export type UsageReportResult = z.infer<typeof UsageReportResultSchema>;

export type UsageReportDeps = {
  readonly access: AccessPort;
  readonly notifications: NotificationPort;
  readonly usageReport: UsageReportPort;
};

/**
 * Tenants of the run: a tenant schedule (the digest) reports its own tenant only; a platform run
 * (no principal in the context) reports every live tenant; anything else reports nothing.
 */
const selectTenantsStep = (deps: UsageReportDeps) =>
  createStep({
    id: "select-tenants",
    inputSchema: InputSchema,
    outputSchema: z.array(TenantSchema),
    execute: async ({ requestContext, runId }) => {
      const snapshot = readAgentContext(requestContext);
      if (snapshot.ok) return [{ tenantId: snapshot.data.context.tenantId, requestId: runId }];
      if (requestContext.get(AGENT_PRINCIPAL_KEY) !== undefined) return [];
      return (await deps.usageReport.listTenantIds()).map((tenantId) => ({ tenantId, requestId: runId }));
    },
  });

/** One tenant: rollups, export and thresholds (idempotent), then a notice per new threshold. */
const reportTenantStep = (deps: UsageReportDeps) =>
  createStep({
    id: "report-tenant",
    inputSchema: TenantSchema,
    outputSchema: TenantResultSchema,
    execute: async ({ inputData, mastra }) => {
      try {
        const report = await deps.usageReport.reportTenant(inputData);
        for (const threshold of report.newAlerts) {
          await deps.notifications.notify({
            tenantId: report.tenantId,
            recipientUid: null,
            kind: "BUDGET_ALERT",
            data: { thresholdPercent: threshold, usedPercent: report.usedPercent },
          });
        }
        return {
          tenantId: report.tenantId,
          status: "reported" as const,
          rollups: report.rollups,
          exportedCalls: report.exportedCalls,
          alerts: [...report.newAlerts],
        };
      } catch (error: unknown) {
        // One tenant's failure never blocks the others; the next hourly run catches up.
        mastra.getLogger().error("usage_report_tenant_failed", {
          tenantId: inputData.tenantId,
          requestId: inputData.requestId,
          err: error,
        });
        return { tenantId: inputData.tenantId, status: "failed" as const, rollups: 0, exportedCalls: 0, alerts: [] };
      }
    },
  });

const summarizeStep = () =>
  createStep({
    id: "summarize",
    inputSchema: z.array(TenantResultSchema),
    outputSchema: UsageReportResultSchema,
    execute: ({ inputData }) =>
      Promise.resolve({
        tenants: inputData.length,
        failed: inputData.filter((result) => result.status === "failed").length,
        alerts: inputData.reduce((total, result) => total + result.alerts.length, 0),
      }),
  });

/**
 * `usage-report` (SP5 spec §3.2, decision 0039): hourly platform run over every tenant, or a
 * tenant's own digest when a tenant schedule starts it (`schedulable`, creator re-authorized with
 * `core.usage.read`). `.foreach` over tenants with concurrency 4.
 */
export const createUsageReportWorkflow = (deps: UsageReportDeps) =>
  createWorkflow({
    id: USAGE_REPORT_WORKFLOW_ID,
    description: "Rolls up model usage per tenant and day, exports it and sends budget alerts.",
    inputSchema: InputSchema,
    outputSchema: UsageReportResultSchema,
  })
    .then(
      createReauthorizeScheduleCreatorStep({
        access: deps.access,
        notifications: deps.notifications,
        workflowId: USAGE_REPORT_WORKFLOW_ID,
        inputSchema: InputSchema,
        permission: USAGE_READ_PERMISSION,
      }),
    )
    .then(selectTenantsStep(deps))
    .foreach(reportTenantStep(deps), { concurrency: USAGE_REPORT_CONCURRENCY })
    .then(summarizeStep())
    .commit();
