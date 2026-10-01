import { type LlmCall, LlmCallSchema, type TenantId, type UserPrincipal } from "@core/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { createPostgresUsageRepository } from "../../../usage/adapters/driven/postgres-usage-repository.ts";
import { makeCheckTenantBudget } from "../../../usage/application/use-cases/check-tenant-budget.ts";
import { makeRecordLlmCalls } from "../../../usage/application/use-cases/record-llm-calls.ts";
import { createInMemoryConsoleStores } from "../../adapters/driven/in-memory-console-stores.ts";
import { createConsoleServices, createPostgresConsoleUsage } from "../../composition.ts";

// Needs the compose container and `pnpm db:migrate`: the console writes `usage.tenant_budgets`, the guard reads it.
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const TENANT = "consoleBudgetTenant0" as TenantId;
const STAFF = { type: "user", uid: "staff-1", mfa: true } as UserPrincipal;
const OWNER = { type: "user", uid: "owner-1", mfa: false } as UserPrincipal;
const clock = fixedClock("2026-10-15T12:00:00.000Z");
const repository = createPostgresUsageRepository(sql);
const check = makeCheckTenantBudget({ repository, clock });
const record = makeRecordLlmCalls({ repository });

let sequence = 0;
const spend = (costMicroUsd: number): LlmCall =>
  LlmCallSchema.parse({
    id: `01928f6e-7b2a-7c3d-9e4f-${(0xc0de00 + sequence++).toString(16).padStart(12, "0")}`,
    requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    traceId: null,
    tenantId: TENANT,
    userId: "owner-1",
    agentId: "assistant",
    provider: "google",
    model: "gemini-3.5-flash",
    inputTokens: 1,
    outputTokens: 1,
    cachedTokens: 0,
    costMicroUsd,
    latencyMs: 10,
    finishReason: "stop",
    occurredAt: "2026-10-10T10:00:00.000Z",
  });

const cleanup = async () => {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${TENANT}, true)`;
    await tx`DELETE FROM usage.llm_calls WHERE tenant_id = ${TENANT}`;
    await tx`DELETE FROM usage.tenant_budgets WHERE tenant_id = ${TENANT}`;
  });
};

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("console budgets reach the budget guard (Postgres)", () => {
  it("enforces the plan, a staff override and the tenant's lower cap through checkTenantBudget", async () => {
    const memory = createInMemoryConsoleStores({ organizations: [{ id: TENANT }] });
    const services = createConsoleServices({ ...memory.stores, usage: createPostgresConsoleUsage(sql), audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }), clock });
    await record([spend(2_000)]);
    expect(await check({ tenantId: TENANT })).toEqual({ allowed: true, alert: false });

    const plan = await services.createPlan({ actor: STAFF, requestId: "r1", input: { name: "Tiny", limits: { monthlyMicroUsd: 2_000, monthlyTokens: 1_000, maxConnectors: 1, features: [] } } });
    await services.updateOrganization({ actor: STAFF, tenantId: TENANT, requestId: "r2", input: { planId: plan.id } });
    expect(await check({ tenantId: TENANT })).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });

    await services.setOrganizationBudget({ actor: STAFF, tenantId: TENANT, requestId: "r3", input: { override: { monthlyMicroUsd: 10_000, monthlyTokens: 1_000 } } });
    expect(await check({ tenantId: TENANT })).toEqual({ allowed: true, alert: false });

    expect(await services.updateAgentSettings({ actor: OWNER, by: "tenant", tenantId: TENANT, requestId: "r4", input: { budget: { monthlyMicroUsd: 20_000, monthlyTokens: 1_000 } } })).toEqual({
      ok: false,
      error: { code: "ABOVE_PLAN" },
    });
    await services.updateAgentSettings({ actor: OWNER, by: "tenant", tenantId: TENANT, requestId: "r5", input: { budget: { monthlyMicroUsd: 2_400, monthlyTokens: 1_000 } } });
    expect(await check({ tenantId: TENANT })).toEqual({ allowed: true, alert: true });
    expect(await repository.getTenantBudget({ tenantId: TENANT })).toEqual({ monthlyMicroUsd: 2_400, monthlyTokens: 1_000 });
  });
});
