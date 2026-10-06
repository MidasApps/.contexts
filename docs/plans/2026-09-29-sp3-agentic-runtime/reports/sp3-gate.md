# SP3 gate — Agentic runtime (Mastra)

Plan `docs/plans/2026-09-29-sp3-agentic-runtime.md` (Tasks 28–29). Spec
`docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md` (below "spec"). Umbrella
`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §13. Date 2026-09-30.
Branch `feat/agentic-app-core-sp0`. The plan names this file `sp3-summary.md`; the coordinator
asked for `sp3-gate.md`, and this is the one summary.

**Verdict: gate met.** Task 19 landed on 2026-10-01 (module commands and the example module,
`reports/task-19.md`, §8.1). Observational Memory is still not measured with real models (no
provider keys).

## 1. Umbrella §13 gate

> SP3 Runtime agêntico — "integração com `AI_MODE=fake`; eval set mínimo; isolamento de
> memória por tenant".

| Gate item | Evidence | Fresh result (§8) |
|---|---|---|
| Integration with `AI_MODE=fake` | `app/apps/mastra/src/mastra/sp3-gate.emulator.test.ts` (+ `sp3-gate.fixture.ts`): the production composition `createAgentRuntime` with its real Postgres adapters (Mastra storage and memory, knowledge base, usage ledger), Auth Emulator tokens, the Firestore emulator (audit, projects) and fake models, served by Mastra's Node server. Also `runtime.emulator.test.ts` (ping, supervisor delegation, conversation auto-create, MCP) and SP4's `chat-routes.emulator.test.ts`. | 7 / 7 passed |
| Minimal eval set per core agent | `app/packages/agents/evals/datasets/{assistant,knowledge,data,action}.v1.jsonl` (18/12/11/10 cases), baselines in `evals/baselines/*.json`, `src/evals/*.eval.test.ts`, CI job `evals` (`.github/workflows/app-ci.yml`) | `pnpm evals` all verdicts passed (§8) |
| Memory isolation per tenant | Gate test (4): one person (same uid) in two organizations; B's knowledge search runs but never returns A's passages or fact; B gets 403 on A's thread messages and on continuing A's conversation; B's thread list has no A thread. `packages/agents/src/memory/memory-isolation.postgres.test.ts`: semantic recall and working memory stay in tenant A. `postgres-knowledge-repository.postgres.test.ts` and `knowledge-agent.postgres.test.ts`: RLS on `ai.chunks_v1`. `leak-detection.eval.test.ts`: the gate fails when the tenant filter is dropped. | passed |

Gate suite scenarios (plan Task 29 list):

| # | Scenario | Assertion |
|---|---|---|
| 1 | Supervisor answers a KB question with citations through `/api/agents/assistant/stream` | delegation to `agent-knowledge`; every `kb:` citation in the stream is `kb:<tenant A document id>#n` |
| 2 | Data agent over the catalog | delegation to `agent-data`, `catalog.listEntities` result in the stream |
| 3 | Action command requires approval and writes audit | `tool-call-approval` chunk; `approve-tool-call` runs `command.tenancy.CreateProjectInput` with the requested name; Firestore `audit-logs` has `AGENT_TOOL_EXECUTED` for tenant A |
| 4 | Memory + KB isolation between tenants | see above |
| 5 | Tripwire on `[[fake:injection]]` | `tripwire` chunk, no tool call |
| 6 | Usage row per model call | ≥ 5 `usage.llm_calls` rows for the run's request id (entry detectors + supervisor + knowledge steps), all with the caller's uid and input tokens > 0, none under tenant B (read as `usage_runtime`, RLS) |
| 7 | `/api/vectors/*` | 404 |

**Scoping of (2).** `apps/mastra` registers no semantic view yet (`createSemanticViewRegistry([])`
in `create-runtime-ports.ts`; views come from modules), and the fake supervisor strips
directives before delegating, so the gate suite proves `listEntities` only. Tenant scoping of
`sql.querySemanticSql` is proven by `packages/services/src/services/catalog/adapters/driven/postgres-semantic-runner.postgres.test.ts`
(RLS settings, `semantic_reader`, timeout) and the 49-case AST guard in `sql-guard.test.ts`.

The gate suite needs Postgres as well as the emulators, so the CI job `emulators` now has the
pgvector service container, the init scripts and `pnpm db:migrate`.

## 2. Spec §1 scope → evidence

| Item | Where | Tests | Task / commit |
|---|---|---|---|
| Agents: supervisor + subagents | `packages/agents/src/agents/{supervisor,knowledge,data,action,web,ping}-agent.ts` | `supervisor.integration.test.ts`, `web-opt-in.test.ts`, gate (1)–(3) | 20 `0ffe099` |
| Skills | `packages/agents/skills/*/SKILL.md`, `src/skills/resolve-skills.ts` | `src/skills/skills.test.ts` | 15 `928cbe6`, 20 |
| Tools: catalog | `src/tools/catalog/{list-entities,describe-entity,render-form}.tool.ts` | tool tests, gate (2) | 10 `d69cc79` |
| Tools: semantic SQL | `src/tools/sql/query-semantic-sql.tool.ts`, `services/catalog` | `sql-guard.test.ts`, `postgres-semantic-runner.postgres.test.ts` | 11 `0b1f606`, fix `7cf02dc` |
| Tools: contract-derived mutations | `src/tools/commands/*`, `define-core-tool.ts`, `core-tool-pipeline.ts` | pipeline tests, `command-tools.test.ts`, gate (3), `module-commands.emulator.test.ts` | 9 `7783da1`, 20, fix `aa8a742`, 19 (one command registry; module commands) |
| Tools: knowledge, web | `src/tools/knowledge/search-knowledge.tool.ts`, `src/tools/web/*` | tool tests, gate (1) | 15, 23 `26b968f` |
| Memory | `src/memory/create-memory.ts` | `memory-isolation.postgres.test.ts`, gate (4) | 18 `09d0bf1` |
| Knowledge base (RAG) | `services/knowledge`, `src/knowledge/*`, migrations 0003–0005 | repository + workflow Postgres tests, `knowledge-agent.postgres.test.ts` | 12 `ba823e4`, 13 `db44008`, 14 `36a8b9b`, 15 |
| Connectors DB / OpenAPI / MCP client | `src/connectors/*`, `services/connectors` | connector tests | 21 `c1099c8`, 22 `878cf36` |
| Core MCP server | `src/mcp-server/core-mcp-server.ts`, web `/v1/mcp` | `runtime.emulator.test.ts` MCP case | 24 `9331591` |
| Guardrails | `src/processors/{guardrail-profile,tenant-budget-guard,citation-guard}.ts` | processor tests, gate (5) | 16 `f65a2cf`, 17 `a48105a` |
| Token/cost accounting | `src/observability/usage-ledger-exporter.ts`, `services/usage`, migrations 0006–0007 | `postgres-usage-repository.postgres.test.ts`, gate (6) | 16 |
| Tracing | `src/observability/{create-observability,span-export-policy,trace-context}.ts` | observability tests, `runtime.emulator.test.ts` spans | 17 |
| Evals + CI gate | `src/scorers/*`, `src/evals/*`, `evals/` | `pnpm evals` | 27 `5bdb862` |
| Mastra auth provider | `src/auth/firebase-mastra-auth.ts`, `route-allowlist-middleware.ts`, `context-middleware.ts` | `firebase-mastra-auth.emulator.test.ts`, gate (7) | 6 `2f42755`, 7 `fe6b665`, fix `0b68d04` |
| `/v1 → Mastra` gateway | `services` `MastraGateway` | gateway tests | 8 `18457dd` |
| Contracts | `packages/contracts` agent/knowledge/connector/usage/file contracts | `pnpm contracts:check` | 4 `7caa664` |
| Offline (`AI_MODE=fake`) | `src/models/fake/*` | every suite above | 5 `8061ab2`, fix `944bc17` |
| Voice (for SP4) | `src/voice/*` | voice tests | 26 `0c28020` |
| PubSub + Mastra build pins | `src/runtime/create-pubsub.ts`, `apps/mastra/scripts/check-mastra-output.ts` | `pnpm -F @core/mastra build` | 25 `89c28a0` |
| Observational Memory comparison | `src/evals/memory-comparison.ts` | fake run only | 28 (see `om-comparison.md`) |

## 3. Decisions D3-01 … D3-21

| Id | ADR | Implemented by |
|---|---|---|
| D3-01, D3-02, D3-17 | 0019 | Tasks 1, 7, 20 (layout, `defineAgentModule`, `AgentRequestContext`, new contexts files/catalog/agents) |
| D3-03 | 0020 | Task 6 + fix `0b68d04` |
| D3-04, D3-05 | 0021 | Tasks 1, 5 + fixes `944bc17`, `723bf13` |
| D3-06, D3-07, D3-08 | 0022 | Tasks 12–15 (1536 dims; app-owned KB tables; `tenant_id text` + `_platform`) |
| D3-09, D3-20 | 0023 | Tasks 2, 3, 25 |
| D3-10 | 0024 | Task 11 |
| D3-11 | 0025 | Tasks 9, 20, fix `aa8a742`, Task 19 (command registry, module commands) |
| D3-12, D3-13 | 0026 | Tasks 16, 17 (`TokenCostControl` probed, kept off) |
| D3-14, D3-15, D3-16 | 0027 | Tasks 21–24 |
| D3-18 | 0028 | Task 27 |
| D3-19, D3-21 | 0029 | Tasks 18, 20, 28 |

## 4. Origin prompt coverage (`docs/prompts/2026-09-29-agentic-app-core-harness.md`)

SP3 covers prompt items 1, 2, 5, 6, 7, 8, 13 and the AI half of "Contratos de dados" (spec
header); item 9 only through the voice runtime (chat is SP4).

| Prompt item | SP3 coverage | Gaps / owner |
|---|---|---|
| 1 Agents and skills: multi-agent, skills, tools | Supervisor + 4 subagents, core skills, tool registry with read/mutation, approval and audit | Module commands, skill and workflow of the example module: Task 19, done |
| 2 Memory short/long + vector KB | Thread history, semantic recall, working memory (resource `tenantId:uid`), pgvector KB with ingestion (upload, URL, catalog), namespaces, citations | Observational Memory not measured (follow-up #37); module namespaces wait for SP5 agent settings |
| 5 Connectors: DB, APIs, MCP client and server | Postgres read-only, OpenAPI (JSON), MCP http (+ stdio local), core MCP server at `/v1/mcp` | MCP OAuth and YAML specs (follow-up #27); workflows over MCP in SP5 |
| 6 Tools for AI: Firecrawl, browser | Firecrawl search/scrape with SSRF guard and tenant opt-in; browser through the Playwright MCP connector | `@mastra/agent-browser` not adopted (0.x, D3-16) |
| 7 Evals: scorers, datasets, experiments, CI gates | Own scorers, versioned JSONL sets, Mastra datasets (`evals:seed`), `runEvals` gate in CI, real mode with judge | Real runs need keys (nightly/SP5); BigQuery export of eval runs in SP5 |
| 8 Logs, tracing, token costs | Mastra storage traces, OTLP export, `SensitiveDataFilter`, per-call usage ledger with cost, BigQuery sink | Voice calls bypass the ledger (follow-up #29); dashboards in SP5 `/admin` |
| 9 Chat (voice part) | `createVoice` + `/voice/*` routes | Chat itself is SP4 |
| 13 Other Mastra features | See §5 | — |
| "Contratos de dados" (AI use) | `catalog.ai.json` read by `listEntities`/`describeEntity`/`renderForm`, semantic SQL, contract-derived commands through the same schemas and `authorize()` | No semantic view registered until a module adds one |

Not SP3: items 3 (SP1), 4 (SP5), 10–12 (SP1/SP2), the chat UI (SP4).

## 5. Mastra feature coverage (spec §14)

| Mastra feature | Status | Where / reason |
|---|---|---|
| Agent class, dynamic instructions/model/tools, `requestContextSchema`, `maxSteps` | adopted | `src/agents/*-agent.ts` |
| Supervisor + subagents, delegation hooks | adopted | `supervisor-agent.ts` (`onDelegationStart` re-checks tenant settings, web opt-in) |
| `.network()` | not adopted | deprecated (D12) |
| Structured output | adopted indirectly | Mastra's detectors run structured output on the fast role (fake: `fake-structured-output.ts`); own scorers are deterministic except `faithfulness-judge.scorer.ts` |
| Tool approval (`requireApproval`) | adopted | `tool-registry.ts` (mutations), gate (3); SP4 UI |
| Tool `suspend`/`askUserTool` | not adopted | four eyes via SP1 approval requests (decision 0025); clarification is plain text |
| Tool hooks `beforeToolCall`/`afterToolCall` | not adopted | authorize/audit/span in `define-core-tool.ts` + `core-tool-pipeline.ts` |
| `writer.custom` data parts | adopted | `knowledge-ingest.workflow.ts` (`data-ingest-progress`); SP4 generative UI |
| Background tasks | not adopted | long work runs as workflows |
| Thread signals / queued messages | not adopted | single-turn chat in v1 |
| Agent Skills | adopted | `skills/*/SKILL.md`, `src/skills/resolve-skills.ts` (inline, no Workspace, D3-21) |
| Workspace / sandboxes / code mode | not adopted | out of scope (umbrella §15) |
| Browser packages | not adopted | 0.x behind upstream; Playwright MCP connector instead (`src/connectors/mcp/mcp-connector.ts`) |
| MCPClient | adopted | `mcp-connector.ts` (`allowedHosts`, approval outside readOnly); OAuth pending (#27) |
| MCPServer | adopted | `src/mcp-server/core-mcp-server.ts` (read tools, `ask_assistant`, catalog resources, `requestState`) |
| A2A / ACP | not adopted | no consumer in v1 |
| Memory: history, semantic recall, working memory, `generateTitle` | adopted | `src/memory/create-memory.ts` |
| Observational Memory | behind flag, off | `create-memory.ts`; comparison harness `src/evals/memory-comparison.ts`, not run with real models (`om-comparison.md`) |
| `TokenLimiterProcessor`, `ToolCallFilter` | adopted | `guardrail-profile.ts` (60 000 best-fit); `ToolCallFilter` on the data agent (`data-agent.ts`) |
| `@mastra/rag` MDocument / rerank | not adopted (deviation from spec) | own chunker `src/knowledge/chunk-document.ts`: the package pulls the Bedrock SDK and an alpha reranker for a string function (decision 0022 amendment); `AI_KB_RERANK` unused |
| `createVectorQueryTool` / GraphRAG | not adopted | tenant filter must be server-injected; own `searchKnowledge` over RLS tables; PgVector for memory only |
| Processors: normalizer, injection, PII, moderation, scrubber | adopted | `guardrail-profile.ts` (`errorStrategy: 'strict'`) |
| `TokenCostControl` | probed, off | worked on `PostgresStoreVNext` but needs a storage swap (decision 0026 amendment); hard cap is `tenant-budget-guard.ts` |
| `RegexFilterProcessor` | adopted | secret-shaped strings on output (`guardrail-profile.ts`) |
| `LanguageDetector`, `ResponseCache`, `ModelSelectionProcessor` | not adopted | no multilingual routing need; cache risks cross-user answers |
| Model router + fallbacks | adopted | `src/models/model-factory.ts`, `provider-registry.ts` |
| Workflows (retries, steps, suspend) | adopted | `knowledge-ingest.workflow.ts`, `catalog-reindex.workflow.ts` (`retryConfig` 3 × 2 s); HITL + schedules SP5 |
| Schedules | SP5 | decision 0037 |
| Scorers, `runEvals`, datasets, experiments | adopted | `src/scorers/*`, `src/evals/*`, `evals:seed` |
| `@mastra/evals` | not adopted | ADR 0004 E4 (peer `vitest <5`) |
| Observability, `SensitiveDataFilter`, `OtelExporter`, `requestContextKeys` | adopted | `create-observability.ts`, `span-export-policy.ts`, `trace-context.ts` |
| Exporters Langfuse/Braintrust | not adopted | OTLP to Cloud Trace covers v1 |
| Custom `MastraAuthProvider`, `mapUserToResourceId` | adopted | `src/auth/firebase-mastra-auth.ts` |
| `@mastra/auth-firebase` | not adopted | umbrella §16.2 |
| Server middleware, `registerApiRoute` | adopted | `auth/*-middleware.ts`, `voice/voice-routes.ts`; `chatRoute`-style routes in SP4 (`src/chat/*`) |
| `@mastra/client-js` | adopted | `MastraGateway` in `@core/services` |
| `@mastra/ai-sdk` | SP4 | `src/chat/*` |
| PubSub | adopted | `src/runtime/create-pubsub.ts` (EventEmitter local, Google Cloud Pub/Sub elsewhere) |
| Durable agents / observe | SP4 | `src/chat/durable-supervisor.ts`, decision 0031 |
| Workers split | not adopted | one Mastra service (umbrella §16.3) |
| Voice | adopted | `src/voice/*` (`CompositeVoice` over own v4 wrappers) |
| Editor / stored agents | not adopted | 0.x, too broad; SP5 own prompt store |
| Studio | local only | `mastra dev` |
| Channels, Agent Builder, Inngest/Temporal, platform | not adopted | out of scope |
| Storage `prune()` | SP5 | retention once `compliance.md` is filled |

## 6. Deviations

1. **Task 19 landed after the gate (2026-10-01).** `APP_MODULES` lists the example module:
   its commands (`command.example.CreateNoteCommand`, `command.example.ArchiveNoteCommand`)
   are action-agent tools next to the core `command.tenancy.CreateProjectInput`, all derived
   from one command registry; it also adds the skill `example-notes` and the workflow
   `example-note-intake`. The module's notes have no `/v1` endpoint or page yet (follow-up #38).
2. **Observational Memory not measured.** No provider keys; the harness runs in fake mode
   only; OM stays off (decision 0029 amendment, `om-comparison.md`, follow-up #37). memory.v1
   is too short to cross OM's 30 000-token threshold, so a real run needs a longer set.
3. **Gate suite runs in-process, not against `.mastra/output`.** It uses the production
   composition (`createAgentRuntime`) on `createNodeServer`, like the other emulator suites;
   the built output is covered by `pnpm -F @core/mastra build` plus a boot smoke (§8).
4. **Semantic SQL has no registered view** in the app; see §1 scoping.
5. **Evals job without Postgres.** The eval gate runs over an in-memory corpus and store
   (decision 0028 amendment); RLS isolation is proven by the Postgres and gate suites.
6. **`@mastra/rag` not adopted**, `TokenCostControl` off, `ToolCallFilter` only on the data
   agent (spec said subagents).
7. **Root `pnpm test:emulators` now needs Postgres** (the gate suite); CI job `emulators` got a
   service container and migrations.

## 7. Follow-ups

Closed here: #1 (`ae94c35`), #3 (`5a98518`, `5b8ec4c`), #12 a/b/d (`2f42755`, `18457dd`; c
and e by SP1), #31 (`evals:seed` ran twice against Postgres: created, then `unchanged`).
Earlier in SP3: #2 (Task 25), #24, #26.

Open and relevant to SP3's runtime (`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`):

| # | Item | Owner |
|---|---|---|
| 17 | Bump the Mastra train to 1.72 | SP3 / workspace |
| 18 | Drop the `@ai-sdk/openai` release-age exclusion after 2026-10-06 | workspace |
| 23 | Root `pnpm test:emulators` flake under parallel load | DX / CI |
| 25 | Approval chunks carry the sanitized tool name | SP4 |
| 27 | MCP OAuth, YAML OpenAPI specs | SP3 follow-up (connectors) |
| 28 | Drop the `@mastra/mcp` release-age exclusion after 2026-10-07 | workspace |
| 29 | Voice calls bypass the usage ledger, budget guard and audit | SP4 / SP5 |
| 30 | Voice provider governance gate | SP4 |
| 36 | Drop the `firecrawl>axios` override and firecrawl exclusion | workspace |
| 37 | Real Observational Memory comparison (new) | SP3 / SP5 |
| 38 | The example module's notes have no `/v1` endpoint or page (new, Task 19) | SP2 follow-up |
| 39 | Module command tools ignore module enablement (new, Task 19) | SP5 |
| — | Agent settings port (tenant `enabledAgents`, web opt-ins, PII mode) is a fail-closed stand-in with core defaults | SP5 |

## 8. Verification

Fresh runs in the scratch worktree on the tree that landed (Node 26.10.0, pnpm 12.6.0, compose
Postgres `core-postgres-1`, `pnpm db:migrate` applied). The emulator suites ran serially
(`turbo --concurrency=1`, follow-up #23).

```
pnpm lint                         → 10/11 packages clean; @core/mastra had 4 errors in the new gate files,
                                    fixed, then `turbo run lint typecheck` for mastra + agents clean
pnpm typecheck                    → 11/11 packages clean
pnpm test (turbo --continue)      → agents, contracts, services, web, desktop, functions, i18n, config green;
                                    @core/mastra 59/59 and @core/scripts 62/62 green when rerun alone (two
                                    5–7 s timeouts under parallel load); @core/client tokens.test.ts fails
                                    "block not found: :root," — SP2-owned, untouched here (see concerns)
turbo run test:postgres --concurrency=1 → 2/2 packages green
firebase emulators:exec --only auth,firestore,functions,storage "turbo run test:emulators --concurrency=1 --continue"
                                  → services 26 files, agents 1, scripts 1, mastra 3 files (runtime,
                                    chat routes, sp3-gate 7/7) passed; functions failed with "User code failed
                                    to load … Timeout after 10000" (follow-up #23) and passed alone: 2 files, 6 tests
AI_MODE=fake pnpm evals           → 6 files, 6 passed (assistant, knowledge, data, action gates passed;
                                    leak detection; memory comparison harness)
AI_MODE=real pnpm -F @core/agents evals:real → 6 skipped (no provider keys)
pnpm contracts:check              → ok (102 contracts, 71 endpoints, 207 files)
pnpm -F @core/mastra db:init && pnpm evals:seed (twice) → created 18/12/11/10, then unchanged ×4
pnpm -F @core/mastra build        → output pins match the lockfile; audit: no high or critical
built server (PORT=4198, stopped by its PID): GET /health 200 {"success":true};
  POST /api/vectors/x/query 404; POST /api/agents/assistant/generate without a token 401
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

### 8.1 Task 19 (2026-10-01)

Fresh runs in the main tree (Node 26.10.0, pnpm 12.6.0, compose Postgres, scratch emulators on
ports 45080/45099/45150/45199/45400/45500). Details in `reports/task-19.md`.

```
turbo run test (services, agents, mastra, module-example, contracts, web)
                                  → services 125 files / 846, agents 73 / 528 (1 skipped), mastra 13 / 64,
                                    module-example 5 / 30, contracts 36 / 411, web 11 / 72: all passed
turbo run test:postgres --concurrency=1 → services 8 files / 44, agents 7 / 27 passed
firebase emulators:exec --only auth,firestore,storage "turbo run test:emulators --concurrency=1 --continue"
                                  → mastra 8 files / 36 (sp3-gate 7/7, workflow-hitl 3/3 with a real note,
                                    module-commands 5/5), module-example 1 / 3, agents 1 / 6, scripts 1 / 2,
                                    services 37 / 187 (one rules test failed in the first full run and passed
                                    alone and in a second full run); functions needs the Functions emulator,
                                    which the scratch config does not start
AI_MODE=fake pnpm evals           → 7 files, 7 passed
pnpm contracts:check              → ok (132 contracts, 142 endpoints, 267 files)
pnpm i18n:check                   → ok
pnpm -F @core/mastra build        → build successful; output pins match; audit: no high or critical
built server (PORT=4196, fake mode, scratch emulators): GET /health 200 {"success":true};
  POST /api/agents/assistant/generate without a token 401
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```
