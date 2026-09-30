# @core/mastra

Mastra server for the agent runtime, with Studio in local dev. Storage is Postgres
(schema `mastra`). SP0 registers no agents or workflows; they arrive in SP3.

## When to use

Configure the Mastra instance (`src/mastra/index.ts`) and its env
(`src/mastra-env.schema.ts`: `MASTRA_HOST`, `PORT`, `LOG_LEVEL`,
`MASTRA_SERVER_TIMEOUT_MS`, `MASTRA_CORS_ORIGINS`).

## How to run

From `app/`, `pnpm dev` starts it with the rest of the stack (Postgres must be up). Alone:

```bash
pnpm -F mastra dev           # mastra dev with app/.env.local; Studio at http://localhost:4111
curl -s localhost:4111/health  # {"success":true}
pnpm -F mastra build         # .mastra/output (no Studio)
docker build -f apps/mastra/Dockerfile -t core-mastra .   # from app/
```

## Storage and deploy order

Mastra's tables live in schema `mastra`. In `local`, `MASTRA_STORAGE_INIT`
defaults to `auto` and `PostgresStore` creates them on first use. Outside local it
is `skip` (`auto` is refused): the server never runs DDL, and the runtime login
role only gets `mastra_runtime` (DML on schema `mastra`, migration
`infra/postgres/migrations/0001_mastra_runtime_role.sql`). Deploy order
(decision 0023):

```bash
pnpm db:migrate --confirm-env <APP_ENV>                 # from app/, DDL-capable role
pnpm -F @core/mastra db:init --confirm-env <APP_ENV>    # same role: storage.init() + grants, then exits
# deploy the image with MASTRA_STORAGE_INIT=skip
```

Both steps are idempotent; locally they run without `--confirm-env`
(`pnpm db:migrate && pnpm -F @core/mastra db:init`). `db:init` loads
`app/.env.local` like `mastra dev` but reads only the services env
(`APP_ENV`, `DATABASE_URL` and the Firebase project); no AI or MCP keys are needed.

## How to test

```bash
pnpm -F mastra test
pnpm -F mastra lint
pnpm -F mastra typecheck
```

## References

- `../../../docs/plans/2026-09-29-sp0-app-foundation/reports/spike-mastra.md`
- `.contexts/engineering/stacks/ai/mastra-sdk.md`
