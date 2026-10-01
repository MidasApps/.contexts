# @core/mastra

Mastra server for the agent runtime, with Studio in local dev. Storage is Postgres
(schema `mastra`). `src/mastra/index.ts` spreads the parts of `composeAgentRuntime`
(`@core/agents`) into `new Mastra({...})`; `src/runtime/create-runtime-ports.ts` binds the
SP1/SP3 services and `src/modules.ts` lists the agent modules (decision 0019).

## Runtime and access

- Every `/api/*` request goes through the route allowlist (other built-in routes answer 404)
  and the context middleware, which builds the typed `AgentRequestContext` from the
  principal `FirebaseMastraAuth` verified (Bearer only). Client-sent context keys are dropped.
- Access decisions are SP1's (`verifyBearer`, `authorize`, `getEffectivePermissions`,
  `resolveAccessContext` for permissions and regional settings at the node); a caller
  without a membership or without `core.chat.use` gets 403.
- Ports bound in `src/runtime/create-runtime-ports.ts`: access, audit (Firestore
  `audit-logs`), approvals (SP1 approval requests, kind `agent-command`), commands
  (at-most-once per `runId:toolCallId`), semantic SQL (Postgres; no semantic view is
  registered yet, so `sql.querySemanticSql` refuses every view until a module adds one),
  knowledge, files, usage, projects, connectors, secrets and web content. Only agent
  settings is still a fail-closed stand-in (`src/runtime/unwired-ports.ts`, SP5): tenants
  get the default subagents (`knowledge`, `data`, `action`; `web` off).
- Agents: `assistant` (supervisor over the knowledge, data, action and web subagents;
  the supervisor owns the conversation memory; a run without `X-Conversation-Id` gets a new
  conversation, returned in that header) and `ping`
  (health check on the fast model role). Try them with `POST /api/agents/<id>/generate`
  + `Authorization: Bearer <ID token>` + `X-Tenant-Id`. `pnpm build` copies the agent
  instructions and skills of `@core/agents` into `src/mastra/public/`.

## Adding agents, tools, skills and commands

Modules plug in through `defineAgentModule(...)` values listed in `src/modules.ts`
(`APP_MODULES`); the core never imports a module. The recipe and the rules per capability
(tool, command, agent, skill, workflow, connector) are in
`../../packages/agents/README.md`. After adding one, run `pnpm build` (copies instructions
and skills into `src/mastra/public/`) and the module's eval set.

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
pnpm -F @core/mastra db:init --confirm-env <APP_ENV>    # same role: storage.init(), memory vector index, grants, then exits
# deploy the image with MASTRA_STORAGE_INIT=skip
```

The knowledge base (`ai.documents`, `ai.chunks_v1`, decision 0022) is reached only as
`knowledge_runtime` (row level security); `mastra_runtime` (0004) and `web_runtime`
(0005, grant it to the web service's database user) may `SET ROLE` to it. Mastra
serves the `knowledge-ingest` and `catalog-reindex` workflows; `catalog-reindex`
refuses HTTP runs and is run in-process (`pnpm seed:local`, deploy scripts).
`FILES_BUCKET` (required outside local) is the bucket ingestion reads uploads from.

Agent memory (decision 0029) keeps threads, messages and working memory in schema `mastra`
and message vectors in the `PgVector` index `memory_messages` (1536 dimensions, same schema).
`db:init` creates that index, because the runtime role cannot; with `MASTRA_STORAGE_INIT=skip`
the vector store never runs DDL. Memory is scoped to the resource `tenantId:uid` (set by the
context middleware), so one person in two organizations has two memories; a request that
names a thread of another resource gets 403 before the run.

The usage ledger (`usage.llm_calls`, `usage.tenant_budgets`, view `usage.tenant_month_spend`,
decision 0026) is reached only as `usage_runtime` (0007; row level security, append-only
ledger); `mastra_runtime` and `web_runtime` may `SET ROLE` to it. Every model call becomes a
ledger row through the `usage-ledger` exporter, and every agent run is checked against the
tenant's monthly caps first (tenant budget guard, fail-closed). `USAGE_SINK=bigquery` exports
to `<BIGQUERY_DATASET_AI_OBSERVABILITY>.llm_calls` from SP5's usage report workflow.

Both steps are idempotent; locally they run without `--confirm-env`
(`pnpm db:migrate && pnpm -F @core/mastra db:init`). `db:init` loads
`app/.env.local` like `mastra dev` but reads only the services env
(`APP_ENV`, `DATABASE_URL` and the Firebase project); no AI or MCP keys are needed.

## How to test

```bash
pnpm -F mastra test                        # unit
pnpm test:emulators                        # from app/: runtime, chat routes and the SP3 gate suite
                                           # (sp3-gate.emulator.test.ts also needs Postgres + pnpm db:migrate)
pnpm -F mastra lint
pnpm -F mastra typecheck
```

## References

- `../../../docs/plans/2026-09-29-sp0-app-foundation/reports/spike-mastra.md`
- `.contexts/engineering/stacks/ai/mastra-sdk.md`
