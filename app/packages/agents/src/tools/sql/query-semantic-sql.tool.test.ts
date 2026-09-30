import type { RunSemanticQuery } from "@core/services";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../../testing/fake-ports.ts";
import { runCoreTool } from "../core-tool-pipeline.ts";
import type { CoreToolDeps, ToolCallInfo } from "../define-core-tool.ts";
import { CoreToolError } from "../tool-errors.ts";
import { createQuerySemanticSqlTool, SEMANTIC_QUERY_EXECUTED } from "./query-semantic-sql.tool.ts";

const PERMISSIONS = ["core.catalog.query", "example.note.read"];
type RunInput = Parameters<RunSemanticQuery>[0];

const setup = (result: Awaited<ReturnType<RunSemanticQuery>>) => {
  const calls: RunInput[] = [];
  const runSemanticQuery: RunSemanticQuery = (input) => {
    calls.push(input);
    return Promise.resolve(result);
  };
  const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: PERMISSIONS }] });
  const audit = createFakeAuditPort();
  const deps: CoreToolDeps = { access, audit, approvals: createFakeApprovalPort() };
  return { calls, audit, deps, tool: createQuerySemanticSqlTool({ catalog: { runSemanticQuery } }) };
};

const call = (overrides: Parameters<typeof buildAgentContextEntries>[0] = {}): ToolCallInfo => ({
  requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions: PERMISSIONS, ...overrides })),
  agentId: "data",
  toolCallId: "call_3",
});

const OK = { ok: true as const, data: { columns: ["id"], rows: [{ id: "n1" }], rowCount: 1, truncated: false, fingerprint: "ab12" } };

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error: unknown) {
    if (error instanceof CoreToolError) return `${error.code}${error.details.reason === undefined ? "" : `:${String(error.details.reason)}`}`;
    throw error;
  }
};

describe("querySemanticSql", () => {
  it("runs with the tenant, node chain and permissions from the context, never from the input", async () => {
    const { deps, tool, calls } = setup(OK);
    const result = await runCoreTool(tool, deps, { sql: "SELECT id FROM semantic.example_notes", params: ["x"], limit: 10 }, call({ projectId: "project-1", unitId: "unit-1" }));
    expect(result).toEqual(OK.data);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sql: "SELECT id FROM semantic.example_notes", params: ["x"], limit: 10, principal: { tenantId: TEST_TENANT, nodeIds: ["project-1", "unit-1"] } });
    expect([...(calls[0]?.principal.permissions ?? [])]).toEqual(PERMISSIONS);
  });

  it("rejects a tenant id smuggled into the input", async () => {
    const { deps, tool, calls } = setup(OK);
    expect(await codeOf(runCoreTool(tool, deps, { sql: "SELECT 1", tenantId: "other" }, call()))).toBe("TOOL_INPUT_INVALID");
    expect(calls).toEqual([]);
  });

  it("audits SEMANTIC_QUERY_EXECUTED with the SQL fingerprint, not the SQL", async () => {
    const { deps, tool, audit } = setup(OK);
    await runCoreTool(tool, deps, { sql: "SELECT id FROM semantic.example_notes WHERE body = 'private'" }, call());
    expect(audit.entries[0]).toMatchObject({ action: SEMANTIC_QUERY_EXECUTED, metadata: { fingerprint: "ab12", rowCount: "1", outcome: "succeeded" } });
    expect(JSON.stringify(audit.entries)).not.toContain("private");
  });

  it("maps guard and runner failures to typed tool errors", async () => {
    const rejected = setup({ ok: false, error: { code: "SQL_REJECTED", reason: "FUNCTION_NOT_ALLOWED", detail: "pg_sleep" } });
    expect(await codeOf(runCoreTool(rejected.tool, rejected.deps, { sql: "SELECT pg_sleep(6)" }, call()))).toBe("SQL_REJECTED:FUNCTION_NOT_ALLOWED");
    const timeout = setup({ ok: false, error: { code: "QUERY_TIMEOUT" } });
    expect(await codeOf(runCoreTool(timeout.tool, timeout.deps, { sql: "SELECT 1" }, call()))).toBe("QUERY_TIMEOUT");
    const disabled = setup({ ok: false, error: { code: "CONNECTOR_DISABLED" } });
    expect(await codeOf(runCoreTool(disabled.tool, disabled.deps, { sql: "SELECT 1" }, call()))).toBe("CONNECTOR_DISABLED");
  });

  it("needs core.catalog.query", async () => {
    const { deps, tool, calls } = setup(OK);
    expect(await codeOf(runCoreTool(tool, deps, { sql: "SELECT 1" }, call({ permissions: ["example.note.read"] })))).toMatch(/^FORBIDDEN/);
    expect(calls).toEqual([]);
  });
});
