import type { SemanticViewRegistry } from "../../domain/semantic-view.ts";
import type {
  SemanticQueryRunner,
  SemanticRunnerFailure,
  SemanticSqlGuard,
  SqlParam,
  SqlRejection,
} from "../ports/driven/semantic-sql-ports.ts";

export const DEFAULT_SEMANTIC_LIMIT = 100;
export const MAX_SEMANTIC_LIMIT = 1000;
export const MAX_SEMANTIC_PARAMS = 20;

/** Who runs the query; built server-side from the verified principal (never from model output). */
export type SemanticQueryPrincipal = {
  readonly tenantId: string;
  /** Project/unit ids of the active node chain (`app.node_ids`). */
  readonly nodeIds: readonly string[];
  /** Effective permissions; each registered view needs its contract's permission. */
  readonly permissions: ReadonlySet<string>;
};

export type RunSemanticQueryInput = {
  readonly principal: SemanticQueryPrincipal;
  readonly sql: string;
  readonly params?: readonly SqlParam[];
  readonly limit?: number;
};

export type SemanticQueryResult = {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly rowCount: number;
  readonly truncated: boolean;
  /** Literal-free fingerprint of the SQL, for the audit trail. */
  readonly fingerprint: string;
};

export type RunSemanticQueryError =
  | SqlRejection
  | SemanticRunnerFailure
  | { readonly code: "INVALID_LIMIT" | "TOO_MANY_PARAMS" | "TENANT_CONTEXT_MISSING" };

export type RunSemanticQuery = (
  input: RunSemanticQueryInput,
) => Promise<{ ok: true; data: SemanticQueryResult } | { ok: false; error: RunSemanticQueryError }>;

const resolveLimit = (limit: number | undefined): number | undefined => {
  if (limit === undefined) return DEFAULT_SEMANTIC_LIMIT;
  return Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_SEMANTIC_LIMIT) : undefined;
};

/**
 * Read-only SQL over semantic views (spec §8.3, decision 0024): AST guard with
 * the principal's view allowlist, then the runner (read-only transaction,
 * `semantic_reader`, statement timeout, tenant RLS settings), LIMIT 100 by
 * default and 1000 at most. A rejected statement never reaches the database.
 */
export const makeRunSemanticQuery =
  (deps: { readonly views: SemanticViewRegistry; readonly guard: SemanticSqlGuard; readonly runner: SemanticQueryRunner }): RunSemanticQuery =>
  async ({ principal, sql, params = [], limit }) => {
    if (principal.tenantId.trim() === "") return { ok: false, error: { code: "TENANT_CONTEXT_MISSING" } };
    const cap = resolveLimit(limit);
    if (cap === undefined) return { ok: false, error: { code: "INVALID_LIMIT" } };
    if (params.length > MAX_SEMANTIC_PARAMS) return { ok: false, error: { code: "TOO_MANY_PARAMS" } };
    const guarded = await deps.guard({ sql, allowedViews: deps.views.allowedFor(principal.permissions), paramCount: params.length });
    if (!guarded.ok) return guarded;
    const scope = { tenantId: principal.tenantId, nodeIds: principal.nodeIds };
    const result = await deps.runner.run({ scope, sql: guarded.data.sql, params, limit: cap });
    if (!result.ok) return result;
    const { columns, rows, truncated } = result.data;
    return { ok: true, data: { columns, rows, rowCount: rows.length, truncated, fingerprint: guarded.data.fingerprint } };
  };
