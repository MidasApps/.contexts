import { describe, expect, it } from "vitest";
import { guardConnectorSql, guardSemanticSql } from "./sql-guard.ts";

const ALLOWED = new Set(["example_notes", "example_tags"]);

const guard = (sql: string, paramCount = 0) => guardSemanticSql({ sql, allowedViews: ALLOWED, paramCount });

const reasonOf = async (sql: string, paramCount = 0): Promise<string> => {
  const result = await guard(sql, paramCount);
  return result.ok ? "ACCEPTED" : result.error.reason;
};

describe("guardSemanticSql accepts read-only queries over allowlisted views", () => {
  it.each([
    ["plain select", "SELECT id, text FROM semantic.example_notes"],
    ["where with a bound parameter", "SELECT id FROM semantic.example_notes WHERE author_id = $1 AND created_at >= $2"],
    [
      "aggregates and group by",
      "SELECT author_id, count(*), max(created_at) FROM semantic.example_notes GROUP BY author_id HAVING count(*) > 2",
    ],
    [
      "cte",
      "WITH recent AS (SELECT id, created_at FROM semantic.example_notes WHERE created_at > now() - interval '7 days') SELECT count(*) FROM recent",
    ],
    [
      "join of two views",
      "SELECT n.id, t.name FROM semantic.example_notes n JOIN semantic.example_tags t ON t.note_id = n.id",
    ],
    [
      "date_trunc, coalesce and casts",
      "SELECT date_trunc('month', created_at) AS m, coalesce(sum(size), 0)::bigint FROM semantic.example_notes GROUP BY 1 ORDER BY 1 DESC",
    ],
    [
      "case, in-list, like, between, is null",
      "SELECT CASE WHEN size > 10 THEN 'big' ELSE 'small' END FROM semantic.example_notes WHERE status IN ('a', 'b') AND text ILIKE '%x%' AND size BETWEEN 1 AND 5 AND archived_at IS NULL",
    ],
    [
      "subquery and union",
      "SELECT id FROM semantic.example_notes WHERE id IN (SELECT note_id FROM semantic.example_tags) UNION SELECT note_id FROM semantic.example_tags",
    ],
    [
      "window function",
      "SELECT id, row_number() OVER (PARTITION BY author_id ORDER BY created_at) FROM semantic.example_notes",
    ],
    ["extract and current_date", "SELECT extract(year FROM created_at), current_date FROM semantic.example_notes"],
  ])("%s", async (_name, sql) => {
    expect(await reasonOf(sql, 2)).toBe("ACCEPTED");
  });

  it("returns the parsed statement and a fingerprint that ignores literal values", async () => {
    const first = await guard("SELECT id FROM semantic.example_notes WHERE size > 3");
    const second = await guard("SELECT id FROM semantic.example_notes WHERE size > 99");
    if (!first.ok || !second.ok) throw new Error("expected both to pass");
    expect(first.data.fingerprint).toBe(second.data.fingerprint);
    expect(first.data.sql).toBe("SELECT id FROM semantic.example_notes WHERE size > 3");
  });
});

