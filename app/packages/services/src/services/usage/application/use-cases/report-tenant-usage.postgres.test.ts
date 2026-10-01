import { type LlmCall, LlmCallSchema, type UsageDailyRollup } from "@core/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { createPostgresUsageReportRepository } from "../../adapters/driven/postgres-usage-report-repository.ts";
import { createPostgresUsageRepository } from "../../adapters/driven/postgres-usage-repository.ts";
import type { UsageSink } from "../ports/usage-sink.ts";
import { makeReportTenantUsage } from "./report-tenant-usage.ts";

// Needs the compose container and `pnpm db:migrate` (migrations 0006–0009).
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/app" }, { max: 2 });
const repository = createPostgresUsageRepository(sql);
const reports = createPostgresUsageReportRepository(sql);
const TENANT_A = "usageReportTenantA0";
const TENANT_B = "usageReportTenantB0";
const NOW = "2026-09-30T12:00:00.000Z";

let sequence = 0;
const call = (overrides: Partial<Record<keyof LlmCall, unknown>>): LlmCall =>
  LlmCallSchema.parse({
    id: `01928f6e-7b2a-7c3d-9e4f-${(0xa00000 + sequence++).toString(16).padStart(12, "0")}`,
    requestId: null,
    traceId: null,
    tenantId: TENANT_A,
    userId: "uid-1",
    agentId: "assistant",
    provider: "google",
    model: "gemini-3.5-flash",
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 0,
    costMicroUsd: 1_000,
    latencyMs: 500,
    finishReason: "stop",
    occurredAt: "2026-09-30T09:00:00.000Z",
    ...overrides,
  });

const recordingSink = () => {
  const calls: LlmCall[] = [];
  const rollups: UsageDailyRollup[] = [];
  const sink: UsageSink = {
    exportCalls: (batch) => {
      calls.push(...batch);
      return Promise.resolve();
    },
    exportRollups: (batch) => {
      rollups.push(...batch);
      return Promise.resolve();
    },
  };
  return { sink, calls, rollups };
};

const setup = (now = NOW) => {
  const writer = createInMemoryAuditLogWriter();
  const clock = fixedClock(now);
  const recorded = recordingSink();
  const report = makeReportTenantUsage({ repository, reports, sink: recorded.sink, audit: makeRecordAudit({ writer, clock }), clock });
  return { report, writer, ...recorded };
};

const cleanup = async (): Promise<void> => {
  for (const table of ["llm_calls", "daily_rollups", "budget_alerts", "export_cursors", "tenant_budgets"]) {
    await sql.unsafe(`DELETE FROM usage.${table} WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
  }
};

beforeEach(async () => {
  await cleanup();
  // Tenant A: a small budget (USD 0.01 = 10 000 micro-USD) it is about to cross; B: the plan default.
  await sql`INSERT INTO usage.tenant_budgets (tenant_id, monthly_micro_usd, monthly_tokens) VALUES (${TENANT_A}, 10000, 1000000)`;
  await repository.insertCalls([
    call({ occurredAt: "2026-09-29T23:30:00.000Z", costMicroUsd: 2_000 }),
    call({ costMicroUsd: 3_000 }),
    call({ costMicroUsd: 3_500, agentId: "knowledge" }),
    call({ tenantId: TENANT_B, costMicroUsd: 500 }),
    // Too recent to export yet (inside the 10 minute lag); still counted by the rollups.
    call({ tenantId: TENANT_B, occurredAt: "2026-09-30T11:55:00.000Z", costMicroUsd: 500 }),
  ]);
});

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("report tenant usage (Postgres)", () => {
  it("rolls up yesterday and today per model and agent, exports them and the ledger, once", async () => {
    const { report, rollups, calls } = setup();
    const first = await report({ tenantId: TENANT_A, requestId: "r1" });
    expect(first).toMatchObject({ rollups: 3, exportedCalls: 3 });
    expect(rollups.map((row) => [row.day, row.agentId, row.calls, row.costMicroUsd])).toEqual([
      ["2026-09-29", "assistant", 1, 2_000],
      ["2026-09-30", "assistant", 1, 3_000],
      ["2026-09-30", "knowledge", 1, 3_500],
    ]);
    // A rerun recomputes the same rollups and exports no ledger row twice.
    const second = await report({ tenantId: TENANT_A, requestId: "r2" });
    expect(second).toMatchObject({ rollups: 3, exportedCalls: 0 });
    expect(calls).toHaveLength(3);
    const [stored] = await sql<{ count: string }[]>`SELECT count(*) FROM usage.daily_rollups WHERE tenant_id = ${TENANT_A}`;
    expect(stored?.count).toBe("3");
  });

  it("keeps tenants apart and holds back ledger rows inside the export lag", async () => {
    const { report, calls } = setup();
    expect(await report({ tenantId: TENANT_B, requestId: "r1" })).toMatchObject({ rollups: 1, exportedCalls: 1, newAlerts: [] });
    expect(calls.every((row) => row.tenantId === TENANT_B)).toBe(true);
    const later = setup("2026-09-30T12:30:00.000Z");
    expect(await later.report({ tenantId: TENANT_B, requestId: "r2" })).toMatchObject({ exportedCalls: 1 });
  });

  it("alerts at 80 % once per month, audited, and again only at 100 %", async () => {
    const { report, writer } = setup();
    expect(await report({ tenantId: TENANT_A, requestId: "r1" })).toMatchObject({ newAlerts: [80], usedPercent: 85 });
    expect(await report({ tenantId: TENANT_A, requestId: "r2" })).toMatchObject({ newAlerts: [] });
    await repository.insertCalls([call({ costMicroUsd: 2_000 })]);
    expect(await report({ tenantId: TENANT_A, requestId: "r3" })).toMatchObject({ newAlerts: [100] });
    const audited = writer.entries("tenant").filter((entry) => entry.action === "BUDGET_THRESHOLD_REACHED");
    expect(audited.map((entry) => [entry.tenantId, entry.metadata?.thresholdPercent, entry.actor.type])).toEqual([
      [TENANT_A, 80, "system"],
      [TENANT_A, 100, "system"],
    ]);
  });
});
