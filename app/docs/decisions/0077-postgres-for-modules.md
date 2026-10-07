# 0077. Modules own Postgres schemas: per-module migrations, the SQL client and a checked convention

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** `app/scripts/db-migrate.ts`, `app/scripts/src/db/{module-migrations,apply-module-migrations}.ts`, `app/migrations.modules.ts`, `app/apps/mastra/src/{modules.ts,runtime/create-runtime-ports.ts}`, `app/apps/web/src/server/runtime-routes.ts`, `app/packages/services/src/services/shared/postgres/postgres-client.ts` (local decision; the framework is unchanged)
- **Refines:** decisions 0015 (module contract), 0019 (module composition in `apps/mastra`), 0023 (Postgres migrations)

## Context

A module's server side received `firestore`, `access` and `audit`, so its data could only live in
Firestore. `pnpm db:migrate` knew one folder, `infra/postgres/migrations`, numbered in one
sequence: a module, or an app derived from this core, that added a migration there took the number
of the core's next migration. The migrator also applies an entry only when its `when` is newer than
the newest row of the journal table, so two folders sharing `migrations.drizzle_migrations` would
silently skip whichever migration is older.

## Decision

1. **A composition file lists the modules with migrations.** `app/migrations.modules.ts` exports
   `MODULE_MIGRATIONS`, entries of `{ moduleId, folder }`, like `catalog.modules.ts`.
   `pnpm db:migrate` loads it by path; no core package imports a module. An absent file or an empty
   list means no module migrations.
2. **Each module has its own folder and journal.** The folder holds `meta/_journal.json` and the
   `.sql` files in the migrator's format; a module writes them by hand or adds its own drizzle-kit
   config. `pnpm db:migrate` applies the core's migrations first, then each listed module's in list
   order, and records them in `migrations.module_<schema>`. The list is validated before the first
   statement runs.
3. **Names follow from the module id.** The schema is the id with `-` as `_`; the runtime role is
   `<schema>_runtime`. An id that maps to a schema the core owns or reserves (`public`,
   `migrations`, `audit`, `archive`, `mastra`, `ai`, `semantic`, `usage`, `agents`), or whose role
   the core already uses (`web`, `knowledge`, `prompts`), is refused.
4. **The convention is checked after each module's migrations.** Every table of the module's schema
   has row level security enabled and forced and a policy on `current_setting('app.tenant_id',
   true)`; the runtime role exists, is `NOLOGIN` and `NOBYPASSRLS`, and may not create objects in
   the schema. `pnpm db:migrate` fails and names each violation. The check runs on every run, so CI
   catches a table added without `FORCE`.
5. **The module's server side receives the SQL client.** `ModuleServerDeps` (`apps/mastra`) and the
   web app's module dependencies carry `sql`, the app's pool, next to `firestore`, `access` and
   `audit`. A module reads and writes only inside `withTenantTransaction`, after
   `SET LOCAL ROLE <schema>_runtime`, as the core's own repositories do. `@core/services` exports
   `PostgresClient` and `PostgresTransaction`, so a module needs no dependency on the driver.
6. **The module's migration grants its role.** As migrations 0007 and 0011 do: the runtime role is
   granted to `mastra_runtime` and `web_runtime` when they exist, and to the migrating role,
   `WITH INHERIT FALSE, SET TRUE`.

## Consequences

- `pnpm test:postgres` runs the `*.postgres.test.ts` suites of every package that defines the
  script, modules included; the turbo task is unchanged.
- A violation is found after the module's migrations committed: they run in one transaction and
  the check comes after it. The fix is a new migration; the next run passes.
- A module's Postgres change and its audit entry share no transaction, because the audit writer
  takes a Firestore transaction. A module that needs both writes to Postgres first and audits after
  the commit (the limitation decision 0039 records for budgets).
- The module's agent side still receives ports only; SQL reaches a workflow or a skill through the
  module's commands.
- An app derived from this core adds its modules to `migrations.modules.ts` and never touches
  `infra/postgres/migrations`.
- The list starts empty. `modules/example` gains a table in this convention in a follow-up change.

## Alternatives rejected

- **One folder for everything, numbered in one sequence.** A derived app's migration takes a number
  the core uses next.
- **One journal table for every folder.** The migrator would skip migrations by timestamp (see
  Context).
- **A `migrations` field in `defineModule()`.** The manifest is data loaded on the client; a folder
  path belongs to the server. Decision 0063 rejected an `endpoints` field for the same reason.
- **A helper that derives the role name and runs `SET LOCAL ROLE`.** The core's repositories each
  hold their role as a constant; the check in `pnpm db:migrate` already ties the name to the module
  id.
- **The convention as documentation only.** A table without `FORCE` looks right in review and is
  open to a superuser login; the check costs three queries per module.
