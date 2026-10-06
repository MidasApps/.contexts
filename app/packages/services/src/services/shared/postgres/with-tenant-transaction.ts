import type { Sql, TransactionSql } from "postgres";

/**
 * Tenant scope of one transaction. Row level security policies read
 * `current_setting('app.tenant_id', true)` and, for node-scoped rows,
 * `app.node_ids` as a comma-separated list (decision 0022, spec §8.3).
 */
export type TenantScope = {
  tenantId: string;
  /** Project/unit ids the principal may see; empty means tenant-level only. */
  nodeIds?: readonly string[];
  readOnly?: boolean;
};

/** Bug: a tenant-scoped query ran without a tenant (never default one). */
export class TenantContextMissingError extends Error {
  readonly code = "TENANT_CONTEXT_MISSING";

  constructor() {
    super("tenant-scoped transaction without tenantId");
    this.name = "TenantContextMissingError";
  }
}

/** Bug: a node id would break the comma-separated `app.node_ids` list. */
export class InvalidNodeIdError extends Error {
  readonly code = "INVALID_NODE_ID";

  constructor() {
    super("node ids must be non-empty and contain no comma");
    this.name = "InvalidNodeIdError";
  }
}

const assertScope = (scope: TenantScope): void => {
  if (scope.tenantId.trim() === "") throw new TenantContextMissingError();
  if ((scope.nodeIds ?? []).some((id) => id === "" || id.includes(","))) throw new InvalidNodeIdError();
};

/**
 * Runs `fn` in one transaction whose `app.tenant_id` / `app.node_ids` settings
 * are local to it (`set_config(..., true)`): they vanish at commit or rollback,
 * so a pooled connection never carries a tenant into the next caller.
 * @throws {TenantContextMissingError} before any query when `tenantId` is empty.
 */
export const withTenantTransaction = async <TResult>(
  sql: Sql,
  scope: TenantScope,
  fn: (tx: TransactionSql) => Promise<TResult>,
): Promise<TResult> => {
  assertScope(scope);
  const mode = scope.readOnly === true ? "read only" : "read write";
  const result = await sql.begin(mode, async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${scope.tenantId}, true),
                    set_config('app.node_ids', ${(scope.nodeIds ?? []).join(",")}, true)`;
    return fn(tx);
  });
  // postgres.js types `begin` as UnwrapPromiseArray<T>; for a non-array T it is T.
  return result as TResult;
};
