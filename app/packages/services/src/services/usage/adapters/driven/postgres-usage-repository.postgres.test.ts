import { type LlmCall, LlmCallSchema } from "@core/contracts";
import type { TransactionSql } from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { makeCheckTenantBudget } from "../../application/use-cases/check-tenant-budget.ts";
import { makeGetUsageSummary } from "../../application/use-cases/get-usage-summary.ts";
import { makeRecordLlmCalls } from "../../application/use-cases/record-llm-calls.ts";
import { createPostgresUsageRepository, USAGE_RUNTIME_ROLE } from "./postgres-usage-repository.ts";

// Needs the compose container and `pnpm db:migrate` (migrations 0006/0007).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const repository = createPostgresUsageRepository(sql);

const TENANT_A = "usageTenantA000000";
const TENANT_B = "usageTenantB000000";
const SEPTEMBER = new Date("2026-09-01T00:00:00.000Z");
const clock = fixedClock("2026-09-30T12:00:00.000Z");

let sequence = 0;
// uuidv7-shaped ids with a per-test counter (the exporter generates real ones).
const nextId = (): string => `01928f6e-7b2a-7c3d-9e4f-${(sequence++).toString(16).padStart(12, "0")}`;

const call = (overrides: Partial<Record<keyof LlmCall, unknown>> = {}): LlmCall =>
  LlmCallSchema.parse({
    id: nextId(),
    requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    tenantId: TENANT_A,
    userId: "uid-1",
    agentId: "knowledge",
    provider: "google",
    model: "gemini-3.5-flash",
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 0,
    costMicroUsd: 600,
    latencyMs: 800,
    finishReason: "stop",
    occurredAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  });

const asTenant = async <T>(tenantId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> =>
  (await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.unsafe(`SET LOCAL ROLE ${USAGE_RUNTIME_ROLE}`);
    return fn(tx);
  })) as T;

// The runtime role cannot delete ledger rows (append-only), so cleanup runs as the login role.
const cleanup = async (): Promise<void> => {
  await sql`DELETE FROM usage.llm_calls WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
  await sql`DELETE FROM usage.tenant_budgets WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
};

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("postgres usage repository", () => {
  it("sums month spend per tenant in the view and in the budget query alike", async () => {
    await repository.insertCalls([
      call(),
      call({ costMicroUsd: null, model: "unpriced-model" }),
      call({ occurredAt: "2026-08-31T23:59:59.000Z" }),
      call({ tenantId: TENANT_B, costMicroUsd: 9999 }),
    ]);

    const spendA = await repository.getMonthSpend({ tenantId: TENANT_A, monthStart: SEPTEMBER });
    expect(spendA).toEqual({ calls: 2, inputTokens: 200, outputTokens: 100, costMicroUsd: 600, unpricedCalls: 1 });
    const viewA = await asTenant(TENANT_A, (tx) => tx`SELECT tenant_id, calls, input_tokens, cost_micro_usd, unpriced_calls FROM usage.tenant_month_spend ORDER BY month_start`);
    expect(viewA.map((row) => ({ ...row }))).toEqual([
      { tenant_id: TENANT_A, calls: "1", input_tokens: "100", cost_micro_usd: "600", unpriced_calls: "0" },
      { tenant_id: TENANT_A, calls: "2", input_tokens: "200", cost_micro_usd: "600", unpriced_calls: "1" },
    ]);
  });

  it("never shows another tenant's rows, even through the view", async () => {
    await repository.insertCalls([call({ tenantId: TENANT_B })]);
    expect(await repository.getMonthSpend({ tenantId: TENANT_A, monthStart: SEPTEMBER })).toMatchObject({ calls: 0 });
    const leaked = await asTenant(TENANT_A, (tx) => tx`SELECT count(*) AS n FROM usage.tenant_month_spend WHERE tenant_id = ${TENANT_B}`);
    expect(leaked[0]?.["n"]).toBe("0");
  });

  it("refuses a ledger row of another tenant (WITH CHECK)", async () => {
    const forged = (tx: TransactionSql) => tx`
      INSERT INTO usage.llm_calls (id, tenant_id, agent_id, provider, model, input_tokens, output_tokens, latency_ms, occurred_at)
      VALUES (${nextId()}, ${TENANT_B}, 'forged', 'p', 'm', 1, 1, 1, now())`;
    await expect(asTenant(TENANT_A, forged)).rejects.toThrow(/row-level security/);
  });

  it("skips a re-sent row instead of counting it twice", async () => {
    const row = call();
    expect(await repository.insertCalls([row])).toBe(1);
    expect(await repository.insertCalls([row])).toBe(0);
    expect(await repository.getMonthSpend({ tenantId: TENANT_A, monthStart: SEPTEMBER })).toMatchObject({ calls: 1 });
  });

  it("keeps the ledger append-only for the runtime role", async () => {
    await repository.insertCalls([call()]);
    await expect(asTenant(TENANT_A, (tx) => tx`DELETE FROM usage.llm_calls`)).rejects.toThrow(/permission denied/);
  });

  it("reads the stored caps and falls back to the plan default without a row", async () => {
    expect(await repository.getTenantBudget({ tenantId: TENANT_A })).toBeNull();
    await asTenant(TENANT_A, (tx) => tx`INSERT INTO usage.tenant_budgets (tenant_id, monthly_micro_usd, monthly_tokens) VALUES (${TENANT_A}, 1000, 400)`);
    expect(await repository.getTenantBudget({ tenantId: TENANT_A })).toEqual({ monthlyMicroUsd: 1000, monthlyTokens: 400 });
    expect(await repository.getTenantBudget({ tenantId: TENANT_B })).toBeNull();
  });

  it("refuses the run once the month reaches the tenant cap, through the use cases", async () => {
    const record = makeRecordLlmCalls({ repository });
    const check = makeCheckTenantBudget({ repository, clock });
    await asTenant(TENANT_A, (tx) => tx`INSERT INTO usage.tenant_budgets (tenant_id, monthly_micro_usd, monthly_tokens) VALUES (${TENANT_A}, 1000, 1000000)`);
    await record([call({ costMicroUsd: 700 })]);
    expect(await check({ tenantId: TENANT_A })).toEqual({ allowed: true, alert: false });
    await record([call({ costMicroUsd: 150 })]);
    expect(await check({ tenantId: TENANT_A })).toEqual({ allowed: true, alert: true });
    await record([call({ costMicroUsd: 150 })]);
    expect(await check({ tenantId: TENANT_A })).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
    expect(await check({ tenantId: TENANT_B })).toEqual({ allowed: true, alert: false });
  });

  it("summarizes the month by model against the caps", async () => {
    await repository.insertCalls([call(), call({ model: "gemini-3.5-flash-lite", costMicroUsd: 100 })]);
    const summary = await makeGetUsageSummary({ repository, clock })({ tenantId: TENANT_A });
    expect(summary).toMatchObject({
      ok: true,
      data: {
        month: "2026-09",
        totals: { calls: 2, costMicroUsd: 700 },
        budget: { monthlyMicroUsd: 50_000_000, alertThresholdPercent: 80 },
        byModel: [{ model: "gemini-3.5-flash" }, { model: "gemini-3.5-flash-lite" }],
      },
    });
  });
});
