import { type LlmCall, LlmCallSchema } from "@core/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { createPostgresTraceCosts } from "./postgres-trace-costs.ts";
import { createPostgresUsageRepository } from "./postgres-usage-repository.ts";

// Needs the compose container and `pnpm db:migrate` (migrations 0006/0007).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const repository = createPostgresUsageRepository(sql);
const costs = createPostgresTraceCosts(sql);

const TENANT_A = "traceCostTenantA00";
const TENANT_B = "traceCostTenantB00";
const TRACE_1 = "1".repeat(32);
const TRACE_2 = "2".repeat(32);
const TRACE_3 = "3".repeat(32);
const RANGE = { from: new Date("2026-09-15T00:00:00.000Z"), to: new Date("2026-09-16T00:00:00.000Z") };

let sequence = 0;
const nextId = (): string => `01928f6e-7b2a-7c3d-9e50-${(sequence++).toString(16).padStart(12, "0")}`;

const call = (overrides: Partial<Record<keyof LlmCall, unknown>> = {}): LlmCall =>
  LlmCallSchema.parse({
    id: nextId(),
    requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    traceId: TRACE_1,
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

// The runtime role cannot delete ledger rows (append-only), so cleanup runs as the login role.
const cleanup = async (): Promise<void> => {
  await sql`DELETE FROM usage.llm_calls WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
};

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("trace costs over usage.llm_calls (Postgres)", () => {
  it("sums the calls of each asked trace of the tenant and counts the unpriced ones", async () => {
    await repository.insertCalls([
      call(),
      call({ costMicroUsd: 400 }),
      call({ traceId: TRACE_2, costMicroUsd: 50 }),
      call({ traceId: TRACE_2, costMicroUsd: null }),
      call({ traceId: TRACE_3, costMicroUsd: 9 }),
      call({ traceId: null, costMicroUsd: 7 }),
    ]);
    const found = await costs.costByTrace({
      tenantId: TENANT_A,
      traceIds: [TRACE_1, TRACE_2, "f".repeat(32)],
      ...RANGE,
    });
    expect(Object.fromEntries(found)).toEqual({
      [TRACE_1]: { costMicroUsd: 1000, unpricedCalls: 0 },
      [TRACE_2]: { costMicroUsd: 50, unpricedCalls: 1 },
    });
  });

  it("never reads another tenant's calls and keeps to the time range", async () => {
    await repository.insertCalls([
      call({ tenantId: TENANT_B, costMicroUsd: 999 }),
      call({ occurredAt: "2026-09-20T10:00:00.000Z", costMicroUsd: 5 }),
      call({ costMicroUsd: 1 }),
    ]);
    expect(Object.fromEntries(await costs.costByTrace({ tenantId: TENANT_A, traceIds: [TRACE_1], ...RANGE }))).toEqual({
      [TRACE_1]: { costMicroUsd: 1, unpricedCalls: 0 },
    });
    expect(
      (await costs.costByTrace({ tenantId: TENANT_B, traceIds: [TRACE_1], ...RANGE })).get(TRACE_1)?.costMicroUsd,
    ).toBe(999);
    expect((await costs.costByTrace({ tenantId: TENANT_A, traceIds: [], ...RANGE })).size).toBe(0);
  });
});
