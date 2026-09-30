# SP3 progress

Plan: docs/plans/2026-09-29-sp3-agentic-runtime.md

- 2026-09-29 Task 0 done: decisions 0019-0029 record D3-01..D3-21 (each id in exactly one ADR); app/README.md lists them.
- 2026-09-29 Task 1 done: @core/agents scaffold (vitest projects unit/postgres/emulators/evals/evals-real), MODEL_ROLES, AgentEnvSchema + resolveAgentEnv composed into the Mastra env; .env.example AI section (AI_MODE=fake default for local); turbo evals tasks. Mastra train 1.72.0 published <1h ago, spec pins kept.
- 2026-09-29 Task 2 done: drizzle-orm/drizzle-kit pins, drizzle.config.ts + baseline migration 0000 (idempotent copy of 001-schemas.sql, journal in schema migrations), pnpm db:migrate (--confirm-env guard), createPostgresClient (Cloud SQL socket DSN -> driver options), withTenantTransaction, DATABASE_URL socket form outside local, CI migrates before test:postgres.
