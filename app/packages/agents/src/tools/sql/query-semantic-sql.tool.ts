import type { RunSemanticQueryError } from "@core/services";
import { z } from "zod";
import type { SemanticQueryPort } from "../../runtime/runtime-ports.ts";
import { type CoreToolContext, defineCoreTool } from "../define-core-tool.ts";
import { toolFailure } from "../tool-errors.ts";

const TOOL_ID = "sql.querySemanticSql";
export const CATALOG_QUERY_PERMISSION = "core.catalog.query";
/** Audit action of every semantic query (decision 0024); SP1's `AUDIT_ACTIONS` must list it. */
export const SEMANTIC_QUERY_EXECUTED = "SEMANTIC_QUERY_EXECUTED";

const MESSAGES: Readonly<Record<RunSemanticQueryError["code"], string>> = {
  SQL_REJECTED: "The SQL is not allowed: only one SELECT over the semantic views you can read, with allowlisted functions.",
  QUERY_TIMEOUT: "The query took longer than 5 seconds; narrow it down or aggregate.",
  QUERY_FAILED: "The query failed; check column names with describeEntity.",
  CONNECTOR_DISABLED: "This data source is not enabled.",
  INVALID_LIMIT: "The limit must be between 1 and 1000.",
  TOO_MANY_PARAMS: "At most 20 parameters are allowed.",
  TENANT_CONTEXT_MISSING: "The request has no organization; the query did not run.",
};

const toToolError = (error: RunSemanticQueryError) =>
  toolFailure(TOOL_ID, error.code, MESSAGES[error.code], error.code === "SQL_REJECTED" ? { reason: error.reason, ...(error.detail === undefined ? {} : { detail: error.detail }) } : undefined);

const nodeIdsOf = (ctx: CoreToolContext): string[] => [ctx.agent.projectId, ctx.agent.unitId].filter((id): id is NonNullable<typeof id> => id !== undefined);

const SqlParamSchema = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

/**
 * `sql.querySemanticSql` (spec §8.3): read-only SQL over the `semantic` views
 * the caller may read. Tenant, node chain and permissions come from the typed
 * context; the model only writes the statement and its bound parameters.
 * Rows are data from the database, never instructions.
 */
export const createQuerySemanticSqlTool = (deps: { readonly catalog: SemanticQueryPort }) =>
  defineCoreTool({
    id: TOOL_ID,
    description:
      "Runs one read-only SELECT over the semantic views (schema semantic) to answer questions about the organization's data. Use describeEntity first to learn the columns; bind user values as $1, $2 parameters.",
    kind: "read",
    permission: CATALOG_QUERY_PERMISSION,
    inputSchema: z.strictObject({
      sql: z.string().min(1).max(10_000).describe("One PostgreSQL SELECT over semantic.<view> names; no semicolons, no DML."),
      params: z.array(SqlParamSchema).max(20).optional().describe("Values for $1, $2, ... in order."),
      limit: z.int().min(1).max(1000).optional().describe("Maximum rows to return (default 100, max 1000)."),
    }),
    outputSchema: z.strictObject({
      columns: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.unknown())),
      rowCount: z.int(),
      truncated: z.boolean(),
      fingerprint: z.string(),
    }),
    audit: { action: SEMANTIC_QUERY_EXECUTED, metadata: (output) => ({ fingerprint: output.fingerprint, rowCount: String(output.rowCount) }) },
    execute: async (input, ctx) => {
      const principal = { tenantId: ctx.agent.tenantId, nodeIds: nodeIdsOf(ctx), permissions: new Set(ctx.agent.permissions) };
      const result = await deps.catalog.runSemanticQuery({
        principal,
        sql: input.sql,
        ...(input.params === undefined ? {} : { params: input.params }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });
      if (!result.ok) throw toToolError(result.error);
      return { ...result.data, columns: [...result.data.columns], rows: result.data.rows.map((row) => ({ ...row })) };
    },
  });
