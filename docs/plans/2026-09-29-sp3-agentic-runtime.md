# SP3 — Agentic runtime (Mastra): implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. Subagent-per-task with the
> templates in `.claude/skills/writing-plans-ddc/` (implementer + task-reviewer). Read
> `docs/plans/execution-constraints.md` first: **`.contexts/` and `.claude/` are read-only**
> (never edit, create or delete anything there, including `.claude/agent-memory/progress.md`).
> Progress goes to `docs/plans/2026-09-29-sp3-agentic-runtime/progress.md`; reports to
> `docs/plans/2026-09-29-sp3-agentic-runtime/reports/task-<N>.md`.

**Goal:** the agent runtime of the core: supervisor + subagents, skills, tools (catalog,
semantic SQL, contract commands, knowledge, web), memory, knowledge base, connectors (DB,
OpenAPI, MCP client) and core MCP server, guardrails, usage/cost ledger, tracing and an eval
gate, all runnable offline with `AI_MODE=fake`.

**Architecture:** new package `@core/agents` (registries, tools, agents, processors,
scorers, fake models), new/extended `@core/services` contexts (`knowledge`, `files`,
`catalog`, `connectors`, `usage`, `agents`), `apps/mastra` composes everything; `/v1` calls
the private Mastra through `MastraGateway`. Design and every decision:
`docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md` (below "spec"); umbrella
`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §5, §7, §10, §16.

**Tech Stack:** pins of `@.contexts/engineering/MEMORY.md` plus measurements in spec §2
(2026-09-29): Node 26.10.0, pnpm 12.6.0, TypeScript 7.0.2, Zod 4.6.5, Vitest 5.0.2,
Playwright 1.63.0, `@mastra/core` 1.71.0, `mastra` 1.31.3, `@mastra/memory` 1.32.1,
`@mastra/rag` 2.6.4, `@mastra/mcp` 2.1.0, `@mastra/pg` 1.27.1, `@mastra/client-js` 1.50.0,
`@mastra/observability` 1.18.1, `@mastra/otel-exporter` 1.4.2, `@mastra/google-cloud-pubsub`
1.1.3, `ai` 7.0.122, `@ai-sdk/provider` 4.0.19, `@ai-sdk/google` 4.0.85, `@ai-sdk/openai`
4.0.81, `@ai-sdk/anthropic` 4.0.68, `firecrawl` 4.42.0, `drizzle-orm` 0.45.3, `drizzle-kit`
0.31.11, `libpg-query` 18.1.5, `@apidevtools/swagger-parser` 13.1.0, `@google-cloud/bigquery`
9.1.0, `@google-cloud/secret-manager` 7.1.1, `@google-cloud/storage` 8.2.0, `file-type`
22.1.1, `@opentelemetry/exporter-trace-otlp-proto` 0.222.0, `google-auth-library` (measure).

## Global Constraints

- Framework read-only; every task's Verify ends with
  `git diff --quiet main -- .contexts .claude && echo framework-ok`.
- Every Bash command starts with `export PATH="/c/Users/gsoar/AppData/Local/node-v26.10.0-win-x64:$PATH"`.
  Postgres: `cd app && docker compose --env-file .env.local up -d --wait`. Never kill a process
  you did not start; port 3000 belongs to another project (use `WEB_PORT=3100`).
- Before adding a dependency: `npm view <pkg> version` (re-measure; if newer than the spec,
  use the newer stable unless it breaks a peer, then report), license check (MIT/Apache/BSD/ISC),
  exact pin in `app/pnpm-workspace.yaml` `catalog:`; `allowBuilds` entry with a reason when
  pnpm asks. `@mastra/evals`, `@mastra/auth-firebase`, `@mastra/editor`,
  `@mastra/agent-browser` are **not** added.
- `AI_MODE=fake` for every test; no test calls a real provider. Real-mode commands are
  opt-in and skip cleanly without keys.
- Rules: `@.contexts/engineering/rules/{security,validation,error-handling,observability,testing,governance,data-modeling,migration,api-design}.md`;
  contracts `@.contexts/engineering/contracts/{api,schemas,events,postgres,pgvector,bigquery,secrets}.md`.
  Handlers: auth → validate → authorize → act; envelope `api.md` §6; `/v1` Bearer only.
- Tenancy: every Postgres row carries `tenant_id text` (spec D3-08) with RLS; every
  Firestore doc `tenantId`; tenant never comes from model output or client body.
- Files ≤ 500 lines, functions ≤ 50, named exports, tests colocated (`*.test.ts`,
  `*.postgres.test.ts`, `*.emulator.test.ts`, `*.eval.test.ts`).
- SP1/SP2 interfaces (umbrella §4/§6) are consumed only through ports in
  `packages/agents/src/runtime/runtime-ports.ts` and bound in
  `apps/mastra/src/runtime/create-runtime-ports.ts`. If an SP1 export has a different name,
  adapt the binding (never duplicate SP1 logic) and note it in the report.
- Commits: Conventional; scopes `agents`, `mastra`, `knowledge`, `files`, `catalog`,
  `connectors`, `usage`, `contracts`, `services`, `web`, `functions`, `workspace`, `ci`;
  trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage only own paths.

---

### Task 0: Record SP3 decisions

**Contexts:** spec §16, §17; `app/docs/decisions/0005-contract-pii-semantics.md` (format);
`@.contexts/engineering/rules/governance.md` (ADRs)

**Files:**
- Create: `app/docs/decisions/NNNN-<slug>.md` for D3-01…D3-21 (next free numbers; group
  closely related ids into one ADR when natural, max 12 files), each short MADR (Status
  accepted, Date, Scope, Context, Decision, Consequences, Alternatives rejected)
- Modify: `app/README.md` (link list of decisions if README lists them)

- [ ] Step 1: Read contexts; `ls app/docs/decisions` to find the next number
- [ ] Step 2: Write the ADRs from spec §16 (content, not new decisions)
- [ ] Step 3: Progress + commit `docs(agents): record sp3 runtime decisions`

**Verify:** each D3-xx id appears in exactly one ADR (`grep -l "D3-" app/docs/decisions/*.md`); `framework-ok`.

### Task 1: Scaffold `@core/agents`, dependency pins and AI env

**Contexts:** spec §3.1, §5, §15; `@.contexts/engineering/stacks/ai/mastra-sdk.md`;
`@.contexts/engineering/contracts/secrets.md` §5.4; `app/apps/mastra/src/mastra-env.schema.ts`

**Files:**
- Create: `app/packages/agents/{package.json,tsconfig.json,eslint.config.js,vitest.config.ts,README.md}`, `src/index.ts`
  (vitest projects `unit`, `postgres`, `emulators`, `evals`; scripts `test`, `test:postgres`,
  `test:emulators`, `evals`, `evals:real`, `lint`, `typecheck`)
- Create: `app/packages/agents/src/models/model-roles.ts`, `src/runtime/agent-env.schema.ts`
  (`AgentEnvSchema`: `AI_MODEL_*` (+`_FALLBACK`) with defaults of spec §5.1, `GOOGLE_AI_BACKEND`,
  provider keys optional, `FIRECRAWL_*`, `AI_MEMORY_OBSERVATIONAL`, `AI_KB_RERANK`,
  `MCP_REQUEST_STATE_KEY` (≥ 32 bytes outside local; local default derived constant),
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `MASTRA_PUBSUB`, `MASTRA_STORAGE_INIT`, `USAGE_SINK`)
- Modify: `app/apps/mastra/src/mastra-env.schema.ts` (compose `AgentEnvSchema`; refine:
  `AI_MODE=fake` only in `local|dev`; `real` requires the key of each text role's provider)
- Modify: `app/pnpm-workspace.yaml` (catalog pins listed in Tech Stack that this SP uses), `app/.env.example`, `app/turbo.json` (`evals` task, uncached, passThroughEnv `AI_*`, `DATABASE_URL`)
- Test: `agent-env.schema.test.ts` (defaults; fake refused in staging/prod; real without
  `GOOGLE_GENERATIVE_AI_API_KEY` for ai-studio fails naming the key; voice keys optional)

**Interfaces:** Produces `AgentEnvSchema`, `AgentEnv`, `MODEL_ROLES`.

- [ ] Step 1: Read contexts; measure versions (`npm view`) and record them in the report
- [ ] Step 2: Failing env tests → Step 3: FAIL → Step 4: implement → Step 5: PASS + `pnpm -F @core/agents typecheck lint`
- [ ] Step 6: Progress → Step 7: commit `feat(agents): scaffold agents package and ai env`

**Verify:** `cd app && pnpm install && pnpm -F @core/agents test && pnpm -F @core/mastra test && pnpm lint` green; `framework-ok`.

### Task 2: Postgres migrations (Drizzle) and Cloud SQL socket DSN

**Contexts:** spec §11, D3-09, §17 (#3); `@.contexts/engineering/stacks/database/postgres.md`;
`@.contexts/engineering/contracts/postgres.md`; `@.contexts/engineering/rules/migration.md`;
`app/infra/postgres/init/001-schemas.sql`; `app/packages/services/src/services/shared/env/services-env.schema.ts`

**Files:**
- Create: `app/packages/services/drizzle.config.ts`, `app/infra/postgres/migrations/` (drizzle-kit output, SQL committed),
  `app/scripts/db-migrate.ts` (applies migrations with `drizzle-orm/postgres-js/migrator`; refuses non-local unless `--confirm-env`)
- Create: `app/packages/services/src/services/shared/postgres/{postgres-client.ts,with-tenant-transaction.ts}`
  (`withTenantTransaction(sql, { tenantId, nodeIds, readOnly }, fn)` sets `app.tenant_id`/`app.node_ids` with `set_config(..., true)`)
- Modify: `services-env.schema.ts` (accept `postgresql://user@/db?host=/cloudsql/<project:region:instance>` outside local; socket path ≤ 108 chars)
- Modify: `app/package.json` (`db:migrate`, `db:generate`), `.github/workflows/app-ci.yml` (run `pnpm db:migrate` before `test:postgres`)
- Test: `with-tenant-transaction.postgres.test.ts` (setting visible inside, gone after commit; missing tenant → throws), `services-env.schema.test.ts` (socket DSN accepted in prod, rejected in local; long path rejected)

**Interfaces:** Produces `withTenantTransaction`, `createPostgresClient(env)`, migration command used by every later Postgres task.

- [ ] Steps: read → failing tests → implement → `pnpm db:migrate` (empty migration baseline) → PASS → progress → commit `build(services): add drizzle migrations and tenant transactions`

**Verify:** `cd app && pnpm db:migrate && pnpm -F @core/services test && pnpm test:postgres` green; `framework-ok`.

### Task 3: Mastra storage init outside local and least-privilege role (follow-up #1)

**Contexts:** spec §17; `docs/plans/2026-09-29-sp0-app-foundation/reports/spike-mastra.md` (storage);
`app/apps/mastra/src/mastra/mastra-options.ts`

**Files:**
- Modify: `app/apps/mastra/src/mastra/mastra-options.ts` (`buildStorageConfig`: `disableInit: env.MASTRA_STORAGE_INIT === 'skip'`)
- Create: `app/apps/mastra/scripts/db-init.ts` (`pnpm -F @core/mastra db:init`: builds the store with init enabled, calls `storage.init()`, exits)
- Create: migration `app/infra/postgres/migrations/<n>_mastra_runtime_role.sql` (role `mastra_runtime` NOLOGIN: USAGE on schema `mastra`, DML on its tables + default privileges; no DDL; `GRANT semantic_reader TO` the app runtime role is done in Task 12)
- Modify: `app/apps/mastra/README.md` (deploy order: `db:migrate` → `db:init` → deploy with `MASTRA_STORAGE_INIT=skip`)
- Test: `mastra-options.test.ts` (skip → `disableInit: true`; default local → auto)

- [ ] Steps: read → failing test → implement → run `db:init` locally twice (idempotent) → PASS → progress → commit `feat(mastra): add explicit storage init for remote environments`

**Verify:** `pnpm -F @core/mastra test && pnpm -F @core/mastra db:init` twice exit 0; `framework-ok`.

### Task 4: Agent contracts in `@core/contracts`

**Contexts:** spec §4.3, §8, §9, §11, §12; `@.contexts/engineering/contracts/schemas.md`;
`app/docs/decisions/0005-contract-pii-semantics.md`; `app/packages/contracts/src/contracts/example/note.schema.ts` (meta style)

**Files:**
- Create in `app/packages/contracts/src/contracts/agents/`: `forwarded-headers.ts` (`FORWARDED_HEADERS`
  const), `agent-request-context.schema.ts` (`agents.AgentRequestContext`), `agent-settings.schema.ts`
  (`agents.AgentSettings`: `tenantId`, `enabledAgents`, `webTools { firecrawl, browser }`,
  `guardrails { pii: 'warn'|'redact' }`, `budget { monthlyMicroUsd, monthlyTokens }`), `tool-ui.schema.ts`
  (`agents.ToolUi` `{ component, props }`), `approval-request.schema.ts` (`agents.ApprovalRequest`, used by SP5)
- Create in `.../knowledge/`: `knowledge-document.schema.ts`, `knowledge-source.schema.ts` (command: `file` | `url`), `citation.schema.ts`
- Create in `.../connectors/`: `connector.schema.ts` (discriminated by `type`; no secret fields), `connector-tool-policy.schema.ts`
- Create in `.../usage/`: `llm-call.schema.ts` (view kind, `costMicroUsd` bigint as integer), `usage-summary.schema.ts`
- Create in `.../files/`: `file-upload-request.schema.ts`, `stored-file.schema.ts`
- Modify: `src/composition.ts`, `src/index.ts`; run `pnpm contracts:catalog`
- Test: one `*.schema.test.ts` per folder (valid example parses; tenant id branded; strict objects reject extra keys)

**Interfaces:** Produces the contracts named above (used by services, agents, client).

- [ ] Steps: read → failing tests → schemas with full meta → `pnpm contracts:catalog` → PASS + `pnpm contracts:check` → progress → commit `feat(contracts): add agent, knowledge, connector, usage and file contracts`

**Verify:** `pnpm -F @core/contracts test && pnpm contracts:check`; `framework-ok`.

### Task 5: Model factory, price table and fake models

**Contexts:** spec §5; `@.contexts/engineering/stacks/ai/{vercel-ai-sdk,gemini,openai}.md`;
`@.contexts/engineering/rules/testing.md` §14

**Files:**
- Create: `app/packages/agents/src/models/{model-factory.ts,model-prices.ts,provider-registry.ts}`
  (`createModelProvider(env)` → `{ language(role), embedding(), transcription(), speech() }`; real = AI SDK providers built with keys from env; Vertex vs AI Studio by `GOOGLE_AI_BACKEND`; `providerOptions.google.outputDimensionality = 1536` for embeddings; prices: `{ modelId: { inputMicroUsdPerMTok, outputMicroUsdPerMTok } }` + `PRICES_VERIFIED_AT`, fill from provider pricing pages at implementation time or leave the entry absent)
- Create: `src/models/fake/{fake-language-model.ts,fake-scenarios.ts,fake-embedding-model.ts,fake-voice-models.ts}` (spec §5.3: directives `[[fake:<scenario> <json>]]`, keyword rules registry, deterministic usage, `[[fake:slow]]` delay option, detector verdict fakes)
- Test: `fake-language-model.test.ts` (same prompt → same stream parts; directive `tool-call` emits a tool call with given args; `finish` carries usage), `fake-embedding-model.test.ts` (dimension 1536, unit norm, cosine(similar) > cosine(unrelated)), `model-factory.test.ts` (fake mode never constructs real providers; real mode builds provider with the env key)

**Interfaces:** Produces `createModelProvider(env)`, `registerFakeScenario(agentId, rule)`, `estimateCostMicroUsd(model, usage)`.

- [ ] Steps: read → failing tests → implement (verify the `LanguageModelV4` stream part types in `@ai-sdk/provider` d.ts before writing) → PASS → progress → commit `feat(agents): add model roles, price table and deterministic fake models`

**Verify:** `pnpm -F @core/agents test -- models`; `framework-ok`.

### Task 6: `FirebaseMastraAuth` (follow-up #12 a, b, c, e)

**Contexts:** spec §4.2; `docs/plans/2026-09-29-sp0-app-foundation/reports/sp0-summary.md` §1;
`@.contexts/engineering/rules/security.md`; SP1 access context exports (`grep -rn "export" app/packages/services/src/services/access`)

**Files:**
- Create: `app/packages/agents/src/auth/{firebase-mastra-auth.ts,bearer-only.ts,agent-principal.ts}`
- Create: `app/packages/agents/src/runtime/runtime-ports.ts` (`AccessPort { resolvePrincipal, authorize, verifyApiKey }`, `AuditPort`, `ApprovalPort`, `UsagePort`, `KnowledgePort`, `ConnectorsPort`, `SecretStore`, `SettingsPort`) and `src/testing/fake-ports.ts`
- Test: `firebase-mastra-auth.test.ts` with a fake verifier: `?apiKey=` without header → null (401); header Bearer → principal; GET uses `checkRevoked=false`, POST `true`; member without `agents.chat.use` → `authorizeUser` false; `mapUserToResourceId` set via `super()` returns `tenantId:uid` (instance property check); `sk_` token routed to `verifyApiKey`
- Test: `app/packages/services/src/services/shared/env/services-env.schema.test.ts` (add case: `FIREBASE_AUTH_EMULATOR_HOST` with `APP_ENV=prod` rejected — 12c regression)
- Test: `firebase-mastra-auth.emulator.test.ts` (Auth Emulator user + fake membership port: 200/401/403 through a Mastra `createNodeServer` like the SP0 probe, but with the committed provider)

- [ ] Steps: read → failing tests → implement → PASS (unit + `pnpm test:emulators`) → progress → commit `feat(agents): add firebase mastra auth provider`

**Verify:** `pnpm -F @core/agents test && pnpm test:emulators`; `framework-ok`.

### Task 7: Request context middleware, route allowlist and runtime composition

**Contexts:** spec §3.3, §4.3; `app/apps/mastra/src/mastra/index.ts`; spike-mastra.md (build gotcha)

**Files:**
- Create: `app/packages/agents/src/context/agent-request-context.ts`, `src/auth/{context-middleware.ts,route-allowlist-middleware.ts}`
- Create: `app/packages/agents/src/runtime/{agent-module.ts,compose-agent-runtime.ts}` (returns `{ agents, workflows, scorers, mcpServers, storage, vectors, observability, pubsub, auth, middleware, apiRoutes }`; initially one `ping` agent on the fake model)
- Create: `app/apps/mastra/src/runtime/create-runtime-ports.ts` (binds SP1 use cases), `app/apps/mastra/src/modules.ts` (`APP_MODULES` from module manifests)
- Modify: `app/apps/mastra/src/mastra/index.ts` (literal `server:` property; spread runtime parts)
- Test: `context-middleware.test.ts` (client-sent `tenantId` overwritten; `MASTRA_RESOURCE_ID_KEY` = `tenantId:uid`; missing principal → 401 path untouched), `route-allowlist-middleware.test.ts` (`/api/vectors/x` → 404; `/api/agents/x/stream` passes)
- Test: `apps/mastra/src/mastra/runtime.emulator.test.ts` (boot built server; `POST /api/agents/ping/generate` with emulator token + `X-Tenant-Id` → 200 and span stored with `tenantId` metadata)

**Interfaces:** Produces `composeAgentRuntime`, `defineAgentModule`, `readAgentContext`.

- [ ] Steps: read → failing tests → implement → `pnpm -F @core/mastra build` (build still extracts `server`) → PASS → progress → commit `feat(mastra): compose agent runtime with typed request context`

**Verify:** `pnpm -F @core/agents test && pnpm -F @core/mastra build && pnpm test:emulators`; `framework-ok`.

### Task 8: `MastraGateway` (`/v1` → Mastra) and error mapping (12d)

**Contexts:** spec §4.1; `@.contexts/engineering/contracts/api.md` §6, §7, §14; `app/packages/services/src/services/shared/http/*`

**Files:**
- Create: `app/packages/services/src/services/agents/adapters/driven/{mastra-gateway.ts,mastra-error-mapper.ts,serverless-id-token.ts}`
  (`@mastra/client-js` for JSON calls; `fetch` passthrough for streams with `AbortSignal`; headers from `FORWARDED_HEADERS`; `X-Serverless-Authorization` via `google-auth-library` only outside local)
- Create: `.../agents/application/ports/agent-runtime-gateway.ts` (port used by later use cases)
- Modify: `app/apps/web/src/env.ts` schema (`MASTRA_URL`, `MASTRA_AUDIENCE` required outside local)
- Test: `mastra-gateway.test.ts` (against a local Node `http` stub server: headers forwarded, client `requestContext` stripped, 401/403/404/500/timeout mapped to envelope codes, body never passed through, abort propagates)

**Interfaces:** Produces `AgentRuntimeGateway` port (`generate`, `stream`, `approveToolCall`, `declineToolCall`, `startWorkflow`, `resumeWorkflow`, `streamWorkflow`, `listThreadMessages`, `deleteThread`, `callMcp`).

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(services): add mastra gateway for v1`

**Verify:** `pnpm -F @core/services test -- mastra-gateway`; `framework-ok`.

### Task 9: `defineCoreTool` and tool registry

**Contexts:** spec §8.1; `@.contexts/engineering/stacks/ai/harness-engineering.md` (tool layer);
`@.contexts/engineering/rules/{security,error-handling,observability}.md`

**Files:**
- Create: `app/packages/agents/src/tools/{define-core-tool.ts,tool-registry.ts,tool-errors.ts}`
- Test: `define-core-tool.test.ts` with fake ports: input non-strict key rejected; missing context key → `CONTEXT_MISSING` (no execute); `authorize` deny → `FORBIDDEN` (no execute); mutation → `requireApproval: true`; permission with `requiresApproval` → `ApprovalPort.requestApproval` called and fake adapter `unavailable` → `APPROVAL_UNAVAILABLE`; audit recorded for mutation with input hash (no raw input); timeout → `TOOL_TIMEOUT`; output schema violation → `TOOL_OUTPUT_INVALID`

**Interfaces:** Produces `defineCoreTool`, `CoreToolDefinition`, `createToolRegistry`.

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add core tool wrapper with authorize, approval and audit`

**Verify:** `pnpm -F @core/agents test -- tools`; `framework-ok`.

### Task 10: Catalog tools (`listEntities`, `describeEntity`, `renderForm`)

**Contexts:** spec §8.2; umbrella §5, §16.4; `app/docs/decisions/0005-contract-pii-semantics.md`; `app/docs/catalog/catalog.ai.json`

**Files:**
- Create: `app/packages/agents/src/tools/catalog/{ai-catalog-reader.ts,list-entities.tool.ts,describe-entity.tool.ts,render-form.tool.ts}`
- Modify: `app/packages/agents/package.json` (bundle `catalog.ai.json` via JSON import with `with { type: 'json' }`)
- Test: tests with a fixture catalog: contract hidden without permission; `personal` field listed with redacted examples; `renderForm` rejects unknown `commandId` or mismatched contract; `initialValues` stripped of unknown keys; output validates against `agents.ToolUi`

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add data catalog tools`

**Verify:** `pnpm -F @core/agents test -- catalog`; `framework-ok`.

### Task 11: `catalog` context — semantic view registry and read-only runner

**Contexts:** spec §8.3, D3-10; umbrella §16.4; `app/infra/postgres/init/001-schemas.sql`;
`@.contexts/engineering/rules/security.md`; `@.contexts/engineering/rules/governance.md` ("Custo")

**Files:**
- Create: `app/packages/services/src/services/catalog/{domain/semantic-view.ts,application/use-cases/run-semantic-query.ts,adapters/driven/postgres-semantic-runner.ts,adapters/driven/sql-guard.ts,adapters/driven/bigquery-semantic-runner.ts}`
- Create: migration `<n>_semantic_reader_grants.sql` (grant `semantic_reader` to the app runtime role; revoke everything else in `semantic`)
- Create: `app/packages/services/src/services/catalog/adapters/driven/sql-guard.test.ts` — at least 25 cases: accepts SELECT/CTE/aggregates over allowlisted views; rejects multi-statement, `INSERT/UPDATE/DELETE/COPY/SET/DO/CALL`, `SELECT INTO`, `FOR UPDATE`, DML in CTE, non-`semantic` schemas, unlisted views, `pg_sleep`, `set_config`, `current_setting`, `dblink`, `lo_import`, comments hiding statements, unicode escapes
- Test: `postgres-semantic-runner.postgres.test.ts` (fixture base table with `FORCE ROW LEVEL SECURITY` + view owned by `semantic_owner`: tenant A sees only its rows; no setting → 0 rows; LIMIT default 100 and max 1000; `pg_sleep(6)` via allowlisted-looking trick cannot run; statement timeout returns `QUERY_TIMEOUT`); BigQuery runner returns `CONNECTOR_DISABLED`
- Create: `app/packages/agents/src/tools/sql/query-semantic-sql.tool.ts` (+ test with fake port)

**Interfaces:** Produces `runSemanticQuery({ principal, sql, limit })` use case; `querySemanticSql` tool.

- [ ] Steps: read → failing tests → implement (`libpg-query` parse; walk the AST; whitelist nodes, not blacklist) → PASS → progress → commit `feat(catalog): add read-only semantic sql runner with ast guard`

**Verify:** `pnpm -F @core/services test -- sql-guard && pnpm test:postgres && pnpm -F @core/agents test -- sql`; `framework-ok`.

### Task 12: `knowledge` context — tables, RLS and use cases

**Contexts:** spec §11, D3-07, D3-08; `@.contexts/engineering/contracts/pgvector.md` §1–§18;
`@.contexts/engineering/stacks/database/pgvector.md`

**Files:**
- Create: `app/packages/services/src/services/knowledge/adapters/driven/drizzle-schema.ts` (+ `drizzle-kit generate` migration: tables, indexes, HNSW, `FORCE ROW LEVEL SECURITY`, policies of spec §11)
- Create: `.../knowledge/application/use-cases/{register-document.ts,replace-document-chunks.ts,search-chunks.ts,delete-document.ts,list-documents.ts}` and `.../adapters/driven/postgres-knowledge-repository.ts`
- Test: `postgres-knowledge-repository.postgres.test.ts`: upsert idempotent by `(tenant_id, source, source_ref)`; replace chunks atomic; search in tenant A never returns tenant B chunks (same text); `_platform` rows visible to both; namespace filter; delete cascades chunks; HNSW index exists and query plan uses it for `ORDER BY embedding <=> $1 LIMIT k` (explain contains `hnsw`)

**Interfaces:** Produces `KnowledgePort` implementation used by tools and workflows.

- [ ] Steps: read → failing tests → schema + migration → implement → `pnpm db:migrate` → PASS → progress → commit `feat(knowledge): add knowledge tables with tenant row security`

**Verify:** `pnpm db:migrate && pnpm test:postgres`; `framework-ok`.

### Task 13: `files` context — Signed URL uploads and validation

**Contexts:** umbrella §16.2 (uploads); spec §3.2; `@.contexts/engineering/stacks/backend/firebase-functions.md`;
`@.contexts/engineering/rules/security.md`; `app/storage.rules`

**Files:**
- Create: `app/packages/services/src/services/files/{domain/file-policy.ts,application/use-cases/{request-upload.ts,finalize-upload.ts,get-file.ts,create-read-url.ts},adapters/driven/{gcs-signed-url.ts,emulator-signed-url.ts,firestore-file-repository.ts},adapters/driving/{files-route-handler.ts,object-finalized-handler.ts}}`
  (policy per purpose: `chat-attachment` images ≤ 10 MB png/jpeg/webp/gif, documents ≤ 25 MB pdf/txt/md/csv/json, video ≤ 200 MB mp4/webm/quicktime, audio ≤ 10 MB webm/ogg/mp4/wav; `knowledge` documents only; path `tenants/{tenantId}/files/{fileId}`; V4 PUT 15 min with `Content-Type` and `x-goog-content-length-range`; emulator adapter only when `APP_ENV=local`)
- Create: `app/apps/web/src/app/v1/files/route.ts`, `app/apps/web/src/app/v1/files/[fileId]/route.ts` (re-exports)
- Create: `app/apps/functions/src/files/on-file-finalized.ts` (magic bytes via `file-type`, size, status `ready|rejected`, delete rejected objects, event `FILE_UPLOADED`)
- Modify: `app/storage.rules` (still deny all client access; comment explains signed URLs), `app/firestore.rules` (deny client access to `files`; clients read through `/v1`)
- Test: `request-upload.test.ts` (auth → validate → authorize → 201 + `Location`; oversize/type rejected 400; foreign tenant 403), `object-finalized-handler.emulator.test.ts` (PNG bytes ok; `.png` with ZIP bytes rejected and deleted)

**Interfaces:** Produces `requestUpload`, `getFile`, `readFileBytes(fileId)` (for ingestion and SP4 multimodal), event `FILE_UPLOADED`.

- [ ] Steps: read → failing tests → implement → PASS (unit + emulators) → progress → commit `feat(files): add signed url uploads with magic byte validation`

**Verify:** `pnpm -F @core/services test -- files && pnpm test:emulators`; `framework-ok`.

### Task 14: Knowledge ingestion and catalog reindex workflows + `/v1/knowledge`

**Contexts:** spec §11; `@.contexts/engineering/stacks/ai/mastra-sdk.md` (workflows, RAG);
`@.contexts/engineering/contracts/events.md`

**Files:**
- Create: `app/packages/agents/src/knowledge/{chunk-document.ts,embed-chunks.ts,citation.ts,extract-text.ts}`
- Create: `app/packages/agents/src/knowledge/workflows/{knowledge-ingest.workflow.ts,catalog-reindex.workflow.ts}` (steps of spec §11; `retryConfig`; each step reads tenant from `requestContext`; `writer.custom({ type: 'data-ingest-progress', transient: true })`)
- Create: `app/packages/services/src/services/knowledge/adapters/driving/{knowledge-documents-route-handler.ts,knowledge-sources-route-handler.ts}` + `app/apps/web/src/app/v1/knowledge/**/route.ts` (sources → 202 `{ data: { runId } }` via gateway `startWorkflow`)
- Modify: `app/scripts/src/seed/seed-steps.ts` (seed step: run `catalog-reindex` and ingest two sample markdown docs for the demo tenant)
- Test: `chunk-document.test.ts`, `knowledge-ingest.workflow.postgres.test.ts` (fake embeddings: ingest markdown → chunks stored with `embedding_model`, `embedding_version`; rerun same content → no duplicate; URL source uses fake Firecrawl), `catalog-reindex.workflow.postgres.test.ts` (one doc per AI-catalog contract in `_platform`/`catalog`)

- [ ] Steps: read → failing tests → implement → PASS → `pnpm seed:local` twice (idempotent) → progress → commit `feat(knowledge): add ingestion and catalog reindex workflows`

**Verify:** `pnpm -F @core/agents test:postgres && pnpm -F @core/services test -- knowledge`; `framework-ok`.

### Task 15: `searchKnowledge`, citation guard and knowledge agent

**Contexts:** spec §6, §8.5, §11 (citations); `@.contexts/engineering/stacks/ai/harness-engineering.md` (guardrails, citation checks)

**Files:**
- Create: `app/packages/agents/src/tools/knowledge/search-knowledge.tool.ts`, `src/processors/citation-guard.ts`, `src/agents/knowledge-agent.ts`, `src/agents/instructions/knowledge.v1.md`, `src/agents/load-instructions.ts`
- Create: `app/packages/agents/skills/knowledge-citations/SKILL.md`
- Test: `search-knowledge.tool.test.ts` (namespaces restricted to allowed set even if the model asks for others; tenant from context), `citation-guard.test.ts` (unknown citation stripped; no citation → metadata `confidence: 'low'`), `knowledge-agent.postgres.test.ts` (fake model directive → tool call → answer with `kb:` citations present in retrieved set)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add knowledge agent with grounded citations`

