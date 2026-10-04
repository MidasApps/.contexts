import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { createPostgresPromptRepository, PROMPTS_RUNTIME_ROLE } from "./postgres-prompt-repository.ts";

// Needs the compose container and `pnpm db:migrate` (migrations 0010/0011).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const repository = createPostgresPromptRepository(sql);

const AGENT = "prompt-test-agent";
const TENANT_A = "promptTenantA0000000";
const TENANT_B = "promptTenantB0000000";
const SHA = "a".repeat(64);
const platformKey = { agentId: AGENT, scope: "platform" as const, tenantId: null };
const tenantKey = (tenantId: string) => ({ agentId: AGENT, scope: "tenant" as const, tenantId });

// Cleanup as the login role, per tenant scope (the runtime role has no DELETE on purpose).
const asOwnerCleanup = async () => {
  await sql.begin(async (tx) => {
    for (const tenantId of ["~platform", TENANT_A, TENANT_B]) {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx`DELETE FROM agents.prompt_activations WHERE agent_id = ${AGENT}`;
      await tx`DELETE FROM agents.prompt_versions WHERE agent_id = ${AGENT}`;
    }
  });
};

beforeEach(asOwnerCleanup);
afterAll(async () => {
  await asOwnerCleanup();
  await sql.end();
});

describe("Postgres prompt store (decision 0038)", () => {
  it("numbers versions per key and lists them newest first", async () => {
    await repository.insertVersion({ ...platformKey, body: "P1", bodySha256: SHA, note: null, createdBy: "staff" });
    await repository.insertVersion({ ...platformKey, body: "P2", bodySha256: SHA, note: "second", createdBy: "staff" });
    await repository.insertVersion({
      ...tenantKey(TENANT_A),
      body: "A1",
      bodySha256: SHA,
      note: null,
      createdBy: "alice",
    });
    expect((await repository.listVersions(platformKey)).map((version) => [version.version, version.body])).toEqual([
      [2, "P2"],
      [1, "P1"],
    ]);
    expect((await repository.listVersions(tenantKey(TENANT_A))).map((version) => version.version)).toEqual([1]);
  });

  it("isolates tenant addenda with row level security while platform rows stay visible to every tenant", async () => {
    const platform = await repository.insertVersion({
      ...platformKey,
      body: "P1",
      bodySha256: SHA,
      note: null,
      createdBy: "staff",
    });
    const addendum = await repository.insertVersion({
      ...tenantKey(TENANT_A),
      body: "A secret",
      bodySha256: SHA,
      note: null,
      createdBy: "alice",
    });
    await repository.insertActivation({
      ...platformKey,
      versionId: platform.id,
      forced: true,
      reason: "seed",
      activatedBy: "staff",
    });
    await repository.insertActivation({
      ...tenantKey(TENANT_A),
      versionId: addendum.id,
      forced: false,
      reason: null,
      activatedBy: "alice",
    });
    expect(await repository.getVersion({ versionId: addendum.id, tenantId: TENANT_B })).toBeNull();
    expect(await repository.getVersion({ versionId: addendum.id, tenantId: null })).toBeNull();
    expect((await repository.getVersion({ versionId: platform.id, tenantId: TENANT_B }))?.body).toBe("P1");
    // Even a query that names tenant A's key sees nothing under tenant B's scope.
    const asB = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${PROMPTS_RUNTIME_ROLE}`);
      return tx`SELECT count(*)::int AS n FROM agents.prompt_versions WHERE tenant_id = ${TENANT_A}`;
    });
    expect(asB[0]?.n).toBe(0);
    expect(await repository.getActive({ agentId: AGENT, tenantId: TENANT_A })).toEqual({
      platform: { versionId: platform.id, body: "P1" },
      addendum: { versionId: addendum.id, body: "A secret" },
    });
    expect((await repository.getActive({ agentId: AGENT, tenantId: TENANT_B })).addendum).toBeNull();
  });

  it("is append-only for the runtime role: bodies cannot change and rows cannot be deleted, only the eval is recorded", async () => {
    const version = await repository.insertVersion({
      ...platformKey,
      body: "P1",
      bodySha256: SHA,
      note: null,
      createdBy: "staff",
    });
    await repository.recordEval({ versionId: version.id, tenantId: null, experimentId: "exp-1", verdict: "passed" });
    expect(await repository.getVersion({ versionId: version.id, tenantId: null })).toMatchObject({
      evalExperimentId: "exp-1",
      evalVerdict: "passed",
      body: "P1",
    });
    const asRuntime = (statement: string) =>
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', '~platform', true)`;
        await tx.unsafe(`SET LOCAL ROLE ${PROMPTS_RUNTIME_ROLE}`);
        await tx.unsafe(statement, [version.id]);
      });
    await expect(asRuntime(`UPDATE agents.prompt_versions SET body = 'changed' WHERE id = $1`)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(asRuntime(`DELETE FROM agents.prompt_versions WHERE id = $1`)).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("keeps rollback as a new activation: the latest row wins", async () => {
    const v1 = await repository.insertVersion({
      ...platformKey,
      body: "V1",
      bodySha256: SHA,
      note: null,
      createdBy: "staff",
    });
    const v2 = await repository.insertVersion({
      ...platformKey,
      body: "V2",
      bodySha256: SHA,
      note: null,
      createdBy: "staff",
    });
    await repository.insertActivation({
      ...platformKey,
      versionId: v2.id,
      forced: false,
      reason: null,
      activatedBy: "staff",
    });
    await repository.insertActivation({
      ...platformKey,
      versionId: v1.id,
      forced: true,
      reason: "rollback",
      activatedBy: "staff",
    });
    expect((await repository.listActivations(platformKey)).map((activation) => activation.versionId)).toEqual([
      v1.id,
      v2.id,
    ]);
    expect((await repository.getActive({ agentId: AGENT, tenantId: null })).platform?.body).toBe("V1");
  });
});
