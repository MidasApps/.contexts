# SP3 Tasks 0–3 report

Plan: `docs/plans/2026-09-29-sp3-agentic-runtime.md`. Branch `feat/agentic-app-core-sp0`.
Date 2026-09-29.

## Commits

| Task | Commit | Message |
|---|---|---|
| 0 | `a0c8558` | `docs(agents): record sp3 runtime decisions` |
| 1 | `1f77acc` | `feat(agents): scaffold agents package and ai env` |
| 2 | `5a98518` | `build(services): add drizzle migrations and tenant transactions` |
| 3 | `ae94c35` | `feat(mastra): add explicit storage init for remote environments` |

## Task 0: decisions

11 ADRs, numbers 0019–0029 (0018 was the last taken; checked right before writing).
Each D3 id is in exactly one ADR (`grep -l "D3-NN\b"` per id):

| ADR | Ids |
|---|---|
| 0019 agent runtime layout and request context | D3-01, D3-02, D3-17 |
| 0020 Firebase Mastra auth | D3-03 |
| 0021 model roles and fake mode | D3-04, D3-05 |
| 0022 knowledge base tables and embeddings | D3-06, D3-07, D3-08 |
| 0023 Postgres migrations and Mastra storage init | D3-09, D3-20 |
| 0024 semantic SQL guard | D3-10 |
| 0025 agent command tools and approvals | D3-11 |
| 0026 guardrails, budgets and usage ledger | D3-12, D3-13 |
| 0027 connectors, MCP and web tools | D3-14, D3-15, D3-16 |
| 0028 agent evals gate | D3-18 |
| 0029 agent memory and skills | D3-19, D3-21 |

`app/README.md` lists them.

## Task 1: `@core/agents`, pins, AI env

- `app/packages/agents`: `package.json` (scripts `test`, `test:postgres`, `test:emulators`,
  `evals`, `evals:real`, `lint`, `typecheck`), vitest projects `unit`, `postgres`,
  `emulators`, `evals`, `evals-real` (every project sets `AI_MODE=fake` except
  `evals-real`), `README.md`, `src/index.ts`.
- `src/models/model-roles.ts`: `MODEL_ROLES` (8 roles, env key, fallback key, default,
  modality), `MODEL_ID_PATTERN` (`google|openai|anthropic/<model>`), `parseModelId`.
- `src/runtime/agent-env.schema.ts`: `AgentEnvSchema` (all spec §15 variables; empty
  strings = unset), `findAgentEnvIssues`, `resolveAgentEnv` (throws `InvalidEnvError`):
  fake only in `local|dev`; real needs the provider key of every text and embedding role
  and of configured fallbacks (Google: API key for `ai-studio`, project + location for
  `vertex`); voice keys optional; outside local `MCP_REQUEST_STATE_KEY` ≥ 32 bytes and
  `MASTRA_STORAGE_INIT` defaults to `skip` (`auto` refused); local gets a fixed non-secret
  MCP key.
- `apps/mastra/src/mastra-env.schema.ts` composes `MastraOnlyEnvSchema.extend(AgentEnvSchema.shape)`
  and then `resolveAgentEnv`.
- `.env.example`: agent runtime section; **`AI_MODE=fake` is now the example value** so a
  fresh `cp .env.example .env.local && pnpm dev` works without keys.
