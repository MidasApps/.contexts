import type { Sql, TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresClient } from "./postgres-client.ts";
import { TenantContextMissingError, withTenantTransaction } from "./with-tenant-transaction.ts";

// Needs the compose container (`docker compose up -d --wait` in app/).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 1 });

afterAll(async () => {
  await sql.end();
});

type Settings = { tenantId: string | null; nodeIds: string | null };

const readSettings = async (query: Sql | TransactionSql): Promise<Settings> => {
  const [row] = await query<Settings[]>`
    SELECT current_setting('app.tenant_id', true) AS "tenantId",
           current_setting('app.node_ids', true) AS "nodeIds"`;
  return row ?? { tenantId: null, nodeIds: null };
};

// A reused session keeps the custom GUC defined (as ''), so "unset" means null or ''.
const isUnset = (value: string | null) => value === null || value === "";

describe("withTenantTransaction", () => {
  it("exposes tenant and node ids inside the transaction only", async () => {
    const inside = await withTenantTransaction(
      sql,
      { tenantId: "tenantA", nodeIds: ["projectA", "unitA"], readOnly: true },
      (tx) => readSettings(tx),
    );
    const after = await readSettings(sql);

    expect(inside).toEqual({ tenantId: "tenantA", nodeIds: "projectA,unitA" });
    expect(isUnset(after.tenantId)).toBe(true);
    expect(isUnset(after.nodeIds)).toBe(true);
  });

  it("returns the callback result after commit", async () => {
    await expect(withTenantTransaction(sql, { tenantId: "tenantA" }, () => Promise.resolve(42))).resolves.toBe(42);
  });

  it("refuses to run without a tenant, before opening a transaction", async () => {
    let ran = false;
    const run = withTenantTransaction(sql, { tenantId: "" }, () => {
      ran = true;
      return Promise.resolve();
    });

    await expect(run).rejects.toBeInstanceOf(TenantContextMissingError);
    expect(ran).toBe(false);
  });

  it("rejects writes in a read-only transaction", async () => {
    const write = withTenantTransaction(sql, { tenantId: "tenantA", readOnly: true }, (tx) =>
      tx`CREATE TEMP TABLE should_not_exist (id int)`,
    );

    await expect(write).rejects.toMatchObject({ code: "25006" });
  });
});