describe("guardSemanticSql rejects everything else", () => {
  it.each([
    [
      "multiple statements",
      "SELECT 1 FROM semantic.example_notes; SELECT 2 FROM semantic.example_notes",
      "MULTIPLE_STATEMENTS",
    ],
    ["empty input", "  ;  ", "NOT_A_SELECT"],
    ["insert", "INSERT INTO semantic.example_notes (id) VALUES ('x')", "NOT_A_SELECT"],
    ["update", "UPDATE semantic.example_notes SET text = 'x'", "NOT_A_SELECT"],
    ["delete", "DELETE FROM semantic.example_notes", "NOT_A_SELECT"],
    ["copy", "COPY semantic.example_notes TO STDOUT", "NOT_A_SELECT"],
    ["set", "SET statement_timeout = 0", "NOT_A_SELECT"],
    ["do block", "DO $$ BEGIN PERFORM 1; END $$", "NOT_A_SELECT"],
    ["call", "CALL do_something()", "NOT_A_SELECT"],
    ["explain analyze", "EXPLAIN ANALYZE SELECT * FROM semantic.example_notes", "NOT_A_SELECT"],
    ["select into", "SELECT id INTO TEMP stolen FROM semantic.example_notes", "SELECT_INTO"],
    ["for update", "SELECT id FROM semantic.example_notes FOR UPDATE", "LOCKING_CLAUSE"],
    [
      "for share inside a subquery",
      "SELECT * FROM (SELECT id FROM semantic.example_notes FOR SHARE) q",
      "LOCKING_CLAUSE",
    ],
    ["dml in a cte", "WITH d AS (DELETE FROM semantic.example_notes RETURNING id) SELECT * FROM d", "NODE_NOT_ALLOWED"],
    ["base table in public", "SELECT * FROM public.notes", "SCHEMA_NOT_ALLOWED"],
    ["unqualified table", "SELECT * FROM notes", "SCHEMA_NOT_ALLOWED"],
    ["system catalog", "SELECT * FROM pg_catalog.pg_authid", "SCHEMA_NOT_ALLOWED"],
    ["mastra schema", "SELECT * FROM mastra.mastra_threads", "SCHEMA_NOT_ALLOWED"],
    ["view not granted to the principal", "SELECT * FROM semantic.billing_invoices", "VIEW_NOT_ALLOWED"],
    ["cross-database reference", "SELECT * FROM otherdb.semantic.example_notes", "SCHEMA_NOT_ALLOWED"],
    ["pg_sleep", "SELECT pg_sleep(6) FROM semantic.example_notes", "FUNCTION_NOT_ALLOWED"],
    [
      "pg_sleep hidden in a where clause",
      "SELECT id FROM semantic.example_notes WHERE pg_sleep(6) IS NULL",
      "FUNCTION_NOT_ALLOWED",
    ],
    ["schema-qualified pg_sleep", "SELECT pg_catalog.pg_sleep(6)", "FUNCTION_NOT_ALLOWED"],
    ["set_config", "SELECT set_config('app.tenant_id', 'other', true)", "FUNCTION_NOT_ALLOWED"],
    ["current_setting", "SELECT current_setting('app.tenant_id')", "FUNCTION_NOT_ALLOWED"],
    [
      "dblink",
      "SELECT * FROM semantic.example_notes WHERE id = (SELECT dblink('host=x', 'select 1'))",
      "FUNCTION_NOT_ALLOWED",
    ],
    ["lo_import", "SELECT lo_import('/etc/passwd')", "FUNCTION_NOT_ALLOWED"],
    ["set-returning function in from", "SELECT * FROM generate_series(1, 1000000000)", "NODE_NOT_ALLOWED"],
    [
      "comment hiding a second statement",
      "SELECT id FROM semantic.example_notes /* harmless */; DELETE FROM semantic.example_notes -- done",
      "MULTIPLE_STATEMENTS",
    ],
    [
      "comment hiding a non-select",
      "/* SELECT * FROM semantic.example_notes */ DELETE FROM semantic.example_notes",
      "NOT_A_SELECT",
    ],
    [
      "unicode-escaped function name",
      'SELECT U&"pg\\005fsleep"(6) FROM semantic.example_notes',
      "FUNCTION_NOT_ALLOWED",
    ],
    ["unicode-escaped schema name", 'SELECT * FROM U&"\\0070ublic".notes', "SCHEMA_NOT_ALLOWED"],
    ["current_user leaks the role", "SELECT current_user FROM semantic.example_notes", "NODE_NOT_ALLOWED"],
    ["regclass cast", "SELECT 'pg_authid'::regclass", "TYPE_NOT_ALLOWED"],
    ["parameter beyond the bound ones", "SELECT id FROM semantic.example_notes WHERE id = $3", "PARAM_OUT_OF_RANGE"],
    ["syntax error", "SELEC id FROM semantic.example_notes", "PARSE_ERROR"],
  ])("%s", async (_name, sql, reason) => {
    expect(await reasonOf(sql, 2)).toBe(reason);
  });

  it("rejects a cte name that shadows nothing but is used with a schema", async () => {
    expect(await reasonOf("WITH x AS (SELECT id FROM semantic.example_notes) SELECT * FROM public.x")).toBe(
      "SCHEMA_NOT_ALLOWED",
    );
  });

  it("rejects input longer than the size cap before parsing", async () => {
    expect(await reasonOf(`SELECT id FROM semantic.example_notes WHERE text = '${"x".repeat(20_000)}'`)).toBe(
      "TOO_LONG",
    );
  });
});

describe("connector sql guard", () => {
  const relations = new Set(["public.orders_summary"]);
  const connectorReason = async (sql: string): Promise<string> => {
    const result = await guardConnectorSql({ sql, allowedRelations: relations, paramCount: 1 });
    return result.ok ? "ACCEPTED" : result.error.reason;
  };

  it("accepts the connector's qualified relations only", async () => {
    expect(await connectorReason("SELECT count(*) FROM public.orders_summary WHERE status = $1")).toBe("ACCEPTED");
    expect(await connectorReason("SELECT * FROM public.users")).toBe("VIEW_NOT_ALLOWED");
    expect(await connectorReason("SELECT * FROM semantic.example_notes")).toBe("VIEW_NOT_ALLOWED");
    expect(await connectorReason("SELECT * FROM orders_summary")).toBe("SCHEMA_NOT_ALLOWED");
    expect(await connectorReason("DELETE FROM public.orders_summary")).toBe("NOT_A_SELECT");
  });
});