- `turbo.json`: `evals` (uncached, passThroughEnv `AI_*`, `DATABASE_URL`) and `evals:real`
  (plus `GOOGLE_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### Version measurements (`npm view`, 2026-09-29 ~21:20 -03)

| Package | Spec | Latest | License | Used |
|---|---|---|---|---|
| @mastra/core | 1.71.0 | **1.72.0** (published 2026-09-30T00:03Z) | Apache-2.0 | kept 1.71.0 |
| mastra | 1.31.3 | **1.31.4** (00:07Z) | Apache-2.0 | kept |
| @mastra/memory | 1.32.1 | 1.33.0 | Apache-2.0 | later task |
| @mastra/rag | 2.6.4 | 2.6.5 | Apache-2.0 | later task |
| @mastra/mcp | 2.1.0 | 2.1.1 | Apache-2.0 | later task |
| @mastra/pg | 1.27.1 | **1.28.0** (23:59Z) | Apache-2.0 | kept |
| @mastra/client-js | 1.50.0 | 1.51.0 | Apache-2.0 | later task |
| @mastra/observability | 1.18.1 | 1.18.2 | Apache-2.0 | kept |
| @mastra/otel-exporter | 1.4.2 | 1.4.3 | Apache-2.0 | later task |
| @mastra/google-cloud-pubsub | 1.1.3 | 1.1.3 | (not printed) | later task |
| ai / @ai-sdk/provider / google / openai / anthropic | 7.0.122 / 4.0.19 / 4.0.85 / 4.0.81 / 4.0.68 | same | Apache-2.0 | later tasks |
| firecrawl | 4.42.0 | 4.42.0 | MIT | later task |
| drizzle-orm | 0.45.3 | 0.45.3 | Apache-2.0 | **pinned** (Task 2) |
| drizzle-kit | 0.31.11 | 0.31.11 | MIT | **pinned** (Task 2) |
| libpg-query | 18.1.5 | 18.1.5 | MIT | later task |
| @apidevtools/swagger-parser | 13.1.0 | 13.1.0 | MIT | later task |
| @google-cloud/bigquery / secret-manager / storage | 9.1.0 / 7.1.1 / 8.2.0 | same | Apache-2.0 | later tasks |
| file-type | 22.1.1 | 22.1.1 | MIT | later task |
| @opentelemetry/exporter-trace-otlp-proto | 0.222.0 | 0.222.0 | Apache-2.0 | later task |
| google-auth-library | (measure) | 11.1.0 | Apache-2.0 | later task |

The whole Mastra train released a new minor less than an hour before measuring. pnpm 12's
`minimumReleaseAge` holds such releases back, and bumping core, CLI and pg is a
workspace-wide change of its own, so the spec pins stay. Later SP3 tasks re-measure.
Only the pins Tasks 1–3 install were added to the catalog (drizzle-orm, drizzle-kit);
the rest land with the task that first uses them.

## Task 2: migrations, Postgres helpers, socket DSN

- `packages/services/drizzle.config.ts` (schemas: `shared/postgres/drizzle-schemas.ts` +
  `*/adapters/driven/drizzle-schema.ts`; out `app/infra/postgres/migrations`; journal
  `migrations.drizzle_migrations`, the schema reserved by `contracts/postgres.md`).
- drizzle-kit refuses to run with no schema file, so `drizzle-schemas.ts` declares the
  app-owned `ai` schema (`aiSchema`, for Task 12). `0000_baseline.sql` was generated and
  then made idempotent: it mirrors `infra/postgres/init/001-schemas.sql` (extension,
  schemas, semantic roles and grants), so remote DBs get the same objects and local
  volumes are unaffected.
- `app/scripts/db-migrate.ts` + `scripts/src/db/migrate-target.ts` (`pnpm db:migrate`,
  root): drizzle `postgres-js` migrator; local needs a loopback/`postgres` host; any other
  `APP_ENV` needs `--confirm-env <APP_ENV>`. Root `db:generate` runs drizzle-kit.
- `shared/postgres/database-url.ts` (`parseDatabaseUrl`, `socketFilePath`),
  `postgres-client.ts` (`buildPostgresConnection`, `createPostgresClient`),
  `with-tenant-transaction.ts` (`withTenantTransaction(sql, { tenantId, nodeIds, readOnly }, fn)`,
  `set_config(..., true)`, `app.node_ids` comma-joined; `TenantContextMissingError`
  before any query). All exported from `@core/services`; `postgres` moved to dependencies.
- `DATABASE_URL`: WHATWG `URL` (so `z.url()` and postgres.js) cannot parse the host-less
  socket form, so the schema uses `parseDatabaseUrl`. Local rejects the socket form;
  remote accepts it only under `/cloudsql/<project:region:instance>` with
  `<dir>/.s.PGSQL.<port>` ≤ 107 chars (108-byte `sun_path` with NUL). postgres.js gets
  the socket as `host`/`port`/`database`/`username` options. Mastra's `pg`
  (`pg-connection-string` 2.14.0) parses the socket DSN natively (checked).
- CI (`.github/workflows/app-ci.yml`): `pnpm db:migrate` with `APP_ENV=local` before
  `pnpm test:postgres`.

## Task 3: Mastra storage init and least privilege

- `buildStorageConfig(env, { init })`: `disableInit = init !== "force" && MASTRA_STORAGE_INIT === "skip"`.
- `apps/mastra/scripts/db-init.ts` (`pnpm -F @core/mastra db:init`): loads `app/.env.local`
  (no override), `loadMastraEnv`, `--confirm-env` outside local
  (`src/storage/storage-init-target.ts`), `storage.init()`, then re-grants DML to
  `mastra_runtime` (default privileges only cover the migrating role), closes the pool.
- Migration `0001_mastra_runtime_role.sql`: `mastra_runtime` NOLOGIN NOBYPASSRLS; USAGE +
  DML on schema `mastra` tables and sequences, default privileges; `REVOKE CREATE ON SCHEMA
  mastra FROM PUBLIC`; no DDL.
- `apps/mastra/README.md`: deploy order `db:migrate` → `db:init` → deploy with
  `MASTRA_STORAGE_INIT=skip`.

## Verification (fresh runs)

```
# Task 0
grep -l "D3-NN\b" app/docs/decisions/*.md  → one file per id, D3-01..D3-21 (table above)

# Task 1
pnpm install                         → Done in 4.5s
pnpm -F @core/agents test            → Test Files 2 passed, Tests 17 passed
pnpm -F @core/agents typecheck lint  → clean
pnpm -F @core/mastra test            → Tests 17 passed (after fixing one fixture)
pnpm lint                            → Tasks: 10 successful, 10 total

# Task 2
pnpm db:migrate (x3)                 → [db:migrate] done; migrations.drizzle_migrations: 1 row
pnpm -F @core/services test          → Test Files 15 passed, Tests 91 passed
pnpm test:postgres                   → @core/services 8 passed (4 new); Tasks 2 successful
pnpm -F @core/scripts test           → Tests 47 passed
typecheck + lint services/scripts/agents/mastra → clean

# Task 3
pnpm db:migrate                      → done (2 journal rows)
AI_MODE=fake pnpm -F @core/mastra db:init  (x2) → "mastra storage ready (APP_ENV=local)", exit 0 both
psql: mastra_runtime rolcanlogin=f rolbypassrls=f; INSERT on 43/43 mastra tables; CREATE on schema = f
pnpm -F @core/mastra test            → Tests 22 passed; typecheck, lint clean
pnpm -F @core/mastra build           → Build successful, exit 0

git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

## Concerns

1. **Local `.env.local` has `AI_MODE=real` and no Google key.** The new rules (spec §5.3,
   decision 0021) make `mastra dev` / `pnpm dev` and `db:init` fail at boot with
   `GOOGLE_GENERATIVE_AI_API_KEY (REQUIRED_IN_REAL_MODE)`. `.env.example` now ships
   `AI_MODE=fake`; the user's `.env.local` was not touched (set `AI_MODE=fake` there, or add
   a key). `db:init` above ran with `AI_MODE=fake` from the shell.
2. **Newer Mastra train** (core 1.72.0, CLI 1.31.4, pg 1.28.0, memory 1.33.0, ...) was
   published minutes before measuring; spec pins kept (release-age window). Re-measure in
   the tasks that add Mastra packages.
3. **Remote role privileges not verified.** `ALTER DEFAULT PRIVILEGES FOR ROLE semantic_owner`
   (baseline) and the `mastra_runtime` grants were only run as the local superuser. On
   Cloud SQL the migrating role must be a member of `semantic_owner` (PG16+ creator grants
   are ADMIN-only by default); check on the first remote migration.
4. **Mastra PgVector (memory recall, Task on memory) creates vector tables/indexes at
   runtime**, which `mastra_runtime` (no CREATE) cannot do. That task must create the
   memory vector index in `db:init` or accept a narrower grant.
5. ADR 0023 says `skip` is "required outside local"; the implementation makes it the
   default there and refuses an explicit `auto`, which matches.