**Verify:** `pnpm -F @core/agents test && pnpm -F @core/agents test:postgres`; `framework-ok`.

### Task 16: `usage` context, ledger exporter and budget guard

**Contexts:** spec §12, D3-12, D3-13; `@.contexts/engineering/rules/{observability,governance}.md`;
`@.contexts/engineering/contracts/bigquery.md` §14

**Files:**
- Create: `app/packages/services/src/services/usage/{adapters/driven/drizzle-schema.ts,application/use-cases/{record-llm-calls.ts,check-tenant-budget.ts,get-usage-summary.ts},domain/budget-policy.ts,adapters/driven/{postgres-usage-repository.ts,bigquery-usage-sink.ts,noop-usage-sink.ts}}` + migration (`usage.llm_calls` plain table with index `(tenant_id, occurred_at)`; `usage.tenant_budgets`; view `usage.tenant_month_spend`)
- Create: `app/packages/agents/src/observability/usage-ledger-exporter.ts` (Mastra exporter: on `MODEL_GENERATION` span end → buffered `recordLlmCalls`, flush ≤ 2 s or 50 rows; never throws into the agent)
- Create: `app/packages/agents/src/processors/tenant-budget-guard.ts` (input processor: `checkTenantBudget` → `abort('BUDGET_EXCEEDED', { metadata })`; port error → abort `BUDGET_UNAVAILABLE`, fail-closed)
- Evaluate: `PostgresStoreVNext` for the observability domain (metrics) in a throwaway scratchpad probe; record result in the report and in `guardrail-profile.ts` flag `TOKEN_COST_CONTROL_ENABLED` (default false unless the probe passes)
- Test: `budget-policy.test.ts` (invalid/zero/negative config → plan default; alert threshold = 80 % < cap), `usage-ledger-exporter.test.ts` (span → row with cost; unknown price → `null` + warn), `tenant-budget-guard.test.ts`, `postgres-usage-repository.postgres.test.ts` (month spend view per tenant), `bigquery-usage-sink.test.ts` (fake BigQuery client: rows mapped to `ai_observability.llm_calls` columns; insert uses `insertId` = row id)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(usage): add llm usage ledger and tenant budget guard`

**Verify:** `pnpm -F @core/services test && pnpm test:postgres && pnpm -F @core/agents test`; `framework-ok`.

### Task 17: Guardrail profile and observability wiring

**Contexts:** spec §12, §13 (observability); `@.contexts/engineering/rules/observability.md` ("Observabilidade de LLM")

**Files:**
- Create: `app/packages/agents/src/processors/guardrail-profile.ts` (stacks of spec §12; `errorStrategy: 'strict'`; detectors use role `fast`; tenant PII mode from `SettingsPort`; `RegexFilterProcessor` on output for secret-shaped strings)
- Create: `app/packages/agents/src/observability/{create-observability.ts,trace-context.ts}` (exporters, `SensitiveDataFilter` with defaults copied + extra fields, `requestContextKeys`, sampling per env)
- Modify: `compose-agent-runtime.ts` (observability + profiles on every agent)
- Test: `guardrail-profile.test.ts` (fake detector: `[[fake:injection]]` → tripwire chunk with `processorId`; detector failure → tripwire, not pass-through), `trace-context.test.ts` (valid `traceparent` → traceId/parentSpanId; invalid → none), `create-observability.test.ts` (OTLP exporter only when endpoint set; filter fields include defaults)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add guardrail profile and tracing configuration`

