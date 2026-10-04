import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { agentsSchema } from "../../../shared/postgres/drizzle-schemas.ts";

/**
 * Prompt store tables (SP5 spec §4, decision 0038): source of the Drizzle migrations only;
 * queries go through postgres.js in `postgres-prompt-repository.ts`. Append-only: the runtime
 * role may only insert, and update the eval columns of a version (custom migration). Platform rows
 * (`tenant_id IS NULL`) are visible to every tenant; a tenant's addendum only to that tenant.
 */

const currentTenant = sql`current_setting('app.tenant_id', true)`;

const promptPolicy = (table: string) =>
  pgPolicy(`${table}_tenant_or_platform_rows`, {
    for: "all",
    using: sql`tenant_id IS NULL OR tenant_id = ${currentTenant}`,
    withCheck: sql`tenant_id IS NULL OR tenant_id = ${currentTenant}`,
  });

const scopeChecks = (table: string, columns: { scope: unknown; tenantId: unknown }) => [
  check(`${table}_scope_check`, sql`${columns.scope} IN ('platform', 'tenant')`),
  check(`${table}_scope_tenant_check`, sql`(${columns.scope} = 'tenant') = (${columns.tenantId} IS NOT NULL)`),
];

/** One immutable prompt version per agent, scope and tenant (version = 1, 2, ...). */
export const agentsPromptVersions = agentsSchema
  .table(
    "prompt_versions",
    {
      id: uuid("id").primaryKey().default(sql`uuidv7()`),
      agentId: text("agent_id").notNull(),
      scope: text("scope").notNull(),
      tenantId: text("tenant_id"),
      version: integer("version").notNull(),
      body: text("body").notNull(),
      bodySha256: text("body_sha256").notNull(),
      note: text("note"),
      evalExperimentId: text("eval_experiment_id"),
      evalVerdict: text("eval_verdict"),
      createdBy: text("created_by").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      unique("prompt_versions_agent_scope_tenant_version_key")
        .on(table.agentId, table.scope, table.tenantId, table.version)
        .nullsNotDistinct(),
      ...scopeChecks("prompt_versions", table),
      check("prompt_versions_version_check", sql`${table.version} >= 1`),
      check("prompt_versions_sha_check", sql`${table.bodySha256} ~ '^[0-9a-f]{64}$'`),
      check(
        "prompt_versions_verdict_check",
        sql`${table.evalVerdict} IS NULL OR ${table.evalVerdict} IN ('passed', 'failed')`,
      ),
      promptPolicy("prompt_versions"),
    ],
  )
  .enableRLS();

/** Activations, append-only: the latest row per agent, scope and tenant is the active version. */
export const agentsPromptActivations = agentsSchema
  .table(
    "prompt_activations",
    {
      id: uuid("id").primaryKey().default(sql`uuidv7()`),
      agentId: text("agent_id").notNull(),
      scope: text("scope").notNull(),
      tenantId: text("tenant_id"),
      versionId: uuid("version_id").notNull(),
      forced: boolean("forced").notNull().default(false),
      reason: text("reason"),
      activatedBy: text("activated_by").notNull(),
      activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      foreignKey({
        name: "prompt_activations_version_fk",
        columns: [table.versionId],
        foreignColumns: [agentsPromptVersions.id],
      }).onDelete("restrict"),
      index("prompt_activations_version_idx").on(table.versionId),
      index("prompt_activations_lookup_idx").on(table.agentId, table.scope, table.tenantId, table.activatedAt),
      ...scopeChecks("prompt_activations", table),
      check("prompt_activations_forced_reason_check", sql`NOT ${table.forced} OR ${table.reason} IS NOT NULL`),
      promptPolicy("prompt_activations"),
    ],
  )
  .enableRLS();
