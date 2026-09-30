import { describe, expect, it } from "vitest";
import { guardSemanticSql } from "../../adapters/driven/sql-guard.ts";
import { createSemanticViewRegistry } from "../../domain/semantic-view.ts";
import type { SemanticQueryRunner } from "../ports/driven/semantic-sql-ports.ts";
import { DEFAULT_SEMANTIC_LIMIT, makeRunSemanticQuery, MAX_SEMANTIC_LIMIT } from "./run-semantic-query.ts";

const views = createSemanticViewRegistry([
  { view: "example_notes", contractId: "example.Note", permission: "example.note.read" },
  { view: "billing_invoices", contractId: "billing.Invoice", permission: "billing.invoice.read" },
]);

type RunCall = Parameters<SemanticQueryRunner["run"]>[0];

const recordingRunner = (calls: RunCall[]): SemanticQueryRunner => ({
  run: (input) => {
    calls.push(input);
    return Promise.resolve({ ok: true, data: { columns: ["id"], rows: [{ id: "n1" }], truncated: false } });
  },
});

const principal = { tenantId: "tenantA", nodeIds: ["projectA"], permissions: new Set(["core.catalog.query", "example.note.read"]) };

describe("runSemanticQuery", () => {
  it("guards, then runs with the principal's tenant scope and the default limit", async () => {
    const calls: RunCall[] = [];
    const run = makeRunSemanticQuery({ views, guard: guardSemanticSql, runner: recordingRunner(calls) });
    const result = await run({ principal, sql: "SELECT id FROM semantic.example_notes WHERE id = $1", params: ["n1"] });
    expect(result).toMatchObject({ ok: true, data: { columns: ["id"], rowCount: 1, truncated: false } });
    expect(result.ok && result.data.fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(calls).toEqual([{ scope: { tenantId: "tenantA", nodeIds: ["projectA"] }, sql: "SELECT id FROM semantic.example_notes WHERE id = $1", params: ["n1"], limit: DEFAULT_SEMANTIC_LIMIT }]);
  });

  it("caps the limit at 1000 and refuses a non-positive one", async () => {
    const calls: RunCall[] = [];
    const run = makeRunSemanticQuery({ views, guard: guardSemanticSql, runner: recordingRunner(calls) });
    await run({ principal, sql: "SELECT id FROM semantic.example_notes", limit: 50_000 });
    expect(calls[0]?.limit).toBe(MAX_SEMANTIC_LIMIT);
    expect(await run({ principal, sql: "SELECT id FROM semantic.example_notes", limit: 0 })).toMatchObject({ ok: false, error: { code: "INVALID_LIMIT" } });
  });

  it("only allows the views the principal's permissions map to, and never runs a rejected query", async () => {
    const calls: RunCall[] = [];
    const run = makeRunSemanticQuery({ views, guard: guardSemanticSql, runner: recordingRunner(calls) });
    const result = await run({ principal, sql: "SELECT * FROM semantic.billing_invoices" });
    expect(result).toEqual({ ok: false, error: { code: "SQL_REJECTED", reason: "VIEW_NOT_ALLOWED", detail: "billing_invoices" } });
    expect(calls).toEqual([]);
  });

  it("refuses to run without a tenant", async () => {
    const run = makeRunSemanticQuery({ views, guard: guardSemanticSql, runner: recordingRunner([]) });
    expect(await run({ principal: { ...principal, tenantId: "" }, sql: "SELECT id FROM semantic.example_notes" })).toMatchObject({
      ok: false,
      error: { code: "TENANT_CONTEXT_MISSING" },
    });
  });

  it("passes runner failures through as typed errors", async () => {
    const runner: SemanticQueryRunner = { run: () => Promise.resolve({ ok: false, error: { code: "QUERY_TIMEOUT" } }) };
    const run = makeRunSemanticQuery({ views, guard: guardSemanticSql, runner });
    expect(await run({ principal, sql: "SELECT id FROM semantic.example_notes" })).toEqual({ ok: false, error: { code: "QUERY_TIMEOUT" } });
  });
});