**Verify:** `pnpm -F @core/agents test`; `framework-ok`.

### Task 18: Memory configuration and tenant isolation

**Contexts:** spec §10, D3-19; `@.contexts/engineering/stacks/ai/mastra-sdk.md` (Memory)

**Files:**
- Create: `app/packages/agents/src/memory/{create-memory.ts,working-memory.schema.ts}` (PgVector in schema `mastra`, fake/real embedder from factory, options of spec §10; OM only when `AI_MEMORY_OBSERVATIONAL=true` with explicit model role `fast`)
- Test: `memory-isolation.postgres.test.ts` (agent with fake model: tenant A user writes a fact; same uid in tenant B cannot recall it via semantic recall nor working memory; thread list for resource B excludes A's threads; direct `threadId` of A with resource B → 403 through the context middleware)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): configure memory with tenant-scoped resources`

**Verify:** `pnpm -F @core/agents test:postgres`; `framework-ok`.

### Task 19: Contract command tools and example module command

**Contexts:** spec §8.4, D3-11; umbrella §5 (4), §16.4; `app/modules/example/` (SP2); `app/packages/contracts/src/contracts/example/note.schema.ts`

**Files:**
- Create: `app/packages/agents/src/tools/commands/command-tools.ts` (from `AgentModule.commands`; boot error when a command contract lacks `permission` or `kind !== 'command'`; idempotency key `runId:toolCallId`)
- Create in `app/modules/example/`: command contract `example.CreateNoteCommand` (in the module's contracts folder, registered through the module manifest), use case `createNote` (Firestore `notes` with `tenantId`, authorize `example.note.create`, audit), `preview` (before `null`, after = note), and the `defineAgentModule({ id: 'example', commands: [...] })` export consumed by `apps/mastra/src/modules.ts`
- Test: `command-tools.test.ts` (tool schema equals contract schema; execute calls handler with principal + idempotency key; second call with same key returns first result), `create-note.emulator.test.ts` (authorized user creates note; unauthorized → 403; audit event written)

- [ ] Steps: read → failing tests → implement → PASS → `pnpm contracts:catalog` → progress → commit `feat(agents): derive mutation tools from command contracts`

**Verify:** `pnpm -F @core/agents test && pnpm test:emulators && pnpm contracts:check`; `framework-ok`.

### Task 20: Supervisor, data, action and web agents with skills

**Contexts:** spec §6, §7; `@.contexts/engineering/stacks/ai/harness-engineering.md` (prompt, decision layers)

**Files:**
- Create: `app/packages/agents/src/agents/{supervisor-agent.ts,data-agent.ts,action-agent.ts,web-agent.ts}`, `instructions/{assistant,data,action,web}.v1.md`
- Create: `app/packages/agents/skills/{data-catalog,safe-actions}/SKILL.md`; `src/skills/resolve-skills.ts` (core + enabled module skills per tenant)
- Modify: `compose-agent-runtime.ts` (register agents; supervisor subagents filtered by `agent-settings`; `onDelegationStart` rejects `web` when opt-in is off)
- Modify: `fake-scenarios.ts` (supervisor delegation rules; data-agent `renderForm` / `listEntities`; action-agent command call)
- Test: `skills.test.ts` (`validateSkillContent` passes for every SKILL.md), `supervisor.integration.test.ts` (in-process Mastra with fake model and fake ports: question → `agent-knowledge` delegation chunk; "create a note" → `data` renders form; action tool call yields `tool-call-approval` chunk; `approveToolCall` → handler executed once; decline → not executed and reason fed back), `web-opt-in.test.ts`

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add supervisor with knowledge, data, action and web subagents`

**Verify:** `pnpm -F @core/agents test`; `framework-ok`.

### Task 21: Connectors store, secret store and `/v1/connectors`

**Contexts:** spec §9, D3-14; `@.contexts/engineering/contracts/secrets.md`; `@.contexts/engineering/rules/api-design.md`

**Files:**
- Create: `app/packages/services/src/services/connectors/{application/use-cases/{create-connector.ts,update-connector.ts,delete-connector.ts,list-connectors.ts,set-connector-secret.ts},adapters/driven/{firestore-connector-repository.ts,secret-manager-store.ts,local-secret-store.ts},adapters/driving/connectors-route-handler.ts}`
- Create: `app/apps/web/src/app/v1/connectors/**/route.ts` (list/create; get/patch/delete; `PUT /v1/connectors/{id}/secret` write-only, 204)
- Modify: `app/firestore.rules` (deny client access to `connectors` and `local-secrets`), `app/firestore.indexes.json` (`tenantId`+`createdAt`)
- Test: route handler tests (permissions `connectors.connector.read|write`; secret never returned; `allowedHosts` required for mcp/openapi; https only), `local-secret-store.test.ts` (refused outside local), emulator repository test

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(connectors): add tenant connectors with secret store`

**Verify:** `pnpm -F @core/services test && pnpm test:emulators`; `framework-ok`.

### Task 22: OpenAPI and MCP client connectors (incl. browser)

**Contexts:** spec §9; `@.contexts/engineering/rules/security.md` (SSRF, untrusted output)

**Files:**
- Create: `app/packages/agents/src/connectors/{connector-registry.ts,openapi/openapi-to-tools.ts,mcp/mcp-connector.ts,db/postgres-readonly-connector.ts}`, `src/tools/web/url-guard.ts`
- Modify: `compose-agent-runtime.ts` (per-call `toolsets` resolved from tenant connectors for supervisor/action/web; cache 5 min; `disconnect()` on eviction)
- Test: `openapi-to-tools.test.ts` (fixture spec: GET → read tool, POST → approval; host not in servers rejected; body cap), `url-guard.test.ts` (private IPs, `localhost`, `169.254.169.254`, IPv6 loopback, redirects to private rejected), `mcp-connector.test.ts` (local in-process `MCPServer` over HTTP: tools listed, approval required unless read-only policy; host outside `allowedHosts` rejected; stdio refused outside local)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add openapi and mcp client connectors`

**Verify:** `pnpm -F @core/agents test`; `framework-ok`.

### Task 23: Firecrawl web tools

**Contexts:** spec §8.5, D3-16; `@.contexts/engineering/rules/security.md`

**Files:**
- Create: `app/packages/agents/src/tools/web/{firecrawl-client.ts,web-search.tool.ts,web-scrape.tool.ts,fake-firecrawl.ts}` (key: tenant BYO from `SecretStore` else platform `FIRECRAWL_API_KEY`; `FIRECRAWL_API_URL` for self-hosted; `scrape` markdown only; 20 000-char cap; output wrapped as `<untrusted_web_content>`)
- Modify: `knowledge/extract-text.ts` (URL source uses the same client)
- Test: tools with fake client (opt-in off → tool absent; url-guard applied before the call; cap applied), real-mode smoke `web-scrape.real.test.ts` skipped without key

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add firecrawl web tools with tenant opt-in`

**Verify:** `pnpm -F @core/agents test`; `framework-ok`.

### Task 24: Core MCP server and `/v1/mcp`

**Contexts:** spec §9 (core MCP server), D3-15; SP1 API keys (umbrella §16.2)

**Files:**
- Create: `app/packages/agents/src/mcp-server/core-mcp-server.ts` (tools read-only, `agents: { assistant }`, resources = catalog entries filtered per principal, `requestState.key`)
- Create: `app/packages/services/src/services/agents/adapters/driving/mcp-route-handler.ts` + `app/apps/web/src/app/v1/mcp/route.ts` (auth API key or Bearer → `agents.mcp.use` → gateway `callMcp`; rate limit per key)
- Test: `core-mcp-server.test.ts` (tool list; resource filtered), `mcp-route-handler.test.ts` (no auth 401; key without permission 403; happy path proxies), integration with `MCPClient` against the in-process server (`listTools` includes `ask_assistant`)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): expose core mcp server through v1`

**Verify:** `pnpm -F @core/agents test && pnpm -F @core/services test`; `framework-ok`.

### Task 25: PubSub, Mastra image and build pin check (follow-up #2)

**Contexts:** spec §14 (PubSub), §17 (#2); `app/apps/mastra/Dockerfile`; spike-mastra.md (build output)

**Files:**
- Create: `app/packages/agents/src/runtime/create-pubsub.ts` (`memory` → default EventEmitter; `gcp` → `GoogleCloudPubSub({ projectId })`)
- Create: `app/apps/mastra/scripts/check-mastra-output.ts` (compare `.mastra/output/package.json` deps with versions resolved in `app/pnpm-lock.yaml`; fail on drift for shared deps; run `pnpm audit --prod --audit-level high` in the output dir)
- Modify: `app/apps/mastra/package.json` (`build` = `mastra build && node scripts/check-mastra-output.ts`), `Dockerfile` (skills dir + catalog JSON copied), `.github/workflows/app-ci.yml` (mastra build job)
- Test: `check-mastra-output.test.ts` (fixture drift detected), `create-pubsub.test.ts`

- [ ] Steps: read → failing tests → implement → `pnpm -F @core/mastra build` → `docker build` → `/health` 200 → PASS → progress → commit `build(mastra): verify build output pins and add pubsub selection`

**Verify:** `pnpm -F @core/mastra build` exit 0; `docker build -f apps/mastra/Dockerfile -t core-mastra:sp3 .` ok; `framework-ok`.

### Task 26: Voice composition (used by SP4)

**Contexts:** spec §5.1 (voice roles), §14 (Voice); `@.contexts/engineering/stacks/ai/openai.md` (transcription, realtime)

**Files:**
- Create: `app/packages/agents/src/voice/create-voice.ts` (`CompositeVoice` with AI SDK transcription/speech models from the factory; fake voice in fake mode; `null` when keys missing → feature disabled)
- Create: `app/packages/agents/src/voice/voice-routes.ts` (`registerApiRoute('/voice/transcriptions', POST)` accepts ≤ 5 MB audio, ≤ 60 s; `registerApiRoute('/voice/speech', POST)` streams audio; both `requiresAuth: true`)
- Test: fake mode: transcription returns deterministic text; speech returns WAV header; disabled when keys absent → 503 `FEATURE_UNAVAILABLE`

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add voice composition and routes`

**Verify:** `pnpm -F @core/agents test -- voice`; `framework-ok`.

### Task 27: Scorers, datasets and eval runner

**Contexts:** spec §13 (evals), D3-18; `@.contexts/engineering/stacks/ai/harness-engineering.md` (eval layer);
`@.contexts/engineering/rules/{testing,governance}.md`; ADR 0004 E4

**Files:**
- Create: `app/packages/agents/src/scorers/{tool-routing,citations-grounded,tenant-leak,format-compliance,faithfulness-judge}.scorer.ts`
- Create: `app/packages/agents/evals/datasets/{assistant,knowledge,data,action}.v1.jsonl` (10–30 cases each, generic, fake directives where needed) and `evals/baselines/*.json` (`{ scorer: { minimum, tolerance } }`)
- Create: `app/packages/agents/src/evals/{seed-datasets.ts,run-agent-evals.ts}` and `src/evals/*.eval.test.ts` (one per agent: `runEvals` with `mastra.getAgent`, gate vs baseline; writes `app/.evals/<agent>.json`)
- Modify: `app/package.json` (`evals`, `evals:seed`, `evals:real`), `.github/workflows/app-ci.yml` (job `evals`, `AI_MODE=fake`, Postgres service)
- Test: scorer unit tests (each scorer on crafted runs), baseline gate test (score below `minimum - tolerance` fails)

- [ ] Steps: read → failing tests → implement → `pnpm evals` green → progress → commit `test(agents): add scorers, versioned datasets and eval gate`

**Verify:** `cd app && AI_MODE=fake pnpm evals` → all verdicts `passed`; `framework-ok`.

### Task 28: Observational Memory comparison (conditional)

**Contexts:** spec §10 (OM), umbrella §14 item 6

**Files:**
- Create: `app/packages/agents/src/evals/memory-comparison.real.eval.test.ts` (same multi-turn dataset `evals/datasets/memory.v1.jsonl`; configs A = semantic recall, B = OM; records score, tokens, cost)
- Create: `docs/plans/2026-09-29-sp3-agentic-runtime/reports/om-comparison.md`

- [ ] Step 1: Read contexts
- [ ] Step 2: If no real provider key is configured, write the report with "not run: no keys", keep `AI_MEMORY_OBSERVATIONAL=false`, skip to Step 5
- [ ] Step 3: Run `pnpm -F @core/agents evals:real -- memory-comparison`
- [ ] Step 4: Report the numbers; enable OM by default only if B ≥ A on score and ≤ 1.2× cost; otherwise keep it off; update the D3-19 ADR with the result (Amendments section)
- [ ] Step 5: Progress + commit `docs(agents): record observational memory comparison`

**Verify:** report exists with outcome; `framework-ok`.

### Task 29: SP3 gate — integration suite and documentation

**Contexts:** umbrella §13 (SP3 gate); spec §1; `app/README.md`; `app/apps/mastra/README.md`

**Files:**
- Create: `app/apps/mastra/src/mastra/sp3-gate.emulator.test.ts` (boots the built Mastra with fake mode, Auth Emulator users in two tenants, Postgres: (1) supervisor answers a KB question with citations through `/api/agents/assistant/stream`; (2) data agent `listEntities` + `querySemanticSql` scoped to tenant; (3) action command requires approval and writes audit; (4) memory + KB isolation between tenants; (5) tripwire on `[[fake:injection]]`; (6) usage row per model call; (7) `/api/vectors/*` → 404)
- Modify: `app/README.md` (agents section: how to add an agent/tool/skill/command via `defineAgentModule`, `AI_MODE`, evals), `app/packages/agents/README.md`, `app/apps/mastra/README.md`
- Create: `docs/plans/2026-09-29-sp3-agentic-runtime/reports/sp3-summary.md` (gate evidence, deviations, follow-ups)
- Modify: `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (mark #1, #2, #3, #12 resolved with commit refs)

- [ ] Steps: read → gate test → run full gate → report → progress → commit `test(agents): add sp3 gate integration suite`

**Verify:** `cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm test:postgres && pnpm test:emulators && AI_MODE=fake pnpm evals && pnpm contracts:check` all green; `framework-ok`.

---

## Traceability

| Requirement | Source | Tasks |
|---|---|---|
| Multi-agent supervisor + subagents | prompt item 1; umbrella §7, D12 | 7, 20 |
| Skills (core + modules) | prompt item 1; umbrella §7 | 15, 20 |
| Tools registry, read vs mutation, approval, contract tools | prompt item 1; umbrella §5, §7 | 9, 10, 19 |
| Memory thread/working/semantic, OM evaluated, `resourceId = tenantId:uid` | prompt item 2; umbrella §7, §14.6 | 18, 28 |
| Knowledge base (pgvector, ingestion upload/URL/catalog/modules, namespaces, citations) | prompt item 2; umbrella §7 | 12, 13, 14, 15 |
| Connectors DB / OpenAPI / MCP client, MCP server | prompt item 5; umbrella §7 | 11, 21, 22, 24 |
| Firecrawl, browser, opt-in | prompt item 6; umbrella §7 | 22, 23 |
| Evals: scorers, datasets, experiments, CI gate | prompt item 7; umbrella §10; ADR E4 | 27 |
| Logs, tracing, token costs per tenant | prompt item 8; umbrella §10 | 16, 17 |
| Guardrails + cost control | umbrella §7 | 16, 17 |
| Data catalog for AI (list/describe/renderForm/SQL/actions) | prompt "Contratos de dados"; umbrella §5, §16.4 | 4, 10, 11, 19 |
| Auth provider, RequestContext | umbrella §7, §16.2; SP0 follow-up 12 | 6, 7, 8 |
| Durable/PubSub, Mastra on Cloud Run | umbrella §7, §16.3; follow-ups 1–3 | 2, 3, 25 |
| Voice runtime (for chat) | prompt item 9; umbrella §8 | 26 |
| `AI_MODE=fake` | umbrella §11 | 1, 5 |
| Gate SP3 | umbrella §13 | 29 |

## Self-review

- Every spec §16 decision is recorded by Task 0 and implemented by a later task.
- No task edits `.contexts/` or `.claude/`; every Verify has `framework-ok`.
- Tests are offline (`AI_MODE=fake`); real-mode tests skip without keys (Tasks 23, 28).
- SP1/SP2 names are bound in one adapter file (Task 6/7), so drift is local.
