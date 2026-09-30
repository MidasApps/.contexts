# Spec — SP3 Agentic runtime (Mastra)

- **Status:** draft for execution (planner output, 2026-09-29)
- **Umbrella:** `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §5, §7, §10, §11, §13 (SP3), §14 item 6, §16
- **Origin prompt:** `docs/prompts/2026-09-29-agentic-app-core-harness.md` items 1, 2, 5, 6, 7, 8, 13 and "Contratos de dados"
- **Plan:** `docs/plans/2026-09-29-sp3-agentic-runtime.md`
- **Constraints:** `docs/plans/execution-constraints.md` (framework `.contexts/` + `.claude/` read-only)
- **Prerequisites:** SP0 done; SP1 (identity, tenancy, RBAC) and SP2 (app shell, `modules/example`, `defineModule()`) merged with their gates green. SP3 consumes their interfaces exactly as the umbrella §4/§6 names them and isolates them behind ports so a naming drift is fixed in one adapter.

## 1. Scope and gate

SP3 delivers the agent runtime that SP4 (chat) and SP5 (workflows, `/admin`) build on:
agents (supervisor + subagents), skills, tools (catalog, SQL, contract-derived mutations,
knowledge, web), memory, knowledge base (RAG), connectors (DB, OpenAPI, MCP client), the
core MCP server, guardrails, token/cost accounting, tracing, evals with a CI gate, the
Mastra auth provider and the `/v1 → Mastra` gateway.

**Gate (umbrella §13):** integration tests with `AI_MODE=fake`; a minimal versioned eval
set per core agent passing in CI; a test proving memory and knowledge isolation between
tenants. Everything runs offline; real provider keys are optional.

Out of scope here: chat UI and `/v1/chat` (SP4); generic approval workflow, schedules,
`/admin` and `/settings` pages (SP5). SP3 defines the ports SP5 implements (approval
requests) and fails closed until then.

## 2. Facts this design relies on (verified 2026-09-29)

Versions (`npm view`): `@mastra/core` 1.71.0, `mastra` 1.31.3, `@mastra/memory` 1.32.1,
`@mastra/rag` 2.6.4, `@mastra/mcp` 2.1.0, `@mastra/pg` 1.27.1, `@mastra/ai-sdk` 1.10.5,
`@mastra/client-js` 1.50.0, `@mastra/observability` 1.18.1, `@mastra/otel-exporter` 1.4.2,
`@mastra/google-cloud-pubsub` 1.1.3, `@mastra/editor` 0.15.3, `@mastra/evals` 1.10.3
(peer `vitest <5`, **E4 holds**), `ai` 7.0.122, `@ai-sdk/provider` 4.0.19,
`@ai-sdk/google` 4.0.85, `@ai-sdk/openai` 4.0.81, `@ai-sdk/anthropic` 4.0.68,
`firecrawl` 4.42.0 (same SDK as `@mendable/firecrawl-js` 4.42.0), `drizzle-orm` 0.45.3,
`drizzle-kit` 0.31.11, `libpg-query` 18.1.5, `@google-cloud/bigquery` 9.1.0,
`@google-cloud/secret-manager` 7.1.1, `@opentelemetry/exporter-trace-otlp-proto` 0.222.0.
`@mastra/deployer-cloud-run` does not exist (Cloud Run = standalone `mastra build` image, SP0).

Mastra 1.71 facts (docs at mastra.ai/llms.txt + installed `.d.ts`):
- `Agent` options: `id`, `name`, `description` (required for subagents: the supervisor routes
  by it), `instructions` (string or `({ requestContext }) => …`), `model` (router string,
  provider instance or function), `agents` (subagents), `tools` (static or function),
  `memory`, `scorers`, `defaultOptions` (`maxSteps` lives here, not in the constructor),
  `inputProcessors`/`outputProcessors`, `requestContextSchema`, `skills`, `workspace`, `voice`.
- Delegation shows in the stream as a tool call `agent-<key>` (AI SDK UI: `data-tool-agent`,
  `data-tool-agent-step`); each delegation gets a fresh subagent thread; the subagent's
  request context is a shallow copy minus identity keys; `abortSignal`, approvals and
  `suspend()` propagate to the parent stream. `.network()` is deprecated (umbrella D12).
- Tool approval: `createTool({ requireApproval })` or per-call `requireToolApproval`; stream
  chunk `tool-call-approval`; continue with `agent.approveToolCall({ runId, toolCallId })` /
  `declineToolCall({ runId, toolCallId, reason })`; needs storage for snapshots.
- `createTool({ id, description, inputSchema, outputSchema, requestContextSchema, strict,
  requireApproval, toModelOutput, mcp, background, execute(input, ctx) })`; `ctx` has
  `requestContext`, `abortSignal`, `agent.suspend`, `writer` (always `await writer.custom`).
  The stream's tool name is the object key, not the tool id.
- `RequestContext` (`@mastra/core/request-context`), reserved keys `MASTRA_RESOURCE_ID_KEY`,
  `MASTRA_THREAD_ID_KEY`: set by the server, they override client values and give 403 on
  mismatch. Middleware runs before per-route auth and reads the user with
  `getAuthenticatedUser()` (`@mastra/server/auth`); it is skipped on `requiresAuth: false`.
- SP0 spike (`reports/sp0-summary.md` §1): own `MastraAuthProvider` works; gotchas — pass
  `mapUserToResourceId` through `super()`, the server also accepts `?apiKey=<token>`,
  emulator accepts unsigned tokens, Mastra error bodies are `{ error }`.
- Processors (`@mastra/core/processors`): `UnicodeNormalizer`, `PromptInjectionDetector`,
  `PIIDetector`, `ModerationProcessor`, `LanguageDetector`, `SystemPromptScrubber`,
  `TokenLimiterProcessor`, `TokenCostControl`, `RegexFilterProcessor`, `ToolCallFilter`,
  `ResponseCache`, `ModelSelectionProcessor`, `SkillsProcessor`, `StreamErrorRetryProcessor`.
  LLM-backed detectors default to `errorStrategy: 'warn'` (**fail-open**); `'strict'` fails
  closed. `abort()` produces a `tripwire` chunk. `TokenCostControl` is best-effort (async
  metrics) and needs a metrics-capable observability store (`PostgresStoreVNext`), and its
  `organization`/`user` scopes are **fail-open** when the RequestContext key is missing.
- Memory: `lastMessages` (default 10), `semanticRecall { topK, messageRange, scope }`,
  `workingMemory { enabled, schema|template, scope }`, top-level `generateTitle`,
  `observationalMemory` (default scope `thread`, default model `google/gemini-2.5-flash`,
  so a model must be set explicitly). Memory processors are auto-added.
- RAG: `MDocument.from*`, `chunk({ strategy, maxSize, overlap })`, `rerank`,
  `createVectorQueryTool` reads `filter`/`indexName`/`topK` overrides **from requestContext**
  (tenant filter must never come from the client).
- MCP 2.x: `MCPClient` (`url` = Streamable HTTP, `allowedHosts` SSRF allowlist incl.
  redirects and OAuth hosts, `authProvider: MCPOAuthClientProvider`, `requireToolApproval`,
  `timeout` default 60 s, `listToolsets()` for per-call toolsets). `MCPServer` speaks only
  the 2026-07-28 revision, served at `/api/mcp/:serverId/mcp`, exposes agents as `ask_<key>`
  and workflows as `run_<key>`, needs `requestState.key` (≥ 32 bytes) across instances.
- Skills: `createSkill` / filesystem `SKILL.md` directories (`@mastra/core/skills`), agent
  `skills` option (can be a function of `requestContext`); tools `skill`, `skill_read`,
  `skill_search`. A `Workspace` with a writable filesystem also adds file-write tools, so
  core skills use the agent-level `skills` option, not a workspace.
- Evals without `@mastra/evals`: `createScorer`, `runEvals` (`verdict`, `gates`,
  thresholds), `notScorable` from `@mastra/core/evals`; datasets/experiments from
  `mastra.datasets` (tables `mastra_datasets*`, `mastra_experiments*`), experiments with
  tool mocks; scorers must also be registered in `new Mastra({ scorers })` to persist.
- Observability: `new Observability({ configs: { default: { serviceName, sampling,
  requestContextKeys, exporters, spanOutputProcessors } } })`; `MastraStorageExporter`,
  `OtelExporter` (`@mastra/otel-exporter`, `provider.custom { endpoint, protocol, headers }`),
  `SensitiveDataFilter` (passing `sensitiveFields` **replaces** the defaults). No automatic
  `traceparent` extraction: pass `tracingOptions.traceId/parentSpanId`.
- Build gotcha: `server`, `bundler`, `deployer` must be literal direct properties of
  `new Mastra({...})` (the builder extracts them statically).
- AI SDK 7: `MockLanguageModelV4`, `MockEmbeddingModelV4`, `MockSpeechModelV4`,
  `MockTranscriptionModelV4`, `simulateReadableStream` in `ai/test`; stream `finish` uses
  `finishReason: { unified, raw }`.

## 3. Package layout

### 3.1 `app/packages/agents` (`@core/agents`, new)

```
packages/agents/
  package.json            name @core/agents; exports "." and subpaths listed below
  skills/                 core Agent Skills (SKILL.md dirs): data-catalog, knowledge-citations, safe-actions
  evals/datasets/<agent>.v<N>.jsonl   versioned eval sets (source of truth)
  evals/baselines/<agent>.json        gate thresholds + tolerance band
  src/
    index.ts                          named re-exports only
    runtime/
      agent-module.ts                 defineAgentModule(), AgentModule type (module AI manifest)
      compose-agent-runtime.ts        composeAgentRuntime({ env, ports, modules }) → RuntimeParts
      runtime-ports.ts                AgentRuntimePorts (access, audit, approvals, usage, knowledge, connectors, secrets, flags)
    context/
      agent-request-context.ts        typed keys, readAgentContext(), setAgentContext()
    auth/
      firebase-mastra-auth.ts         FirebaseMastraAuth extends MastraAuthProvider
      bearer-only.ts                  reads Authorization: Bearer from the raw request
      context-middleware.ts           Mastra server middleware: principal → RequestContext
      route-allowlist-middleware.ts   404 for built-in routes the core does not use
    models/
      model-roles.ts                  roles, env keys, defaults
      model-factory.ts                real providers (AI SDK instances with keys from env)
      model-prices.ts                 price table (micro-USD / 1M tokens) + pricesVerifiedAt
      fake/fake-language-model.ts     scripted deterministic LanguageModelV4
      fake/fake-scenarios.ts          directive parser + scenario registry
      fake/fake-embedding-model.ts    hashed bag-of-words, 1536 dims, L2-normalized
      fake/fake-voice-models.ts       fake transcription and speech models
    agents/
      supervisor-agent.ts             "assistant" supervisor
      knowledge-agent.ts  data-agent.ts  action-agent.ts  web-agent.ts
      instructions/<agent>.v<N>.md    versioned instructions (seed; SP5 store overrides)
      load-instructions.ts
    tools/
      define-core-tool.ts             wraps createTool: strict schema, kind, permission, authorize, audit, span, budget
      tool-registry.ts
      catalog/{list-entities,describe-entity,render-form}.tool.ts
      catalog/ai-catalog-reader.ts    reads catalog.ai.json + permission/pii filtering
      sql/query-semantic-sql.tool.ts  sql/sql-guard.ts (libpg-query AST) sql/semantic-sql-runner.ts
      sql/bigquery-semantic-sql.ts    fail-closed stub + isolation design
      commands/command-tools.ts       contract-derived mutation tools
      knowledge/search-knowledge.tool.ts
      web/{web-search,web-scrape}.tool.ts  web/url-guard.ts (SSRF)
    connectors/
      connector-registry.ts           per-tenant connector toolsets
      openapi/openapi-to-tools.ts
      mcp/mcp-connector.ts
      db/postgres-readonly-connector.ts
    mcp-server/core-mcp-server.ts
    memory/create-memory.ts           memory/working-memory.schema.ts
    knowledge/
      chunk-document.ts  embed-chunks.ts  citation.ts
      workflows/knowledge-ingest.workflow.ts  workflows/catalog-reindex.workflow.ts
    processors/
      guardrail-profile.ts            per-agent processor stacks
      tenant-budget-guard.ts          hard monthly cap (own ledger), fail-closed
      citation-guard.ts               output: cited ids ⊆ retrieved ids, else low-confidence metadata
    scorers/
      citations-grounded.scorer.ts  tool-routing.scorer.ts  tenant-leak.scorer.ts
      format-compliance.scorer.ts   faithfulness-judge.scorer.ts (real mode only)
    observability/
      create-observability.ts        usage-ledger-exporter.ts  trace-context.ts
    voice/create-voice.ts             CompositeVoice from model roles (SP4 uses it)
    testing/                          fakes for every port (exported under "@core/agents/testing")
