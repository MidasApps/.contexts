import { type LlmCall, LlmCallSchema } from "@core/contracts";
import {
  createInMemoryAuditLogWriter,
  createPostgresClient,
  createPostgresUsageReportRepository,
  createPostgresUsageRepository,
  fixedClock,
  makeRecordAudit,
  makeReportTenantUsage,
  type UsageSink,
} from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { PostgresStore } from "@mastra/pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createRecordingNotificationPort } from "../testing/fake-ports.ts";
import { createUsageReportWorkflow, USAGE_REPORT_WORKFLOW_ID } from "./usage-report.workflow.ts";

// The workflow over the real usage repositories (migrations 0006–0009) and Mastra on Postgres.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL }, { max: 2 });
const TENANT_A = "usageWfTenantA00000";
const TENANT_B = "usageWfTenantB00000";
const repository = createPostgresUsageRepository(sql);
const exported: LlmCall[] = [];
const sink: UsageSink = {
  exportCalls: (calls) => {
    exported.push(...calls);
    return Promise.resolve();
  },
  exportRollups: () => Promise.resolve(),
};
const writer = createInMemoryAuditLogWriter();
const clock = fixedClock("2026-09-30T12:00:00.000Z");
const reportTenant = makeReportTenantUsage({
  repository,
  reports: createPostgresUsageReportRepository(sql),
  sink,
  audit: makeRecordAudit({ writer, clock }),
  clock,
});
const notifications = createRecordingNotificationPort();
const workflow = createUsageReportWorkflow({
  access: createFakeAccessPort({}),
  notifications,
  usageReport: { listTenantIds: () => Promise.resolve([TENANT_A, TENANT_B]), reportTenant },
});
const storage = new PostgresStore({ id: "usage-report-store", connectionString: DATABASE_URL, schemaName: "mastra" });
let mastra: Mastra;

let sequence = 0;
const call = (tenantId: string, costMicroUsd: number): LlmCall =>
  LlmCallSchema.parse({
    id: `01928f6e-7b2a-7c3d-9e4f-${(0xb00000 + sequence++).toString(16).padStart(12, "0")}`,
    requestId: null,
    traceId: null,
    tenantId,
    userId: "uid-1",
    agentId: "assistant",
    provider: "google",
    model: "gemini-3.5-flash",
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 0,
    costMicroUsd,
    latencyMs: 100,
    finishReason: "stop",
    occurredAt: "2026-09-30T08:00:00.000Z",
  });

const cleanup = async (): Promise<void> => {
  for (const table of ["llm_calls", "daily_rollups", "budget_alerts", "export_cursors", "tenant_budgets"]) {
    await sql.unsafe(`DELETE FROM usage.${table} WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
  }
};

const runPlatform = async () => {
  const run = await mastra.getWorkflow(USAGE_REPORT_WORKFLOW_ID).createRun();
  return run.start({ inputData: {}, requestContext: new RequestContext() });
};

beforeAll(async () => {
  await storage.init();
  mastra = new Mastra({ workflows: { [workflow.id]: workflow }, storage, logger: false });
  await cleanup();
  await sql`INSERT INTO usage.tenant_budgets (tenant_id, monthly_micro_usd, monthly_tokens) VALUES (${TENANT_A}, 10000, 1000000)`;
  await repository.insertCalls([call(TENANT_A, 8_500), call(TENANT_B, 100)]);
});

afterAll(async () => {
  await cleanup();
  await storage.close?.();
  await sql.end();
});

describe("usage-report workflow (Postgres)", () => {
  it("reports both tenants, alerts the one past 80 % once, and is idempotent on rerun", async () => {
    const first = await runPlatform();
    expect(first.status).toBe("success");
    expect(first.status === "success" ? first.result : undefined).toEqual({ tenants: 2, failed: 0, alerts: 1 });
    expect(notifications.sent).toEqual([
      { tenantId: TENANT_A, recipientUid: null, kind: "BUDGET_ALERT", data: { thresholdPercent: 80, usedPercent: 85 } },
    ]);
    expect(exported.map((row) => row.tenantId).sort()).toEqual([TENANT_A, TENANT_B]);

    const second = await runPlatform();
    expect(second.status === "success" ? second.result : undefined).toEqual({ tenants: 2, failed: 0, alerts: 0 });
    expect(notifications.sent).toHaveLength(1);
    expect(exported).toHaveLength(2);
    const [rollups] = await sql<
      { count: string }[]
    >`SELECT count(*) FROM usage.daily_rollups WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
    expect(rollups?.count).toBe("2");
  }, 30_000);

  it("reports only the schedule's tenant when a tenant schedule starts it", async () => {
    const run = await mastra.getWorkflow(USAGE_REPORT_WORKFLOW_ID).createRun();
    const result = await run.start({
      inputData: {},
      requestContext: new RequestContext<unknown>(buildAgentContextEntries({ tenantId: TENANT_B })),
    });
    expect(result.status === "success" ? result.result : undefined).toEqual({ tenants: 1, failed: 0, alerts: 0 });
  }, 30_000);
});
