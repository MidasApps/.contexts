import { createPostgresClient, type PostgresTransaction } from "@core/services";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresLabelRepository, EXAMPLE_RUNTIME_ROLE } from "./label-repository.ts";

// Needs the compose container and `pnpm db:migrate` (the module's migration 0000).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const labels = createPostgresLabelRepository(sql);

const TENANT_A = "exampleLabelsTenantA";
const TENANT_B = "exampleLabelsTenantB";

/** Runs `fn` as the runtime role, with the tenant setting or without it (`null`). */
const asTenant = async <T>(tenantId: string | null, fn: (tx: PostgresTransaction) => Promise<T>): Promise<T> =>
  (await sql.begin(async (tx) => {
    if (tenantId !== null) await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.unsafe(`SET LOCAL ROLE ${EXAMPLE_RUNTIME_ROLE}`);
    return fn(tx);
  })) as T;

const countAll = (tx: PostgresTransaction) => tx<{ n: string }[]>`SELECT count(*) AS n FROM example.labels`;

// Each tenant clears its own rows through the policy; the suite needs no superuser.
const clear = async (): Promise<void> => {
  for (const tenantId of [TENANT_A, TENANT_B]) await asTenant(tenantId, (tx) => tx`DELETE FROM example.labels`);
};

beforeEach(clear);
afterAll(async () => {
  await clear();
  await sql.end();
});

describe("example.labels isolation", () => {
  it("lists only the caller tenant's labels", async () => {
    await labels.add({ tenantId: TENANT_A, name: "urgent", actorId: "uid-1" });
    await labels.add({ tenantId: TENANT_B, name: "later", actorId: "uid-2" });
    expect((await labels.list({ tenantId: TENANT_A })).map((label) => label.name)).toEqual(["urgent"]);
    expect((await labels.list({ tenantId: TENANT_B })).map((label) => label.name)).toEqual(["later"]);
  });

  it("never shows another tenant's rows to the runtime role, whatever the query asks", async () => {
    await labels.add({ tenantId: TENANT_B, name: "later", actorId: "uid-2" });
    const leaked = await asTenant(
      TENANT_A,
      (tx) => tx<{ n: string }[]>`SELECT count(*) AS n FROM example.labels WHERE tenant_id = ${TENANT_B}`,
    );
    expect(leaked[0]?.n).toBe("0");
  });

  it("returns no row when no tenant is set", async () => {
    await labels.add({ tenantId: TENANT_A, name: "urgent", actorId: "uid-1" });
    expect((await asTenant(null, countAll))[0]?.n).toBe("0");
  });

  it("refuses a row of another tenant (WITH CHECK)", async () => {
    const forged = (tx: PostgresTransaction) => tx`
      INSERT INTO example.labels (tenant_id, name, created_by, updated_by)
      VALUES (${TENANT_B}, 'forged', 'uid-1', 'uid-1')`;
    await expect(asTenant(TENANT_A, forged)).rejects.toThrow(/row-level security/);
  });

  it("lets two tenants use the same label name and refuses it twice in one tenant", async () => {
    await labels.add({ tenantId: TENANT_A, name: "urgent", actorId: "uid-1" });
    await labels.add({ tenantId: TENANT_B, name: "urgent", actorId: "uid-2" });
    await expect(labels.add({ tenantId: TENANT_A, name: "urgent", actorId: "uid-1" })).rejects.toThrow(
      /labels_tenant_id_name_key/,
    );
  });

  it("keeps DDL away from the runtime role", async () => {
    const ddl = (tx: PostgresTransaction) => tx.unsafe("CREATE TABLE example.forbidden (id integer)");
    await expect(asTenant(TENANT_A, ddl)).rejects.toThrow(/permission denied/);
  });
});
