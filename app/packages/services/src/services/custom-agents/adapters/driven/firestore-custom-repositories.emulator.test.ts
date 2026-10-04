import {
  type CustomAgent,
  CustomAgentSchema,
  type CustomSkill,
  CustomSkillSchema,
  TenantIdSchema,
} from "@core/contracts";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirebaseAdmin } from "../../../shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import {
  CUSTOM_AGENTS_COLLECTION,
  CUSTOM_SKILLS_COLLECTION,
  createFirestoreCustomAgentRepository,
  createFirestoreCustomSkillRepository,
} from "./firestore-custom-repositories.ts";

const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});
const agents = createFirestoreCustomAgentRepository({ firestore });
const skills = createFirestoreCustomSkillRepository({ firestore });
const unitOfWork = createFirestoreUnitOfWork({ firestore });
// Tenants unique to this file: other suites share the emulator.
const TENANT = TenantIdSchema.parse("CustomRepoTenant0001");
const OTHER = TenantIdSchema.parse("CustomRepoTenant0002");

const agentOf = (tenantId: string, createdAt: string, enabled = true): CustomAgent =>
  CustomAgentSchema.parse({
    id: agents.newId(),
    tenantId,
    name: "Guide",
    description: "Answers.",
    instructions: "Be brief.",
    model: "chat",
    tools: ["catalog.listEntities"],
    connectorTools: false,
    coreSkills: [],
    customSkills: [],
    knowledgeScope: "organization",
    enabled,
    createdBy: "alice",
    createdAt,
    updatedAt: createdAt,
  });

const skillOf = (tenantId: string, name: string, createdAt: string): CustomSkill =>
  CustomSkillSchema.parse({
    id: skills.newId(),
    tenantId,
    name,
    description: "How.",
    instructions: "Steps.",
    enabled: true,
    createdBy: "alice",
    createdAt,
    updatedAt: createdAt,
  });

const clear = async () => {
  for (const collection of [CUSTOM_AGENTS_COLLECTION, CUSTOM_SKILLS_COLLECTION]) {
    for (const tenantId of [TENANT, OTHER]) {
      const docs = await firestore.collection(collection).where("tenantId", "==", tenantId).get();
      await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
    }
  }
};

// The first Admin SDK call opens the connection; under load it can take longer than the default hook timeout.
beforeAll(clear, 60_000);
afterAll(clear, 60_000);

describe("firestore custom agent repository (emulator)", () => {
  it("stores agents with automatic ids, timestamps and schemaVersion, and reads them per tenant, newest first", async () => {
    const older = agentOf(TENANT, "2026-10-01T10:00:00.000Z");
    const newer = agentOf(TENANT, "2026-10-01T11:00:00.000Z", false);
    const foreign = agentOf(OTHER, "2026-10-01T12:00:00.000Z");
    await unitOfWork.run((tx) => {
      for (const agent of [older, newer, foreign]) agents.create(tx, { agent });
      return Promise.resolve();
    });
    expect(older.id).toMatch(/^[A-Za-z0-9]{20}$/);
    const stored = (await firestore.collection(CUSTOM_AGENTS_COLLECTION).doc(older.id).get()).data();
    expect(stored?.["createdAt"]).toBeInstanceOf(Timestamp);
    expect(stored).toMatchObject({ tenantId: TENANT, schemaVersion: 1, updatedBy: "alice" });
    expect(stored).not.toHaveProperty("id");
    expect((await agents.listByTenant({ tenantId: TENANT })).map((agent) => agent.id)).toEqual([newer.id, older.id]);
    expect(await agents.count({ tenantId: TENANT })).toBe(2);
    expect(await agents.count({ tenantId: OTHER })).toBe(1);
    expect(await agents.get(undefined, { tenantId: TENANT, agentId: older.id })).toEqual(older);
  });

  it("reads an agent of another tenant as missing, replaces and deletes", async () => {
    const agent = agentOf(OTHER, "2026-10-01T13:00:00.000Z");
    await unitOfWork.run((tx) => Promise.resolve(agents.create(tx, { agent })));
    expect(await agents.get(undefined, { tenantId: TENANT, agentId: agent.id })).toBeNull();
    expect((await agents.listByTenant({ tenantId: TENANT })).some((item) => item.id === agent.id)).toBe(false);
    const changed = { ...agent, enabled: false, updatedAt: "2026-10-01T14:00:00.000Z" };
    await unitOfWork.run((tx) => Promise.resolve(agents.replace(tx, { agent: changed, actorId: "bob" })));
    expect(await agents.get(undefined, { tenantId: OTHER, agentId: agent.id })).toEqual(changed);
    await unitOfWork.run((tx) => Promise.resolve(agents.delete(tx, { agentId: agent.id })));
    expect(await agents.get(undefined, { tenantId: OTHER, agentId: agent.id })).toBeNull();
  });
});

describe("firestore custom skill repository (emulator)", () => {
  it("lists the skills of a tenant in pages, newest first, and finds a name only inside the tenant", async () => {
    const first = skillOf(TENANT, "alpha", "2026-10-01T10:00:00.000Z");
    const second = skillOf(TENANT, "beta", "2026-10-01T11:00:00.000Z");
    const foreign = skillOf(OTHER, "alpha", "2026-10-01T12:00:00.000Z");
    await unitOfWork.run((tx) => {
      for (const skill of [first, second, foreign]) skills.create(tx, { skill });
      return Promise.resolve();
    });
    const page = await skills.list({ tenantId: TENANT, page: { after: undefined, limit: 1 } });
    expect(page.items.map((skill) => skill.id)).toEqual([second.id]);
    expect(page.nextCursor).not.toBeNull();
    expect((await skills.listByTenant({ tenantId: TENANT })).map((skill) => skill.id)).toEqual([second.id, first.id]);
    expect(await skills.count({ tenantId: TENANT })).toBe(2);
    expect((await skills.findByName(undefined, { tenantId: TENANT, name: "alpha" }))?.id).toBe(first.id);
    expect((await skills.findByName(undefined, { tenantId: OTHER, name: "alpha" }))?.id).toBe(foreign.id);
    expect(await skills.findByName(undefined, { tenantId: OTHER, name: "beta" })).toBeNull();
    expect(await unitOfWork.run((tx) => skills.findByName(tx, { tenantId: TENANT, name: "beta" }))).toEqual(second);
    expect(await skills.get(undefined, { tenantId: OTHER, skillId: first.id })).toBeNull();
    expect(await skills.get(undefined, { tenantId: TENANT, skillId: first.id })).toEqual(first);
  });
});
