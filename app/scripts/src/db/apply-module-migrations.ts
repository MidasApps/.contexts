import type { PostgresClient } from "@core/services";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { ModuleMigrations } from "./module-migrations.ts";

/** Thrown when a module's schema breaks the convention of decision 0077 after its migrations ran. */
export class ModuleSchemaConventionError extends Error {
  readonly code = "MODULE_SCHEMA_CONVENTION";
  readonly moduleId: string;
  readonly violations: readonly string[];

  constructor(moduleId: string, violations: readonly string[]) {
    super(`module ${moduleId} breaks the Postgres convention: ${violations.join("; ")}`);
    this.name = "ModuleSchemaConventionError";
    this.moduleId = moduleId;
    this.violations = violations;
  }
}

type FoundRow = { schema: boolean; role: boolean };
type TableRow = { name: string; forced: boolean; tenant_policy: boolean };
type PolicyRow = { table: string; policy: string };
type ViewRow = { name: string; materialized: boolean };
type RoleRow = { unsafe: boolean; creates: boolean };

/**
 * What the module's schema and runtime role break of the convention; empty when they follow it.
 * It reads the catalog, not the meaning of an expression: a floor under the isolation suite each
 * table needs, not a replacement for it.
 */
export const findConventionViolations = async (sql: PostgresClient, module: ModuleMigrations): Promise<string[]> => {
  const { schema, runtimeRole } = module;
  const [found] = await sql<FoundRow[]>`
    SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${schema}::text) AS schema,
           EXISTS (SELECT FROM pg_roles WHERE rolname = ${runtimeRole}::text) AS role`;
  const missing = [
    ...(found?.schema === true ? [] : [`schema ${schema} does not exist`]),
    ...(found?.role === true ? [] : [`role ${runtimeRole} does not exist`]),
  ];
  if (missing.length > 0) return missing;
  const tables = await sql<TableRow[]>`
    SELECT c.relname AS name,
           (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
           EXISTS (
             SELECT FROM pg_policies p
             WHERE p.schemaname = n.nspname AND p.tablename = c.relname
               AND (coalesce(p.qual, '') LIKE '%app.tenant_id%' OR coalesce(p.with_check, '') LIKE '%app.tenant_id%')
           ) AS tenant_policy
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema}::text AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`;
  // Permissive policies are OR-ed, and WITH CHECK guards writes: one expression without the tenant opens the table.
  const loosePolicies = await sql<PolicyRow[]>`
    SELECT p.tablename AS "table", p.policyname AS policy
    FROM pg_policies p
    WHERE p.schemaname = ${schema}::text AND p.permissive = 'PERMISSIVE'
      AND ((p.qual IS NOT NULL AND p.qual NOT LIKE '%app.tenant_id%')
        OR (p.with_check IS NOT NULL AND p.with_check NOT LIKE '%app.tenant_id%'))
    ORDER BY p.tablename, p.policyname`;
  // A view runs as its owner unless it is security_invoker, and a materialized view has no row level security.
  const openViews = await sql<ViewRow[]>`
    SELECT c.relname AS name, c.relkind = 'm' AS materialized
    FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.rolname = ${runtimeRole}::text
    WHERE n.nspname = ${schema}::text
      AND (c.relkind = 'm' OR (c.relkind = 'v' AND NOT EXISTS (
        SELECT FROM pg_options_to_table(c.reloptions) o
        WHERE o.option_name = 'security_invoker' AND o.option_value::boolean)))
      AND has_table_privilege(r.oid, c.oid, 'SELECT')
    ORDER BY c.relkind DESC, c.relname`;
  const [role] = await sql<RoleRow[]>`
    SELECT (r.rolcanlogin OR r.rolbypassrls OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole) AS unsafe,
           has_schema_privilege(r.oid, n.oid, 'CREATE') AS creates
    FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE r.rolname = ${runtimeRole}::text AND n.nspname = ${schema}::text`;
  return [
    ...tables
      .filter((table) => !table.forced)
      .map((table) => `table ${schema}.${table.name} has no forced row level security`),
    ...tables
      .filter((table) => !table.tenant_policy)
      .map((table) => `table ${schema}.${table.name} has no policy on app.tenant_id`),
    ...loosePolicies.map(
      (row) => `policy ${row.policy} on ${schema}.${row.table} has an expression without app.tenant_id`,
    ),
    ...openViews.map((view) =>
      view.materialized
        ? `materialized view ${schema}.${view.name} is readable by ${runtimeRole}`
        : `view ${schema}.${view.name} is readable by ${runtimeRole} without security_invoker`,
    ),
    ...(role?.unsafe === true
      ? [`role ${runtimeRole} must be NOLOGIN and NOBYPASSRLS, without SUPERUSER, CREATEDB or CREATEROLE`]
      : []),
    ...(role?.creates === true ? [`role ${runtimeRole} may create objects in schema ${schema}`] : []),
  ];
};

/**
 * Applies one module's migrations with the module's own journal table, then checks its schema.
 * The migrator applies an entry only when it is newer than the newest row of the journal table,
 * so a table shared with the core would skip a module migration older than the core's latest.
 * @throws {ModuleSchemaConventionError} after the migrations committed; fix forward with a new one.
 */
export const applyModuleMigrations = async (sql: PostgresClient, module: ModuleMigrations): Promise<void> => {
  await migrate(drizzle({ client: sql }), {
    migrationsFolder: module.folder,
    migrationsSchema: "migrations",
    migrationsTable: module.journalTable,
  });
  const violations = await findConventionViolations(sql, module);
  if (violations.length > 0) throw new ModuleSchemaConventionError(module.moduleId, violations);
};
