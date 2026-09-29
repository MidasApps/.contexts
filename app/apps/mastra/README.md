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

## How to test

```bash
pnpm -F mastra test
pnpm -F mastra lint
pnpm -F mastra typecheck
```

## References

- `../../../docs/plans/2026-09-29-sp0-app-foundation/reports/spike-mastra.md`
- `.contexts/engineering/stacks/ai/mastra-sdk.md`
