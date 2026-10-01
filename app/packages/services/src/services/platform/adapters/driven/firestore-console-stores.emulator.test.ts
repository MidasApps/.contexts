import { type AgentSettings, TenantIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreAgentSettingsRepository, createFirestoreOrganizationAdminStore, createFirestorePlanRepository } from "./firestore-console-stores.ts";

const firebase = emulatorFirebase();
const RUN = Date.now().toString(36).padStart(10, "0");
const AT = "2026-10-01T12:00:00.000Z";
const LIMITS = { monthlyMicroUsd: 1, monthlyTokens: 2, maxConnectors: 3, features: ["web-tools"] };

describe("Firestore console stores (emulator)", () => {
  it("creates plans with automatic ids and replaces them, keeping createdAt", async () => {
    const plans = createFirestorePlanRepository({ firestore: firebase.firestore });
    const created = await plans.create({ name: `Plan ${RUN}`, limits: LIMITS, at: AT, actorId: "staff" });
    expect(created.id).toMatch(/^[A-Za-z0-9]{20}$/);
    const replaced = await plans.replace({ id: created.id, name: `Plan ${RUN}`, limits: { ...LIMITS, monthlyTokens: 9 }, at: "2026-10-02T00:00:00.000Z", actorId: "staff" });
    expect(replaced).toMatchObject({ createdAt: AT, updatedAt: "2026-10-02T00:00:00.000Z", limits: { monthlyTokens: 9 } });
    expect(await plans.get(created.id)).toEqual(replaced);
    expect(await plans.replace({ id: "missingPlanaaaaaaaaa", name: "x", limits: LIMITS, at: AT, actorId: "s" })).toBeNull();
  });

  it("lists live organizations by id, sets status, and keeps the plan assignment apart", async () => {
    const store = createFirestoreOrganizationAdminStore({ firestore: firebase.firestore });
    const orgs = firebase.firestore.collection(CORE_COLLECTIONS.organizations);
    await orgs.doc(`a${RUN}`).set({ name: "A", status: "active", deletedAt: null });
    await orgs.doc(`b${RUN}`).set({ name: "B", status: "active", deletedAt: "2026-01-01T00:00:00.000Z" });
    const ids: string[] = [];
    let after: [string, string] | undefined;
    for (;;) {
      const page = await store.listLive({ after, limit: 50 });
      ids.push(...page.items.map((item) => item.id));
      const last = page.items.at(-1);
      if (page.nextCursor === null || last === undefined) break;
      after = [last.id, last.id];
    }
    expect(ids).toContain(`a${RUN}`);
    expect(ids).not.toContain(`b${RUN}`);
    expect(await store.setStatus({ tenantId: `a${RUN}`, status: "suspended", at: AT, actorId: "staff" })).toBe(true);
    expect(await store.setStatus({ tenantId: `b${RUN}`, status: "suspended", at: AT, actorId: "staff" })).toBe(false);
    expect((await store.getLive(`a${RUN}`))?.status).toBe("suspended");
    await store.setPlan({ tenantId: `a${RUN}`, planId: `plan${RUN}`, budgetOverride: { monthlyMicroUsd: 5, monthlyTokens: 6 }, at: AT, actorId: "staff" });
    expect(await store.getPlan(`a${RUN}`)).toEqual({ tenantId: `a${RUN}`, planId: `plan${RUN}`, budgetOverride: { monthlyMicroUsd: 5, monthlyTokens: 6 } });
    expect(await store.tenantsOnPlan(`plan${RUN}`)).toEqual([`a${RUN}`]);
    expect(await store.getPlan(`none${RUN}`)).toEqual({ tenantId: `none${RUN}`, planId: null, budgetOverride: null });
  });

  it("stores agent settings under the tenant id with the storage-only self cap", async () => {
    const repository = createFirestoreAgentSettingsRepository({ firestore: firebase.firestore });
    const tenantId = TenantIdSchema.parse(`settings${RUN}`);
    const settings: AgentSettings = {
      tenantId,
      enabledAgents: ["knowledge"],
      webTools: { firecrawl: false, browser: false },
      guardrails: { pii: "warn" },
      budget: { monthlyMicroUsd: 10, monthlyTokens: 20 },
      updatedBy: null,
      createdAt: AT,
      updatedAt: AT,
    };
    expect(await repository.get(tenantId)).toBeNull();
    await repository.save({ settings, selfCap: { monthlyMicroUsd: 10, monthlyTokens: 20 } });
    expect(await repository.get(tenantId)).toEqual({ settings, selfCap: { monthlyMicroUsd: 10, monthlyTokens: 20 } });
  });
});
