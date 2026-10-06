# 0024. Read-only semantic SQL for agents and fail-closed BigQuery

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/services/src/services/catalog`, `app/packages/agents/src/tools/sql`, Postgres schema `semantic` (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-10 (§8.3); umbrella spec §16.4

## Context

The data agent answers questions over tenant data with SQL written by a model. Model output is untrusted input (`rules/security.md`): it can try other schemas, side effects, sleeps, settings changes or other tenants' rows. `rules/governance.md` ("Custo de IA e de consultas") requires hard caps on query cost.

## Decision

1. Parse with `libpg-query` (PG 18 grammar) and walk the AST with an allowlist of node types: exactly one `SelectStmt` (CTEs allowed), no `INTO`, no locking clause, no DML in CTEs.
2. Every relation must be `semantic.<view>` and in the view registry the principal may read (view → contract → permission). Function calls are limited to an allowlist (aggregates, `date_trunc`, `coalesce`, comparison and string basics); `pg_*`, `set_config`, `current_setting`, `dblink`, `lo_*` and anything unlisted are rejected.
3. Wrap as `SELECT * FROM (<sql>) q LIMIT <n>`, default 100, max 1000.
4. Run in `BEGIN READ ONLY`, `SET LOCAL statement_timeout = '5s'`, `SET LOCAL ROLE semantic_reader`, `set_config('app.tenant_id' | 'app.node_ids', ..., true)`, bound parameters only. Views are owned by `semantic_owner` (no `BYPASSRLS`); base tables use `FORCE ROW LEVEL SECURITY`, so a missing setting returns zero rows.
5. Each query records `SEMANTIC_QUERY_EXECUTED` with the SQL fingerprint; `personal` cells go only to principals with the contract read permission.
6. **BigQuery is fail-closed** (`CONNECTOR_DISABLED`). Design recorded for a later subproject: `<context>_semantic` datasets exposing only table functions taking `tenant_id STRING`; the server injects the tenant; a BigQuery-grammar AST rejects direct table references and tenant literals; `maximumBytesBilled` hard cap from one helper and a dry-run approval threshold at half the cap.

## Consequences

- Isolation holds at three layers: AST allowlist, database role and RLS.
- New views need a registry entry and a migration; the SQL tool never sees base tables.
- The guard needs at least 25 adversarial test cases and must be re-run on each `libpg-query` upgrade.

## Alternatives rejected

- **Regex or keyword blacklist.** Comments, unicode escapes and nested constructs bypass it.
- **Text-to-structured-query DSL instead of SQL.** Loses expressiveness the models handle well and still needs a runner.
- **Trusting a `tenant_id` predicate written by the model.** The tenant comes only from the server setting; literals are neither needed nor trusted.

## Amendments

- **2026-09-30 — catalog tools are fail-closed for contracts without a `permission`.** The
  data catalog tools of spec §8.2 (`catalog.listEntities`, `catalog.describeEntity`,
  `catalog.renderForm`) share this decision's permission model (view → contract →
  permission). A contract whose catalog entry names a `permission` is listed and described
  only to principals holding it. A contract with no `permission` (shared core shapes) is
  listed and described only to principals holding `core.catalog.read`, instead of to every
  member. No catalog answer ever includes a `sensitive` field: the generator drops them, and
  `ai-catalog-reader.ts` drops them again together with their keys in examples; `personal`
  values stay redacted. Visibility uses the effective context permissions (principal ∩ agent
  ceiling), so an agent without `core.catalog.read` in its ceiling sees no shared shape.
