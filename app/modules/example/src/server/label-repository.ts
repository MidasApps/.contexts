import { type PostgresClient, type PostgresTransaction, withTenantTransaction } from "@core/services";

/** NOLOGIN role every query of the module runs as (migration 0000): no BYPASSRLS, no DDL. */
export const EXAMPLE_RUNTIME_ROLE = "example_runtime";

/** A label of the example module (`example.labels`). */
export type Label = {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly createdAt: string;
};

/** Driven port over `example.labels`: the template of a module repository in Postgres (decision 0077). */
export type LabelRepository = {
  readonly add: (args: { tenantId: string; name: string; actorId: string }) => Promise<Label>;
  readonly list: (args: { tenantId: string }) => Promise<Label[]>;
};

/** Bug guard: `INSERT … RETURNING` answered no row. */
export class LabelNotReturnedError extends Error {
  readonly code = "LABEL_NOT_RETURNED";

  constructor() {
    super("the insert into example.labels returned no row");
    this.name = "LabelNotReturnedError";
  }
}

type LabelRow = { id: string; tenant_id: string; name: string; created_at: Date };

const toLabel = (row: LabelRow): Label => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  createdAt: row.created_at.toISOString(),
});

// Every transaction switches to the runtime role, so the policy applies even when the login role
// could bypass it (a local superuser); the tenant setting comes from withTenantTransaction.
const asRuntime = async (tx: PostgresTransaction): Promise<void> => {
  await tx.unsafe(`SET LOCAL ROLE ${EXAMPLE_RUNTIME_ROLE}`);
};

/** Labels over Postgres. The queries filter by tenant and the policy enforces it. */
export const createPostgresLabelRepository = (sql: PostgresClient): LabelRepository => ({
  add: ({ tenantId, name, actorId }) =>
    withTenantTransaction(sql, { tenantId }, async (tx) => {
      await asRuntime(tx);
      const rows = await tx<LabelRow[]>`
        INSERT INTO example.labels (tenant_id, name, created_by, updated_by)
        VALUES (${tenantId}, ${name}, ${actorId}, ${actorId})
        RETURNING id, tenant_id, name, created_at`;
      const row = rows[0];
      if (row === undefined) throw new LabelNotReturnedError();
      return toLabel(row);
    }),
  list: ({ tenantId }) =>
    withTenantTransaction(sql, { tenantId, readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const rows = await tx<LabelRow[]>`
        SELECT id, tenant_id, name, created_at FROM example.labels
        WHERE tenant_id = ${tenantId}
        ORDER BY name, id`;
      return rows.map(toLabel);
    }),
});

/** The module's labels from the dependencies the apps hand over (`deps.sql`). */
export const createExampleLabels = (deps: { readonly sql: PostgresClient }): LabelRepository =>
  createPostgresLabelRepository(deps.sql);
