/** Driven ports of the semantic SQL use case (decision 0024). */

export type SqlRejectionReason =
  | "TOO_LONG"
  | "PARSE_ERROR"
  | "MULTIPLE_STATEMENTS"
  | "NOT_A_SELECT"
  | "SELECT_INTO"
  | "LOCKING_CLAUSE"
  | "NODE_NOT_ALLOWED"
  | "SCHEMA_NOT_ALLOWED"
  | "VIEW_NOT_ALLOWED"
  | "FUNCTION_NOT_ALLOWED"
  | "TYPE_NOT_ALLOWED"
  | "OPERATOR_NOT_ALLOWED"
  | "PARAM_OUT_OF_RANGE";

export type SqlRejection = { readonly code: "SQL_REJECTED"; readonly reason: SqlRejectionReason; readonly detail?: string };

/** A statement that passed the guard: its text and a literal-free fingerprint (for audit). */
export type GuardedSql = { readonly sql: string; readonly fingerprint: string };

export type SemanticSqlGuard = (input: {
  readonly sql: string;
  /** View names (without schema) the principal may read. */
  readonly allowedViews: ReadonlySet<string>;
  readonly paramCount: number;
}) => Promise<{ ok: true; data: GuardedSql } | { ok: false; error: SqlRejection }>;

export type SemanticQueryScope = { readonly tenantId: string; readonly nodeIds: readonly string[] };

export type SqlParam = string | number | boolean | null;

export type SemanticQueryRows = {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly truncated: boolean;
};

export type SemanticRunnerFailure = { readonly code: "QUERY_TIMEOUT" | "QUERY_FAILED" | "CONNECTOR_DISABLED" };

/** Executes a guarded statement read-only under the tenant's RLS settings. */
export type SemanticQueryRunner = {
  readonly run: (input: {
    readonly scope: SemanticQueryScope;
    readonly sql: string;
    readonly params: readonly SqlParam[];
    readonly limit: number;
  }) => Promise<{ ok: true; data: SemanticQueryRows } | { ok: false; error: SemanticRunnerFailure }>;
};