```

Boundaries (umbrella §3, enforced by `eslint-plugin-boundaries` in `@core/config`):
`agents` imports `contracts` and `services` only through `@core/services` entry or
`application/use-cases/**`; never `client`. `apps/mastra` composes.

### 3.2 New and extended backend contexts in `@core/services`

| Context | SP3 adds |
|---|---|
| `knowledge` | Postgres tables `ai.documents`, `ai.chunks_v1`; use cases `registerDocument`, `replaceDocumentChunks`, `searchChunks`, `deleteDocument`, `listDocuments`; `/v1/knowledge/*` driving adapters |
| `files` (new) | `files` Firestore collection, Signed URL port, `POST /v1/files`, `GET /v1/files/{id}`, `onObjectFinalized` validation (SP4 reuses for chat attachments) |
| `connectors` | Firestore `connectors`, `SecretStore` port (Secret Manager / local), `/v1/connectors` CRUD |
| `usage` | Postgres `usage.llm_calls`, `usage.tenant_budgets`, view `usage.tenant_month_spend`; use cases `recordLlmCall`, `checkTenantBudget`, `getUsageSummary`; BigQuery sink port |
| `catalog` (new) | semantic view registry + `runSemanticQuery` use case (read-only runner) |
| `agents` (new) | `agent-settings` per tenant (enable, web opt-ins, guardrail levels, budget); `MastraGateway` driven adapter (`/v1` → Mastra) |
| `audit` | consumed from SP1 (`recordAuditEvent`) — SP3 adds event names only |

Adding `files`, `catalog` and `agents` to the umbrella §3 context list is recorded as a
decision (D3-17).

### 3.3 `apps/mastra` wiring

`src/mastra/index.ts` keeps `new Mastra({...})` with **literal** `server`, `bundler`
properties (build gotcha) and receives the rest from `composeAgentRuntime()`:

```ts
const runtime = composeAgentRuntime({ env, ports: createRuntimePorts(env), modules: APP_MODULES });
export const mastra = new Mastra({
  agents: runtime.agents, workflows: runtime.workflows, scorers: runtime.scorers,
  mcpServers: runtime.mcpServers, storage: runtime.storage, vectors: runtime.vectors,
  logger: new PinoLogger(buildLoggerOptions(env)), observability: runtime.observability,
  pubsub: runtime.pubsub,
  server: { ...buildServerConfig(env), auth: runtime.auth, middleware: runtime.middleware, apiRoutes: runtime.apiRoutes },
});
```

`APP_MODULES` (`apps/mastra/src/modules.ts`) lists the `AgentModule`s taken from the
app's module manifests (`modules/*` via `defineModule().agents`); the core packages never
import a module (D6). `createRuntimePorts(env)` binds SP1/SP3 services use cases.

## 4. Request context and auth

### 4.1 `/v1 → Mastra` gateway (Mastra stays private, umbrella §16.3)

`MastraGateway` (`services/agents/adapters/driven/mastra-gateway.ts`) is the only caller of
Mastra. It uses `@mastra/client-js` for typed calls and raw `fetch` for streams, and sends:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <Firebase ID token of the caller>` (or the service API key, see §9) |
| `X-Serverless-Authorization` | Google-signed ID token for the Mastra Cloud Run audience (outside `local`; `google-auth-library` `getIdTokenClient`) |
| `X-Tenant-Id`, `X-Project-Id`, `X-Node-Id` | active org/project/unit resolved by `/v1` from SP1 access context |
| `X-Locale`, `X-Time-Zone`, `X-Currency` | resolved preferences (umbrella §6 order) |
| `X-Active-Screen` | optional route id of the UI screen (≤ 200 chars) |
| `X-Request-Id`, `traceparent` | correlation (ULID; W3C trace context) |

Header names live once in `@core/contracts` (`src/contracts/agents/forwarded-headers.ts`);
`services` (gateway) and `agents` (middleware) both import them from there. `/v1` never forwards a client
`requestContext` body field; the gateway strips it. Mastra's `{ error }` 401/403/404/5xx are
mapped to the `api.md` §6 envelope (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`UPSTREAM_UNAVAILABLE` 502/504) and the Mastra body is never passed through (follow-up 12d).

### 4.2 `FirebaseMastraAuth` (`@core/agents/auth`)

- `authenticateToken(token, request)`: reads `Authorization` from the raw request itself and
  returns `null` unless it is `Bearer <token>` with the same token (blocks `?apiKey=`,
  follow-up 12b). Verifies with `verifyIdToken(token, checkRevoked)` where `checkRevoked`
  is `true` for mutations and agent runs with mutation tools (all POSTs) and `false` for
  GETs (§16.2; unit-tested with a fake verifier, follow-up 12e). Service API keys
  (`sk_…` prefix) go to SP1 `verifyApiKey` instead. Then resolves the principal:
  `{ kind: 'user'|'service', uid, tenantId, projectId?, nodeId?, permissions: Set,
  locale, timeZone, currency, activeScreen? }` using SP1's access context (fail-closed: a
  missing membership yields a principal with no permissions, so `authorizeUser` returns
  false → 403; an invalid token yields `null` → 401).
- `authorizeUser(principal)`: true only when the tenant membership exists and the principal
  holds `agents.chat.use` (or `agents.mcp.use` for the MCP route).
- `mapUserToResourceId` passed through `super({ mapUserToResourceId })` (follow-up 12a):
  `${tenantId}:${uid}`.
- Env: `FIREBASE_AUTH_EMULATOR_HOST` outside `local` is already rejected by
  `ServicesEnvSchema` (`assertRemoteHasNoEmulators`); SP3 adds a regression test (12c).

### 4.3 Typed `AgentRequestContext`

Contract `agents.AgentRequestContext` (`@core/contracts/src/contracts/agents/agent-request-context.schema.ts`,
kind `settings`, pii `personal`):

```
tenantId, projectId?, nodeId?, userId, principalKind ('user'|'service'),
permissions: string[] (effective = principal ∩ agent ceiling, computed server-side),
locale, timeZone, currency, activeScreen?, requestId, conversationId?,
organizationId (= tenantId; key read by TokenCostControl), aiMode ('real'|'fake')
```

`context-middleware.ts` (path `/api/*`) reads the principal with `getAuthenticatedUser()`,
sets every key plus `MASTRA_RESOURCE_ID_KEY` (`tenantId:uid`) and, when present,
`MASTRA_THREAD_ID_KEY` (= conversation id). It overwrites any client-sent key. Agents
declare `requestContextSchema` so a missing key fails before the model runs.
`route-allowlist-middleware.ts` returns 404 for built-in groups the core does not use
(`/api/vectors/*`, `/api/tools/*` direct execution, `/api/v1/responses`, `/api/v1/conversations`,
stored agents), keeping `/api/agents/*`, `/api/memory/*` (read), `/api/workflows/*`,
`/api/schedules/*`, `/api/mcp/*`, `/api/observability/*`, `/api/datasets/*` and the core
custom routes.

## 5. Models, providers and `AI_MODE=fake`

### 5.1 Roles

| Role | Env key | Default (`real`) | Used by |
|---|---|---|---|
| `chat` | `AI_MODEL_CHAT` | `google/gemini-3.5-flash` | supervisor, subagents |
| `fast` | `AI_MODEL_FAST` | `google/gemini-3.5-flash-lite` | titles, summaries, LLM guardrail detectors |
| `reasoning` | `AI_MODEL_REASONING` | `google/gemini-3.5-flash` | action-agent planning (override to a stronger model per tenant) |
| `judge` | `AI_MODEL_JUDGE` | `google/gemini-3.5-flash` | LLM-judge scorers (real-mode evals only) |
| `embedding` | `AI_MODEL_EMBEDDING` | `google/gemini-embedding-001` with `outputDimensionality: 1536` | KB, memory recall |
| `transcription` | `AI_MODEL_TRANSCRIPTION` | `openai/gpt-transcribe` | voice (SP4) |
| `speech` | `AI_MODEL_SPEECH` | `openai/gpt-4o-mini-tts` | voice (SP4) |
| `realtime` | `AI_MODEL_REALTIME` | `openai/gpt-realtime-2.1` | optional realtime voice (SP4) |

Defaults follow `stacks/ai/gemini.md` (Vertex production default `gemini-3.5-flash`) and
`stacks/ai/openai.md` (transcription, realtime). Ids live in config only. `GOOGLE_AI_BACKEND`
= `ai-studio` (key `GOOGLE_GENERATIVE_AI_API_KEY`, local/dev) or `vertex` (ADC, remote;
`GOOGLE_VERTEX_LOCATION`). The factory builds AI SDK provider instances with keys from the
validated env (nothing reads `process.env`); Mastra model fallbacks (`model: [...]`) are
configured per role through `AI_MODEL_<ROLE>_FALLBACK` (optional). A role whose key is
missing in `real` mode fails the boot for text roles and disables the feature (flag) for
voice roles. Provider training opt-out and region pinning are documented per provider in
`app/docs/decisions` (governance "Terceirização de chamadas de IA").

### 5.2 Embedding dimension

One dimension for the whole v1: **1536** (`vector(1536)`, HNSW cosine). Changing the model
or dimension means `ai.chunks_v2` (contracts/pgvector.md §4). Memory recall uses the same
embedder.

### 5.3 `AI_MODE=fake`

- Allowed only when `APP_ENV` is `local` or `dev` (CI runs as `local`); the env schema
  rejects `fake` in `staging`/`prod`.
- `FakeLanguageModel` implements `LanguageModelV4` (not `ai/test`, which is a test util;
  the fake ships in `@core/agents` because dev and e2e run it) and is **scripted**: it reads
  the last user message and the available tool names, and picks a scenario:
  - explicit directive `[[fake:<scenario> <json?>]]` in the prompt (tests, e2e, evals);
  - otherwise keyword rules registered per agent (`fake-scenarios.ts`), e.g. a supervisor
    with `agent-knowledge` available delegates when the text asks a question; data-agent
    calls `listEntities` for "entities", `renderForm` for "create a …", etc.;
  - otherwise echoes a deterministic text built from the prompt hash.
  Scenarios emit real stream parts (`text-*`, `reasoning-*`, `tool-call`, `finish` with
  usage `{ inputTokens, outputTokens }` derived from character counts) so tracing, usage
  ledger, approvals and UI behave as with a provider. Streaming uses a fixed chunk size and
  no timers (`simulateReadableStream` with `chunkDelayInMs: 0`, or a configurable delay for
  e2e "stop" tests via `[[fake:slow]]`).
- Guardrail detectors in fake mode get a fake model that returns "clean" verdicts unless the
  text contains `[[fake:injection]]`, `[[fake:pii]]` or `[[fake:moderation]]`.
- `FakeEmbeddingModel`: tokens → hashed buckets (SHA-256 mod 1536), tf weighting,
  L2-normalized; similar texts share tokens, so retrieval is meaningful and deterministic.
- Fake voice: transcription returns `"fake transcript <n> bytes"`; speech returns a short
  valid silent WAV.

## 6. Agents

| Agent (key) | Role | Tools / subagents | Permission ceiling |
|---|---|---|---|
| `assistant` (supervisor) | entry point; plans, delegates, answers | subagents `knowledge`, `data`, `action`, `web` (only when tenant opted in) + tool `askUser`-style clarification via text | `agents.chat.use` |
| `knowledge` | answers from the KB with citations | `searchKnowledge` | `knowledge.document.read` |
| `data` | explains data structure, queries, renders forms | `listEntities`, `describeEntity`, `renderForm`, `querySemanticSql` | `catalog.entity.read`, `catalog.query.run` |
| `action` | executes contract commands after confirmation | command tools from modules (`command.<contractId>`) | union of command permissions declared by modules |
| `web` | web research | `webSearch`, `webScrape`, browser MCP toolset | `agents.web.use` |

Rules:
- Every agent has `description`, versioned `instructions` (`instructions/<agent>.v<N>.md`,
  loaded through `load-instructions.ts`; SP5 adds the store override), `defaultOptions:
  { maxSteps }` (supervisor 8, subagents 6), `requestContextSchema`, a guardrail profile and
  scorers with sampling (ratio 0.1 in real mode, 0 in fake mode).
- Effective permissions of a tool call = principal permissions ∩ agent ceiling ∩ tool
  permission (umbrella §4). `defineCoreTool` checks with SP1 `authorize()` — never with
  LLM output — before `execute`, fail-closed.
- User input is always a separate user message; instructions tell the model to treat tool
  results and retrieved text as data (rules/security.md §14).
- Modules add agents/tools/skills/workflows through `defineAgentModule()`; module agents can
  be registered as extra supervisor subagents when the tenant enables them.

## 7. Skills

Agent Skills are `SKILL.md` directories (frontmatter `name` = directory name, `description`;
validated with `validateSkillContent` in a unit test). Core skills in
`packages/agents/skills/`: `data-catalog` (how to explore the catalog and write safe SQL),
`knowledge-citations` (citation format), `safe-actions` (how to confirm and describe a
mutation). Module skills come from `AgentModule.skills` (paths inside the module package).
They are attached with the agent-level `skills` option (function of `requestContext`, so a
tenant only sees skills of modules it enabled). Workspaces are **not** used for skills (a
writable filesystem would add write/delete tools). The skill tools (`skill`, `skill_read`,
`skill_search`) are read-only.

## 8. Tools

### 8.1 `defineCoreTool`

```ts
defineCoreTool({
  id, description,                     // description says WHEN to use it
  kind: 'read' | 'mutation',
  permission,                          // <module>.<resource>.<action>
  inputSchema: z.strictObject(...),    // every field .describe()d
  outputSchema,
  execute: async (input, ctx) => ...,  // ctx.agent: AgentRequestContext (typed)
  preview?: async (input, ctx) => ({ before, after }),  // mutation only, feeds approval UI
  ui?: { component: string },          // generative UI component id (SP4 registry)
})
```

The wrapper: validates input (strict) and output; reads the typed context (missing key →
error, never a default tenant); calls `authorize({ principal, permission, resource: { tenantId,
projectId, nodeId } })`; for `kind: 'mutation'` sets `requireApproval: true` (user
confirmation is always required, umbrella §16.4), and when SP1 flags the permission as
`requiresApproval`, calls `ApprovalPort.requestApproval()` instead of executing (four eyes,
SP5; the SP3 adapter returns `{ status: 'unavailable' }` → tool result `APPROVAL_UNAVAILABLE`,
nothing executes); records an audit event (`agents.tool.executed`, with tool id,
permission, input hash, outcome) for every mutation and for SQL queries; opens a span
`gen_ai.tool.name`; enforces a per-call timeout (read 15 s, mutation 30 s) and propagates
`abortSignal`. Errors are typed (`code` SCREAMING_SNAKE) and returned to the model as tool
errors, never raw SDK messages.

### 8.2 Data catalog tools (umbrella §5 "Uso pela IA")

- `listEntities({ query?, kind?, limit≤50 })` and `describeEntity({ id })` read
  `app/docs/catalog/catalog.ai.json` (bundled at build) through `ai-catalog-reader.ts`:
  contracts whose `permission` the principal lacks are hidden; fields are shown per field
  pii (decision 0005): `sensitive` never exists in the AI catalog; `personal` fields are
  described (name, type, description) but their examples stay redacted. Output includes
  relations and UI hints.
- `renderForm({ contractId, mode: 'create'|'update', commandId, initialValues? })` does not
  write anything: it validates that `commandId` is a registered command bound to
  `contractId`, that the principal holds the command permission, filters `initialValues`
  through the schema, and returns `{ ui: { component: 'schema-form', props: { contractId,
  commandId, mode, initialValues } } }`. The chat renders `SchemaForm` from the same Zod
  schema (SP2 organism); the user's submission comes back as the tool output (SP4) and the
  agent then calls the command tool, which asks for confirmation.
- `querySemanticSql({ sql, params? })`: see §8.3.

### 8.3 Read-only SQL over semantic views (Postgres)

Pipeline (`sql-guard.ts` + `semantic-sql-runner.ts`, use case `runSemanticQuery`):
1. Parse with `libpg-query` (PG 18 grammar). Reject unless exactly one statement, a
   `SelectStmt` (incl. CTEs) with no `INTO`, no locking clause, no DML in CTEs.
2. Every `RangeVar` must be `semantic.<view>` and in the allowlist of views the principal
   may read (view registry: view name → contract id → permission). Function calls are
   restricted to an allowlist (aggregates, `date_trunc`, `coalesce`, comparison/string
   basics); `pg_*`, `set_config`, `current_setting`, `dblink`, `lo_*` and anything not
   listed are rejected. No literal `tenant_id` predicates are needed or trusted.
3. Rewrite: wrap as `SELECT * FROM (<sql>) q LIMIT <n>` with `n = min(requested, 1000)`,
   default 100.
4. Execute in a transaction: `BEGIN READ ONLY; SET LOCAL statement_timeout = '5s';
   SET LOCAL ROLE semantic_reader; SELECT set_config('app.tenant_id', $1, true),
   set_config('app.node_ids', $2, true);` then the query with bound params only. Views are
   owned by `semantic_owner` (no `BYPASSRLS`), base tables have `FORCE ROW LEVEL SECURITY`
   by `app.tenant_id`/`app.node_ids`; a missing setting returns zero rows (umbrella §16.4).
5. Result `{ columns, rows, rowCount, truncated }`, cells that map to `personal` fields are
   returned only to principals with the contract read permission; audit event
   `catalog.query.executed` with the SQL fingerprint.

The runtime user can `SET ROLE semantic_reader` (granted `semantic_reader` to the app role).
Views are generated by `pnpm contracts:catalog` (SP0 artifact "views SQL semânticas") into
`app/infra/postgres/semantic/*.sql` and applied by migrations. The core ships one sample
view (`semantic.example_notes`) over an `example` Postgres table only if SP2's example
module keeps notes in Postgres; otherwise the SQL tool is tested against a test-only
fixture table created in `*.postgres.test.ts`.

**BigQuery stays fail-closed.** `bigquery-semantic-sql.ts` returns `CONNECTOR_DISABLED`.
The isolation design, for a later SP, is recorded in the decision: datasets
`<context>_semantic` exposing only table functions `(<tenant_id STRING>, …)`; the server
injects the tenant; the AST (BigQuery parser) rejects direct table references and tenant
literals; `maximumBytesBilled` hard cap from one helper + dry-run approval threshold at half
the cap (rules/governance.md "Custo").

### 8.4 Contract-derived mutation tools

A module declares commands in its `AgentModule`:

```ts
defineAgentModule({ id: 'example', commands: [{ contract: CreateNoteCommandContract,
  targetContract: NoteContract, handler: createNoteUseCase, preview: previewCreateNote }] })
```

`command-tools.ts` turns each into `command.<contractId>` with the contract's schema as
`inputSchema` (strict), its `description` and `permission` (both required by
`defineContract`; a command contract without `permission` is a boot error). Execution goes
through the same use case and `authorize()` as the UI (`/v1`). The handler receives
`{ principal, input, idempotencyKey }` where the key is derived from `runId:toolCallId` so a
retried approval cannot execute twice.

### 8.5 Knowledge and web tools

- `searchKnowledge({ query, namespaces?, topK≤8 })` → `{ results: [{ citationId, documentId,
  title, sourceUrl?, snippet, score }] }`; tenant and allowed namespaces come from context
  (never from the model); results with score < 0.3 dropped; optional `rerank` (fast model)
  behind `AI_KB_RERANK=true`.
- `webSearch({ query, limit≤5 })`, `webScrape({ url })` via Firecrawl SDK; `url-guard.ts`
  rejects non-https, IP literals, private/loopback/link-local ranges after DNS resolution,
  and non-default ports; output markdown capped at 20 000 chars, wrapped as untrusted data.
  Only registered when the tenant setting `webTools.firecrawl` is on and a key exists
  (platform `FIRECRAWL_API_KEY` or tenant BYO key in `SecretStore`). Fake mode returns
  fixture pages.
- Browser: a tenant-level MCP connector of type `browser` pointing at a Playwright MCP
  server (`@playwright/mcp`, run as a separate service with `--headless --isolated`); off by
  default; every browser tool requires approval. `@mastra/agent-browser` is not adopted (§14).

## 9. Connectors and MCP

Firestore `connectors/{autoId}`: `tenantId`, `type` (`openapi`|`mcp`|`postgres`|`browser`),
`name`, `status`, `config` (per type), `secretRef` (never the secret), `toolPolicy`
(`{ allow: string[], readOnly: string[] }`), `createdBy`, timestamps. Secrets through
`SecretStore` port: Secret Manager (`connector-<tenantId>-<connectorId>`, remote) or local
adapter (Firestore emulator collection `local-secrets`, refused outside `local`).

- **OpenAPI → tools** (`openapi-to-tools.ts`): parse OpenAPI 3.0/3.1 (`@apidevtools/swagger-parser`
  13.1.0, dereference), one tool per allowed `operationId` (`api.<connector>.<operationId>`),
  input = the operation's JSON Schema (params + body) converted with `z.fromJSONSchema`
  (Zod 4.6; the task checks it exists in the installed version, else validates with `ajv` 8
  after the dependency review of rules/governance.md) and wrapped as `z.strictObject`;
  `GET`/`HEAD` = read, others = mutation (approval). Requests only to the spec's `servers`
  hosts (`allowedHosts`), https only, auth header from `SecretStore` (bearer or API key),
  timeout 15 s, response body capped at 100 KB.
- **MCP client** (`mcp-connector.ts`): one `MCPClient` per tenant connector with stable
  `id` (`<tenantId>:<connectorId>`), `url` (Streamable HTTP; stdio only in `local`),
  `allowedHosts` (required), `requestInit.headers` from `SecretStore` or
  `authProvider: MCPOAuthClientProvider` (OAuth; tokens stored via `SecretStore`),
  `requireToolApproval` = true unless the tool is in `toolPolicy.readOnly`, `timeout` 30 s.
  Tools are passed per call as `toolsets` (cached 5 min per tenant, `disconnect()` on
  eviction). MCP output is treated as untrusted.
- **Postgres read-only connector** (tenant-owned external database): same `sql-guard` with a
  connector-level allowlist of tables/views, `READ ONLY` + `statement_timeout`; allowed only
  for databases the tenant owns (no RLS across tenants is possible there).
- **Core MCP server** (`core-mcp-server.ts`): `new MCPServer({ id: 'core', tools:
  { listEntities, describeEntity, searchKnowledge, querySemanticSql }, agents: { assistant },
  resources: catalog entries the principal may read, requestState: { key: env.MCP_REQUEST_STATE_KEY } })`.
  Public entry `POST /v1/mcp` (web route) authenticates an API key (`service` principal,
  SP1) or a user Bearer, then the gateway proxies to Mastra `/api/mcp/core/mcp`. Mutation
  tools are not exposed over MCP in v1.

## 10. Memory

`create-memory.ts`: `new Memory({ storage, vector: PgVector(schema 'mastra'), embedder,
options: { lastMessages: 20, semanticRecall: { topK: 4, messageRange: 1, scope: 'resource' },
workingMemory: { enabled: true, scope: 'resource', schema: WorkingMemorySchema },
generateTitle: { model: fast } } })`. `WorkingMemorySchema` holds only preferences
(language, tone, recurring goals), never secrets; `pii: personal`.

Isolation: `resourceId = tenantId:uid` (server-set), `threadId = conversationId` (Firestore
auto id, SP4). A user in two orgs gets two resources. Test: two tenants, same uid → recall
and working memory never cross (`*.postgres.test.ts`).

Observational Memory: **off** by default (`AI_MEMORY_OBSERVATIONAL=false`). Task 22 runs a
comparative eval (semantic recall vs OM, same dataset, cost + score) only when real keys
exist; otherwise it records "not run" and OM stays off (umbrella §7, §14 item 6).

## 11. Knowledge base

Tables (app-owned, contracts/pgvector.md §1–§12, Drizzle migrations):

```
ai.documents(id uuid pk uuidv7(), tenant_id text not null, namespace text not null,
  source text check in ('upload','url','catalog','module'), source_ref text not null,
  title text, source_url text, mime_type text, content_hash text not null,
  status text check in ('pending','ready','failed','deleted'), metadata jsonb,
  created_by text, created_at, updated_at, unique(tenant_id, source, source_ref))
ai.chunks_v1(id uuid pk uuidv7(), document_id uuid fk cascade, tenant_id text, namespace text,
  chunk_index int, text text, token_count int, embedding vector(1536),
  embedding_model text, embedding_version text, metadata jsonb, created_at,
  unique(document_id, chunk_index))
indexes: (tenant_id, namespace), document_id, HNSW (embedding vector_cosine_ops) m=16 ef_construction=64
RLS: FORCE; policy tenant_id = current_setting('app.tenant_id', true) OR tenant_id = '_platform'
```

- `tenant_id text`: tenants are Firestore automatic ids, not uuids (D3-08). `_platform` is a
  reserved tenant id for platform content (catalog, module docs), readable by every tenant.
- Namespaces: `tenant`, `project:<projectId>`, `catalog`, `module:<moduleId>`. The search
  tool allows `tenant`, the active `project:*`, `catalog` and enabled `module:*`.
- Ingestion workflow `knowledge-ingest` (Mastra workflow, `retryConfig { attempts: 3, delay: 2000 }`):
  `resolve-source` (file from Storage via `files` context | URL via Firecrawl scrape |
  catalog entries | module docs) → `extract-text` (text/markdown/html/csv directly; PDF via
  Firecrawl `parse` only when configured, otherwise `UNSUPPORTED_MEDIA`) → `chunk`
  (`MDocument`, `recursive`/`markdown`, `maxSize` 512 tokens-ish chars 2000, overlap 200) →
  `embed` (`embedMany`, batches of 64) → `store` (transaction: upsert document by
  `(tenant_id, source, source_ref)`, replace chunks, status `ready`) → `emit`
  (`KNOWLEDGE_DOCUMENT_INDEXED` event + audit). Idempotent by `content_hash`.
- `catalog-reindex` workflow: reads `catalog.ai.json`, one document per contract in
  namespace `catalog`, tenant `_platform`; run at deploy/seed and on demand (SP5 schedules).
- Citations: `citationId = kb:<documentId>#<chunkIndex>`. Instructions require a marker per
  claim; `citation-guard.ts` (output processor) checks cited ids ⊆ this turn's retrieved ids,
  strips unknown ones and sets message metadata `confidence: 'low'` when an answer from the
  knowledge agent has no valid citation (SP4 shows "sem certeza").
- `/v1/knowledge/documents` (list, get, delete), `/v1/knowledge/sources` (`POST` with
  `{ kind: 'file', fileId } | { kind: 'url', url }` → 202 `{ data: { runId } }`),
  permissions `knowledge.document.read|write|delete`.

## 12. Guardrails, budgets and usage

Default profile (`guardrail-profile.ts`), per agent, tenant-tunable in `agent-settings`:

| Stage | Processor | Config |
|---|---|---|
| input | `UnicodeNormalizer` | default |
| input | `PromptInjectionDetector` | model `fast`, `strategy: 'block'`, `threshold: 0.8`, `errorStrategy: 'strict'` |
| input | `ModerationProcessor` | model `fast`, `strategy: 'block'`, `errorStrategy: 'strict'` |
| input | `PIIDetector` | model `fast`, `strategy: 'warn'` (default) or `'redact'` per tenant; `lastMessageOnly: true` |
| input | `TenantBudgetGuard` (own) | hard monthly cap from `usage.tenant_budgets`, fail-closed |
| input | `TokenLimiterProcessor` | `limit` 60 000 input tokens, `trimMode: 'best-fit'` |
| input | `TokenCostControl` | only if Task 16 shows `PostgresStoreVNext` metrics work: `scope: 'organization'`, `window: '24h'`, `maxCost` = daily soft cap, `strategy: 'warn'`, `warnAtPercent: 80` |
| output | `SystemPromptScrubber` | model `fast`, `strategy: 'redact'` |
| output | `CitationGuard` (own) | knowledge agent only |

Detectors run on the supervisor only (subagents receive supervisor-generated prompts);
tool outputs from web/MCP/OpenAPI are wrapped as data and scanned by
`PromptInjectionDetector` in `warn` mode through `processToolResult` when the tool is
external. Tripwires reach the stream as `tripwire` chunks (SP4 renders them).

Budgets (rules/governance.md "Custo"): **hard cap** = `TenantBudgetGuard` (monthly
micro-USD and token cap per tenant from the plan; checked before each run; `maxOutputTokens`
per call 4 096); **approval/alert threshold** = 80 % of the cap (alert via notifications in
SP5), never equal to the cap. Caps read from one helper (`usage/budget-policy.ts`); invalid
config falls back to the safe default (plan default), never "no cap".

Usage ledger: `UsageLedgerExporter` (a Mastra observability exporter) receives
`MODEL_GENERATION` spans with usage and writes `usage.llm_calls` (`id uuidv7`, `request_id`,
`trace_id`, `tenant_id`, `user_id`, `agent_id`, `provider`, `model`, `input_tokens`,
`output_tokens`, `cached_tokens`, `cost_micro_usd bigint null`, `latency_ms`,
`finish_reason`, `occurred_at`) in batches; cost from `model-prices.ts` (missing price →
`null` + `usage_price_missing` warn; budget then counts tokens). BigQuery sink
(`ai_observability.llm_calls`, contracts/bigquery.md §14) through the `UsageSink` port:
BigQuery adapter outside `local`, no-op + log in `local`; the export runs from SP5's usage
report workflow. Metrics: `ai_tokens_total{model,direction}`, `ai_cost_micro_usd_total{model}`,
`ai_tripwires_total{processor}`, `ai_tool_approvals_total{outcome}`, TTFT histogram.

## 13. Observability and evals

- `create-observability.ts`: `MastraStorageExporter` always (Studio, `/admin` traces);
  `OtelExporter` with `provider.custom { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  protocol: 'http/protobuf' }` when set (Cloud Trace OTLP endpoint outside `local`);
  `UsageLedgerExporter`; `spanOutputProcessors: [new SensitiveDataFilter({ sensitiveFields:
  [...defaults, 'idToken', 'cookie', 'x-serverless-authorization'] })]` (the list replaces
  the defaults, so defaults are copied explicitly); `requestContextKeys: ['tenantId',
  'projectId', 'requestId', 'conversationId']`; sampling `always` in local/dev, ratio 0.2
  elsewhere. `trace-context.ts` parses `traceparent` and passes `tracingOptions.traceId` /
  `parentSpanId` on every `stream`/`generate`/workflow start; logs get `trace_id` via
  `loggerOptions.correlation`.
- Scorers (`createScorer`, registered in `new Mastra({ scorers })`): deterministic
  `tool-routing` (expected tool/subagent called), `citations-grounded`, `tenant-leak`
  (output never contains another tenant's fixture markers), `format-compliance`; LLM
  `faithfulness-judge` (judge role; real mode only).
- Datasets: `evals/datasets/<agent>.v1.jsonl` (10–30 cases each: input, expected tool,
  expected citations, groundTruth). Seeded into `mastra.datasets` (versioned) by
  `pnpm evals:seed`. Runner: Vitest 5 project `evals` (`*.eval.test.ts`) calling `runEvals`
  with `target: mastra.getAgent(id)`, thresholds and gates; `pnpm evals` (fake mode) is a CI
  job; the gate compares mean score per scorer to `evals/baselines/<agent>.json`
  (`minimum`, `tolerance`); `pnpm evals:real` runs the same sets with real models plus the
  judge (manual/nightly, needs keys). Results: Mastra experiments (Studio, `/admin`) and a
  JSON report in `app/.evals/`; SP5 exports runs to BigQuery `ai_observability.eval_runs`.

## 14. Mastra feature coverage

| Mastra feature | Decision |
|---|---|
| Agent class, dynamic instructions/model/tools, `requestContextSchema`, `defaultOptions.maxSteps` | adopted (§6) |
| Supervisor + subagents, delegation hooks | adopted; `onDelegationStart` enforces tenant web opt-in (§6) |
| `.network()` / `networkRoute` | not adopted: deprecated (D12) |
| Structured output (`structuredOutput`) | adopted in workflows steps and scorers |
| Tool approval (`requireApproval`, approve/decline) | adopted (§8.1); SP4 UI |
| Tool `suspend`/`resumeStream`, `askUserTool` | `suspend` adopted for four-eyes pending (SP5); `askUserTool` not adopted (clarification is plain text) |
| Tool hooks `beforeToolCall`/`afterToolCall` | not adopted: authorize/audit/span live in `defineCoreTool`, one place for core and module tools |
| `writer.custom` data parts | adopted for workflow progress and generative UI (SP4) |
| Background tasks (`background` tools) | not adopted in v1: long work runs as workflows |
| Thread signals / `sendMessage`/`queueMessage` | not adopted in v1 (single-turn chat); revisit with channels |
| Agent Skills (`skills`, `createSkill`, SKILL.md) | adopted (§7) |
| Workspace / sandboxes / code mode / coding agent | not adopted: out of scope (umbrella §15 "sandboxes") |
| Browser (`@mastra/agent-browser`, stagehand, browser-firecrawl) | not adopted: 0.x packages pinned behind upstream (agent-browser 0.19 vs 0.38, stagehand 3 vs 4); browser via Playwright MCP connector |
| MCPClient (http, `allowedHosts`, OAuth, approval) | adopted (§9) |
| MCPServer (tools, agents `ask_*`, resources, `requestState`) | adopted (§9); workflows `run_*` exposed in SP5 |
| A2A / ACP | not adopted in v1 (no consumer) |
| Memory: history, semantic recall, working memory, `generateTitle` | adopted (§10) |
| Observational Memory | behind flag; comparative eval (Task 22) |
| Memory processors `TokenLimiterProcessor`, `ToolCallFilter` | `TokenLimiterProcessor` adopted; `ToolCallFilter` adopted on subagents (drops old tool payloads) |
| `@mastra/rag` MDocument, chunking, `rerank` | adopted (§11) |
| `createVectorQueryTool` / `createGraphRAGTool` / PgVector for KB | not adopted: tenant filter must be server-injected and tables follow contracts/pgvector.md; PgVector adopted for memory recall only |
| Processors: normalizer, injection, PII, moderation, scrubber, token limiter | adopted (§12) |
| `TokenCostControl` | conditional on metrics store (Task 16); hard cap is own `TenantBudgetGuard` |
| `LanguageDetector`, `RegexFilterProcessor`, `ResponseCache`, `ModelSelectionProcessor` | `RegexFilterProcessor` adopted for secret-shaped strings on output; others not adopted in v1 (no multilingual routing requirement; caching risks cross-user answers) |
| Model router strings + fallbacks | adopted via factory (§5) |
| Workflows (`createWorkflow`, retries, branch, parallel, foreach, suspend/resume) | adopted: ingest/reindex here; HITL and schedules in SP5 |
| Schedules (`mastra.schedules`, declarative `schedule`) | SP5 |
| Scorers `createScorer`, `runEvals`, gates, datasets, experiments, trace scoring | adopted (§13) |
| `@mastra/evals` prebuilt scorers / checks / vitest matchers | not adopted: E4 |
| Observability, `SensitiveDataFilter`, `OtelExporter`, `requestContextKeys` | adopted (§13) |
| `PostgresStoreVNext` (metrics) | evaluated in Task 16 |
| Exporters Langfuse/Braintrust/etc. | not adopted: OTLP to Cloud Trace covers v1 |
| Auth: custom `MastraAuthProvider`, `mapUserToResourceId`, reserved keys | adopted (§4) |
| `@mastra/auth-firebase` | not adopted (umbrella §16.2) |
| Server middleware, `registerApiRoute`, `chatRoute` | adopted (SP3 middleware; SP4 chat route) |
| `@mastra/client-js` | adopted in `MastraGateway` |
| `@mastra/ai-sdk` (`version: 'v7'`) | SP4 |
| Durable agents, resumable `observe`, PubSub (`GoogleCloudPubSub`) | SP4 spike decides for chat; PubSub: `EventEmitter` local, `GoogleCloudPubSub` outside local (SP3 wiring, Task 21) |
| Workers split (`MASTRA_WORKERS`) | not adopted: one Mastra service (umbrella §16.3) |
| Voice (`CompositeVoice`, providers) | SP3 builds `create-voice.ts`; SP4 exposes routes |
| Editor (`@mastra/editor`), stored agents | not adopted: 0.x, docs contradict on activation, edits tools/MCP too broadly; SP5 own prompt store |
| Studio | local only (umbrella §16.3) |
| Channels, Agent Builder, Inngest/Temporal runners, Mastra platform | not adopted: out of scope |
| Storage retention `prune()` | SP5 (retention job once compliance.md is filled; noted) |

## 15. Environment variables added (Mastra app unless noted)

`AI_MODEL_CHAT|FAST|REASONING|JUDGE|EMBEDDING|TRANSCRIPTION|SPEECH|REALTIME` (+ `_FALLBACK`),
`GOOGLE_AI_BACKEND`, `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`,
`FIRECRAWL_API_URL`, `AI_MEMORY_OBSERVATIONAL`, `AI_KB_RERANK`, `MCP_REQUEST_STATE_KEY`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, `MASTRA_PUBSUB` (`memory`|`gcp`), `MASTRA_STORAGE_INIT`
(`auto`|`skip`), `USAGE_SINK` (`none`|`bigquery`), `BIGQUERY_DATASET_AI_OBSERVABILITY`.
Web (`/v1`): `MASTRA_URL`, `MASTRA_AUDIENCE` (remote). `.env.example` gets placeholders.

## 16. Decisions to record in `app/docs/decisions/` (next free numbers at execution)

| Id | Decision |
|---|---|
| D3-01 | `@core/agents` layout, `defineAgentModule()` and `composeAgentRuntime()`; modules reach Mastra only through `APP_MODULES` in `apps/mastra`. |
| D3-02 | Typed `AgentRequestContext` built server-side by middleware from the verified principal; client context ignored; header names in `@core/contracts`. |
| D3-03 | Own `FirebaseMastraAuth` with Bearer-only, checkRevoked on POST, `mapUserToResourceId` via `super()`; route allowlist middleware. |
| D3-04 | Model roles, env keys and defaults (Gemini text/embedding, OpenAI voice); keys only from validated env; fallbacks optional. |
| D3-05 | `AI_MODE=fake` scripted LanguageModelV4 + hashed embeddings + fake voice, allowed only in `local`/`dev`. |
| D3-06 | Embedding dimension 1536 for v1 (`gemini-embedding-001` with `outputDimensionality`). |
| D3-07 | KB tables owned by the app (`ai.documents`, `ai.chunks_v1`, RLS); Mastra PgVector only for memory recall. |
| D3-08 | `tenant_id text` in Postgres (Firestore ids) and reserved `_platform` tenant; deviation from contracts/pgvector.md `uuid`. |
| D3-09 | Drizzle ORM + drizzle-kit SQL migrations in `app/infra/postgres/migrations`, `pnpm db:migrate`; Mastra schema via explicit `storage.init()` step and `disableInit` outside local (follow-up 1). |
| D3-10 | Semantic SQL guard with `libpg-query` AST, view/function allowlist, read-only txn, 5 s, LIMIT 100/1000, RLS settings; BigQuery fail-closed with recorded isolation design. |
| D3-11 | Contract-derived command tools: user confirmation always; `requiresApproval` → four-eyes through `ApprovalPort` (fail-closed until SP5); idempotency key `runId:toolCallId`. |
| D3-12 | Guardrail profile with `errorStrategy: 'strict'`; own `TenantBudgetGuard` as hard cap; `TokenCostControl` only as soft signal when metrics exist. |
| D3-13 | Usage ledger via observability exporter into `usage.llm_calls`; BigQuery via `UsageSink`; price table with verification date. |
| D3-14 | Connectors in Firestore, secrets via `SecretStore` (Secret Manager / local emulator adapter); OpenAPI tools with host allowlist; MCP client with `allowedHosts` + approval by default; stdio only local. |
| D3-15 | Core MCP server at `/v1/mcp` → Mastra `/api/mcp/core/mcp`; read tools only in v1. |
| D3-16 | Firecrawl SDK (`firecrawl` package) with SSRF guard and tenant opt-in; browser through Playwright MCP connector, `@mastra/agent-browser` not adopted. |
| D3-17 | New backend contexts `files`, `catalog`, `agents` (added to umbrella §3 list). |
| D3-18 | Evals: own scorers + `runEvals` in Vitest 5 project `evals`, JSONL datasets seeded into Mastra datasets, baseline + tolerance gate in CI (fake), real-mode nightly. |
| D3-19 | Memory defaults (`lastMessages` 20, recall topK 4 resource scope, working memory schema, OM off pending eval). |
| D3-20 | `mastra build` output pin check (follow-up 2) and Cloud SQL socket DSN support (follow-up 3). |
| D3-21 | Skills attached per agent (no Workspace) to avoid write tools. |

## 17. Follow-ups resolved here

| SP0 follow-up | Resolution |
|---|---|
| #1 PostgresStore auto-init | `MASTRA_STORAGE_INIT=skip` outside local → `disableInit: true`; `pnpm -F @core/mastra db:init` runs `storage.init()` with a DDL role in deploy; runtime role gets DML only (Task 3). |
| #2 nested `pnpm install` in `mastra build` | `scripts/check-mastra-output.ts` fails the build when `.mastra/output/package.json` resolves a version different from the workspace lockfile for any shared dep, and runs `pnpm audit --prod` there; decision records why vendoring was rejected (Task 23). |
| #3 Cloud SQL socket DSN | `DATABASE_URL` accepts `postgresql://user@/db?host=/cloudsql/<instance>` (path ≤ 108 chars) in non-local envs (Task 3). |
| #12 a, b, d, e | Tasks 5 and 6; 12c regression test in Task 5. |
