import type { ProcessInputArgs } from "@mastra/core/processors";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import type { BudgetCheck, UsagePort } from "../runtime/runtime-ports.ts";
import { buildAgentContextEntries, createFakeUsagePort, TEST_TENANT } from "../testing/index.ts";
import { createTenantBudgetGuard, TENANT_BUDGET_GUARD_ID } from "./tenant-budget-guard.ts";

class Aborted extends Error {
  readonly options: unknown;

  constructor(reason: string | undefined, options: unknown) {
    super(reason);
    this.options = options;
  }
}

const run = async (usage: Pick<UsagePort, "checkTenantBudget">, requestContext?: RequestContext) => {
  const guard = createTenantBudgetGuard({ usage });
  const args = {
    messages: [],
    requestContext,
    abort: (reason?: string, options?: unknown): never => {
      throw new Aborted(reason, options);
    },
  } as unknown as ProcessInputArgs;
  try {
    return { result: await guard.processInput?.(args) };
  } catch (error: unknown) {
    if (error instanceof Aborted) return { aborted: { reason: error.message, options: error.options } };
    throw error;
  }
};

const context = () => new RequestContext<unknown>(buildAgentContextEntries());

describe("tenant budget guard", () => {
  it("lets the run through below the cap and checks the context tenant", async () => {
    const tenants: string[] = [];
    const usage = {
      checkTenantBudget: ({ tenantId }: { tenantId: string }) => (
        tenants.push(tenantId), Promise.resolve<BudgetCheck>({ allowed: true, alert: true })
      ),
    };
    expect(await run(usage, context())).toEqual({ result: [] });
    expect(tenants).toEqual([TEST_TENANT]);
  });

  it("aborts with BUDGET_EXCEEDED at the cap", async () => {
    const outcome = await run(createFakeUsagePort({ allowed: false, reason: "BUDGET_EXCEEDED" }), context());
    expect(outcome).toEqual({
      aborted: {
        reason: "BUDGET_EXCEEDED",
        options: { metadata: { processorId: TENANT_BUDGET_GUARD_ID, code: "BUDGET_EXCEEDED" } },
      },
    });
  });

  it("fails closed with BUDGET_UNAVAILABLE when the usage port fails", async () => {
    const outcome = await run({ checkTenantBudget: () => Promise.reject(new Error("db down")) }, context());
    expect(outcome).toEqual({
      aborted: {
        reason: "BUDGET_UNAVAILABLE",
        options: { metadata: { processorId: TENANT_BUDGET_GUARD_ID, code: "BUDGET_UNAVAILABLE" } },
      },
    });
  });

  it("fails closed without a server-built request context (no tenant to bill)", async () => {
    let called = false;
    const usage = {
      checkTenantBudget: () => ((called = true), Promise.resolve<BudgetCheck>({ allowed: true, alert: false })),
    };
    expect(await run(usage, new RequestContext<unknown>([["tenantId", TEST_TENANT]]))).toMatchObject({
      aborted: { reason: "BUDGET_UNAVAILABLE" },
    });
    expect(called).toBe(false);
  });
});
