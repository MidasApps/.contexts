import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import { makeRunSemanticQuery } from "../../application/use-cases/run-semantic-query.ts";
import { createSemanticViewRegistry } from "../../domain/semantic-view.ts";
import { createBigQuerySemanticRunner } from "./bigquery-semantic-runner.ts";
import { createPostgresSemanticRunner } from "./postgres-semantic-runner.ts";
import { guardSemanticSql } from "./sql-guard.ts";

// Needs the compose container and `pnpm db:migrate` (roles semantic_owner/reader).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });

// Test-only fixture: a base table with FORCE ROW LEVEL SECURITY and views owned
// by semantic_owner, as the semantic view migrations will create them.
const SETUP = `
DROP VIEW IF EXISTS semantic.test_runner_notes, semantic.test_runner_slow;
DROP SCHEMA IF EXISTS test_runner_base CASCADE;
CREATE SCHEMA test_runner_base;
CREATE TABLE test_runner_base.notes (id text PRIMARY KEY, tenant_id text NOT NULL, body text NOT NULL, size int NOT NULL);
ALTER TABLE test_runner_base.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runner_base.notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON test_runner_base.notes USING (tenant_id = current_setting('app.tenant_id', true));
INSERT INTO test_runner_base.notes
  SELECT 'a-' || g, 'tenantA', 'note ' || g, g FROM generate_series(1, 1200) g
  UNION ALL SELECT 'b-1', 'tenantB', 'secret of B', 1;
GRANT USAGE ON SCHEMA test_runner_base TO semantic_owner;
GRANT SELECT ON test_runner_base.notes TO semantic_owner;
CREATE VIEW semantic.test_runner_notes AS SELECT id, tenant_id, body, size FROM test_runner_base.notes;
ALTER VIEW semantic.test_runner_notes OWNER TO semantic_owner;
CREATE VIEW semantic.test_runner_slow AS SELECT pg_sleep(0.5)::text AS slept;
ALTER VIEW semantic.test_runner_slow OWNER TO semantic_owner;
GRANT SELECT ON semantic.test_runner_notes, semantic.test_runner_slow TO semantic_reader;
`;

const TEARDOWN = `
DROP VIEW IF EXISTS semantic.test_runner_notes, semantic.test_runner_slow;
DROP SCHEMA IF EXISTS test_runner_base CASCADE;
`;

beforeAll(async () => {
  await sql.unsafe(SETUP);
});

afterAll(async () => {
  await sql.unsafe(TEARDOWN);
  await sql.end();
});

const views = createSemanticViewRegistry([
  { view: "test_runner_notes", contractId: "example.Note", permission: "example.note.read" },
  { view: "test_runner_slow", contractId: "example.Slow", permission: "example.note.read" },
]);
const permissions = new Set(["example.note.read"]);
const run = makeRunSemanticQuery({
  views,
  guard: guardSemanticSql,
  runner: createPostgresSemanticRunner(sql, { statementTimeoutMs: 100 }),
});
const runner = createPostgresSemanticRunner(sql);

describe("postgres semantic runner", () => {
  it("shows a tenant only its own rows", async () => {
    const result = await run({
      principal: { tenantId: "tenantB", nodeIds: [], permissions },
      sql: "SELECT id, body FROM semantic.test_runner_notes",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { columns: ["id", "body"], rows: [{ id: "b-1", body: "secret of B" }], rowCount: 1 },
    });
  });

  it("returns zero rows when the tenant setting is missing", async () => {
    const result = await runner.run({
      scope: { tenantId: "no-such-tenant", nodeIds: [] },
      sql: "SELECT id FROM semantic.test_runner_notes",
      params: [],
      limit: 10,
    });
    expect(result).toEqual({ ok: true, data: { columns: ["id"], rows: [], truncated: false } });
  });

  it("caps rows at the default 100 and at most 1000, flagging truncation", async () => {
    const principal = { tenantId: "tenantA", nodeIds: [], permissions };
    const byDefault = await run({ principal, sql: "SELECT id FROM semantic.test_runner_notes" });
    const capped = await run({ principal, sql: "SELECT id FROM semantic.test_runner_notes", limit: 5000 });
    expect(byDefault).toMatchObject({ ok: true, data: { rowCount: 100, truncated: true } });
    expect(capped).toMatchObject({ ok: true, data: { rowCount: 1000, truncated: true } });
  });

  it("binds parameters instead of interpolating them", async () => {
    const result = await run({
      principal: { tenantId: "tenantA", nodeIds: [], permissions },
      sql: "SELECT id FROM semantic.test_runner_notes WHERE body = $1",
      params: ["note 7' OR '1'='1"],
    });
    expect(result).toMatchObject({ ok: true, data: { rowCount: 0 } });
  });

  it("cannot reach pg_sleep through an allowlisted-looking query", async () => {
    const principal = { tenantId: "tenantA", nodeIds: [], permissions };
    const tricks = [
      "SELECT id FROM semantic.test_runner_notes WHERE size = (SELECT 1 FROM semantic.test_runner_notes WHERE pg_sleep(6) IS NULL LIMIT 1)",
      'SELECT U&"pg\\005fsleep"(6) FROM semantic.test_runner_notes',
      "SELECT id FROM semantic.test_runner_notes; SELECT pg_sleep(6)",
    ];
    for (const trick of tricks) {
      expect(await run({ principal, sql: trick })).toMatchObject({ ok: false, error: { code: "SQL_REJECTED" } });
    }
  });

  it("stops a statement that exceeds the timeout with QUERY_TIMEOUT", async () => {
    const result = await run({
      principal: { tenantId: "tenantA", nodeIds: [], permissions },
      sql: "SELECT slept FROM semantic.test_runner_slow",
    });
    expect(result).toEqual({ ok: false, error: { code: "QUERY_TIMEOUT" } });
  });

  it("runs as semantic_reader in a read-only transaction", async () => {
    const result = await runner.run({
      scope: { tenantId: "tenantA", nodeIds: [] },
      sql: "SELECT id FROM semantic.test_runner_notes WHERE id = 'a-1'",
      params: [],
      limit: 1,
    });
    expect(result.ok).toBe(true);
    // A direct base-table read as semantic_reader is denied: only views are granted.
    const denied = await runner.run({
      scope: { tenantId: "tenantA", nodeIds: [] },
      sql: "SELECT id FROM test_runner_base.notes",
      params: [],
      limit: 1,
    });
    expect(denied).toEqual({ ok: false, error: { code: "QUERY_FAILED" } });
  });
});

describe("bigquery semantic runner", () => {
  it("is fail-closed", async () => {
    const result = await createBigQuerySemanticRunner().run({
      scope: { tenantId: "tenantA", nodeIds: [] },
      sql: "SELECT 1",
      params: [],
      limit: 1,
    });
    expect(result).toEqual({ ok: false, error: { code: "CONNECTOR_DISABLED" } });
  });
});
