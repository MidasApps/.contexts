import type { BudgetCaps, TenantId, UserPrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createInMemoryConsoleStores } from "../../adapters/driven/in-memory-console-stores.ts";
import { createConsoleServices } from "../../composition.ts";

const TENANT = "OrgAaaaaaaaaaaaaaaaaa" as TenantId;
const STAFF = { type: "user", uid: "staff-1", mfa: true } as UserPrincipal;
const OWNER = { type: "user", uid: "owner-1", mfa: false } as UserPrincipal;
const clock = fixedClock("2026-10-01T12:00:00.000Z");
const caps = (value: number): BudgetCaps => ({ monthlyMicroUsd: value, monthlyTokens: value });
const limits = (value: number) => ({ ...caps(value), maxConnectors: 1, features: [] });

/**
 * Console services over in-memory stores where the Postgres upsert (`usage.setTenantBudget`) and the
 * Firestore input writes can be made to fail; `upserts` records every caps write in order.
 */
const setup = async () => {
  const memory = createInMemoryConsoleStores({ organizations: [{ id: TENANT }] });
  const failing = { upsertNumber: 0, inputs: false };
  const upserts: BudgetCaps[] = [];
  const { usage, organizations, plans, agentSettings } = memory.stores;
  const fail = () => Promise.reject(new Error("store down"));
  const services = createConsoleServices({
    ...memory.stores,
    usage: {
      ...usage,
      setTenantBudget: (input) => {
        upserts.push(input.budget);
        return upserts.length === failing.upsertNumber ? fail() : usage.setTenantBudget(input);
      },
    },
    organizations: { ...organizations, setPlan: (input) => (failing.inputs ? fail() : organizations.setPlan(input)) },
    plans: { ...plans, replace: (input) => (failing.inputs ? fail() : plans.replace(input)) },
    agentSettings: { ...agentSettings, save: (input) => (failing.inputs ? fail() : agentSettings.save(input)) },
    audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
    clock,
  });
  const plan = await services.createPlan({
    actor: STAFF,
    requestId: "r0",
    input: { name: "Base", limits: limits(100) },
  });
  await services.updateOrganization({ actor: STAFF, tenantId: TENANT, requestId: "r1", input: { planId: plan.id } });
  upserts.length = 0;
  const enforced = () => memory.budgets.get(TENANT);
  const failNext = (what: { readonly upsertNumber?: number; readonly inputs?: boolean }) => {
    failing.upsertNumber = what.upsertNumber ?? 0;
    failing.inputs = what.inputs ?? false;
  };
  return { services, memory, plan, upserts, enforced, failNext };
};

describe("budget changes keep the enforced caps never looser than intended", () => {
  it("tightens Postgres to the lower of old and new caps before writing the inputs, then writes the new caps", async () => {
    const { services, upserts, enforced } = await setup();
    await services.setOrganizationBudget({
      actor: STAFF,
      tenantId: TENANT,
      requestId: "r",
      input: { override: caps(500) },
    });
    expect(upserts).toEqual([caps(100), caps(500)]);
    expect(enforced()).toEqual(caps(500));
  });

  it("keeps the old caps when a raise fails to reach Firestore", async () => {
    const { services, enforced, failNext } = await setup();
    failNext({ inputs: true });
    await expect(
      services.setOrganizationBudget({
        actor: STAFF,
        tenantId: TENANT,
        requestId: "r",
        input: { override: caps(500) },
      }),
    ).rejects.toThrow("store down");
    expect(enforced()).toEqual(caps(100));
  });

  it("enforces a lowered plan even when its Firestore write fails", async () => {
    const { services, memory, enforced, failNext } = await setup();
    const lower = await services.createPlan({
      actor: STAFF,
      requestId: "r",
      input: { name: "Lower", limits: limits(40) },
    });
    failNext({ inputs: true });
    await expect(
      services.updateOrganization({ actor: STAFF, tenantId: TENANT, requestId: "r", input: { planId: lower.id } }),
    ).rejects.toThrow("store down");
    expect(enforced()).toEqual(caps(40));
    expect(memory.assignments.get(TENANT)?.planId).not.toBe(lower.id);
  });

  it("enforces a lowered plan when the final Postgres upsert fails", async () => {
    const { services, plan, enforced, failNext } = await setup();
    failNext({ upsertNumber: 2 });
    await expect(
      services.updatePlan({
        actor: STAFF,
        planId: plan.id,
        requestId: "r",
        input: { name: "Base", limits: limits(30) },
      }),
    ).rejects.toThrow("store down");
    expect(enforced()).toEqual(caps(30));
  });

  it("keeps every tenant's caps when a plan raise fails to reach Firestore, and changes nothing for an unknown plan", async () => {
    const { services, plan, upserts, enforced, failNext } = await setup();
    failNext({ inputs: true });
    await expect(
      services.updatePlan({
        actor: STAFF,
        planId: plan.id,
        requestId: "r",
        input: { name: "Base", limits: limits(900) },
      }),
    ).rejects.toThrow("store down");
    expect(enforced()).toEqual(caps(100));
    failNext({});
    upserts.length = 0;
    expect(
      await services.updatePlan({
        actor: STAFF,
        planId: "planUnknown000000000",
        requestId: "r",
        input: { name: "X", limits: limits(1) },
      }),
    ).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(upserts).toEqual([]);
  });

  it("enforces a tenant's lower cap first, and keeps it when lifting the cap fails to reach Firestore", async () => {
    const { services, upserts, enforced, failNext } = await setup();
    await services.updateAgentSettings({
      actor: OWNER,
      by: "tenant",
      tenantId: TENANT,
      requestId: "r",
      input: { budget: caps(20) },
    });
    expect(upserts[0]).toEqual(caps(20));
    expect(enforced()).toEqual(caps(20));
    failNext({ inputs: true });
    await expect(
      services.updateAgentSettings({
        actor: OWNER,
        by: "tenant",
        tenantId: TENANT,
        requestId: "r",
        input: { budget: null },
      }),
    ).rejects.toThrow("store down");
    expect(enforced()).toEqual(caps(20));
  });
});
