# 0023. Postgres migrations, Mastra storage init, Cloud SQL socket DSN and build output check

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/infra/postgres/migrations`, `app/scripts/db-migrate.ts`, `app/packages/services` (env, Postgres helpers), `app/apps/mastra` (storage init, build) (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-09, D3-20 (§11, §17); resolves SP0 follow-ups #1, #2 and #3

## Context

SP0 created schemas with a local-only init script (`infra/postgres/init/001-schemas.sql`); remote databases need versioned migrations. `rules/migration.md` §2 forbids migrations at boot, yet `PostgresStore` creates and alters 43 `mastra_*` tables on first use, so the runtime user needs DDL (follow-up #1). `DATABASE_URL` rejected the host-less Cloud SQL socket form used by Cloud Run (follow-up #3). `mastra build` runs a nested `pnpm install` that bypasses the workspace lockfile (follow-up #2).

## Decision

1. **D3-09 — Migrations.** Drizzle ORM + drizzle-kit (`stacks/database/postgres.md`). SQL migrations are generated or hand-written into `app/infra/postgres/migrations` and committed; `pnpm db:migrate` (`scripts/db-migrate.ts`, `drizzle-orm/postgres-js/migrator`) applies them as an explicit pipeline step, with the journal in schema `migrations` (`contracts/postgres.md` "Versionamento de schema"). The script refuses a non-local `APP_ENV` unless `--confirm-env <env>` names it. Migrations stay idempotent (`IF NOT EXISTS`, guarded `DO` blocks) so they also run on a database bootstrapped by the init script.
2. **D3-09 — Mastra storage.** `MASTRA_STORAGE_INIT` (`auto` | `skip`, default `auto`, `skip` required outside `local`) sets `PostgresStore({ disableInit })`. `pnpm -F @core/mastra db:init` builds the store with init on, calls `storage.init()` and exits; deploy runs it with a DDL-capable role after `db:migrate`. A migration creates the role `mastra_runtime` (NOLOGIN) with USAGE on schema `mastra` and DML on its tables (plus default privileges), and no DDL; the service account's login role is granted `mastra_runtime`.
3. **D3-20 — Socket DSN.** Outside `local`, `DATABASE_URL` also accepts `postgresql://user@/db?host=/cloudsql/<project:region:instance>`; the `host` socket directory is limited to 108 characters (the unix `sun_path` size). `local` keeps requiring a loopback or `postgres` host.
4. **D3-20 — Build output check.** `scripts/check-mastra-output.ts` fails the Mastra build when `.mastra/output/package.json` resolves a version different from the workspace lockfile for any shared dependency, and runs `pnpm audit --prod` there (SP3 Task 23).

## Consequences

- The runtime role of the Mastra service needs no DDL; a Mastra upgrade that adds tables requires running `db:init` before the deploy.
- Deploy order: `pnpm db:migrate` → `pnpm -F @core/mastra db:init` → deploy with `MASTRA_STORAGE_INIT=skip`.
- `001-schemas.sql` stays for fresh local volumes; later objects come only from migrations.

## Alternatives rejected

- **Let `PostgresStore` auto-init everywhere.** Violates `rules/migration.md` §2 and needs a DDL-capable runtime user.
- **Atlas, Sqitch or node-pg-migrate.** Legitimate, but Drizzle is the framework default and also gives typed table definitions.
- **Cloud SQL Node connector instead of the socket DSN.** Adds a dependency and a second connection path; Cloud Run already mounts the socket.
- **Vendoring the Mastra output dependencies from the pnpm store.** Fights the deployer's output layout on every Mastra upgrade; a pin check plus audit catches drift with less machinery.

## Amendments

- **2026-09-30 — build output check and event bus (SP3 Task 25, follow-up #2).**
  - *Build.* `pnpm -F @core/mastra build` = copy agent assets → `mastra build` →
    `scripts/check-mastra-output.ts`, which (0) copies the workspace `overrides` into
    `.mastra/output/pnpm-workspace.yaml` and installs the output again when that changed (the
    deployer's nested install ignores workspace overrides); (1) compares the output lockfile
    with `pnpm-lock.yaml` and fails when a package both contain resolves in the output to a
    version the workspace lockfile does not have (direct and transitive; the workspace
    tarballs are skipped); (2) runs `pnpm audit --prod --audit-level high` in the output
    (`--no-audit` skips it for offline runs). The Dockerfile build stage and the CI job
    `mastra-build` run the same script.
  - *First finding.* The audit failed on the first run: `firecrawl` 4.42.1 (latest) pins
    `axios` 1.18.0, with 7 high advisories fixed in 1.20.0. The workspace override
    `"firecrawl>axios": 1.20.0` fixes both trees; step (0) exists because the output did not
    receive it otherwise (the pin check then reported the drift).
  - *Event bus.* `MASTRA_PUBSUB` defaults to `memory` in `local` and `gcp` elsewhere.
    `memory` is Mastra's `EventEmitterPubSub`; `gcp` is `GoogleCloudPubSub({ projectId:
    FIREBASE_PROJECT_ID })` from `@mastra/google-cloud-pubsub` 1.1.3 (Apache-2.0; it brings
    `@google-cloud/pubsub` 5 and `inngest`), imported lazily so local runs never load it.
    Credentials come from ADC; the runtime service account needs Pub/Sub publisher and
    subscriber on its topics and subscriptions (named by the adapter).
