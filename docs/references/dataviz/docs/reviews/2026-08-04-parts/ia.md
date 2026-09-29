# Revisão de aderência — Camada de IA

**Data:** 2026-08-04
**Branch:** `chore/limpeza-vila-rosa`
**Escopo:** `src/features/{ai-agents,ai-studio,canvas-orchestrator,business-context,evals}`, `src/shared/config/agents`, `src/shared/lib/{rag,memory,macro,telemetry}`, `app/api/{chat,canvas-chat}`
**Convenções lidas:** `.contexts/engineering/stacks/ai/{mastra-sdk,vercel-ai-sdk,gemini,harness-engineering}.md`, `.contexts/engineering/rules/{grounding,observability,error-handling,testing,security}.md`, `.contexts/engineering/practices/ai-friendly-code.md`

**Método:** leitura direta de código + leitura read-only do Firestore (`liquid-micro-apps`, database nomeado `liquid-play-dataviz`) via script temporário em `scripts/`, já removido. Nenhuma escrita em produto ou Firestore.

---

## Parte 1 — Inventário

### 1.1 Entradas HTTP (2)

| # | Caminho | O que faz |
|---|---|---|
| 1 | `app/api/chat/route.ts` | Chat analítico. Auth + authz de tenant, valida `filters.dateRange`, cria thread, resolve contexto semântico, monta instância Mastra por request e converte `fullStream` Mastra → `UIMessageStream` do AI SDK v6. |
| 2 | `app/api/canvas-chat/route.ts` | Chat do canvas (construção de dashboards). Mesmo preâmbulo de auth/authz; delega a `createCanvasOrchestrator` e devolve `toUIMessageStreamResponse()`. |

### 1.2 Orquestrador analítico — Mastra (6)

| # | Caminho | O que faz |
|---|---|---|
| 3 | `app/api/chat/resolve-chat-agent.ts` | Roteador: lê workflows ativos do Firestore, seleciona um pelo texto do usuário e devolve o **supervisor**; sem workflows ou em qualquer erro cai fail-soft no agente `descriptive`. |
| 4 | `src/features/ai-agents/mastra/instance.ts` | Constrói `new Mastra({ agents })` com os 8 sub-agentes; fail-soft por agente (factory que lança é pulada e logada). |
| 5 | `src/features/ai-agents/mastra/build-supervisor-agent.ts` | Monta o `Agent` supervisor: instruções = prompt do orchestrator (Firestore, fallback no estático) + instrução do workflow + contexto dinâmico. Recebe os 8 sub-agentes via `agents:`; **não recebe tools diretas**. |
| 6 | `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts` | Fábrica genérica dos 8 sub-agentes: resolve tier de modelo, instruções (config Firestore ou baseline de código), capacidades (toolKeys/kbRefs) e monta o `Agent`. |
| 7 | `src/features/ai-agents/mastra/{descriptive,diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent-mastra.ts` | 8 delegadores finos (~10 linhas cada) que chamam a fábrica com `systemKey`, nome, descrição e tier default. |
| 8 | `src/features/ai-agents/model-registry.ts` | `customProvider` do AI SDK sobre `@ai-sdk/google-vertex`: tiers `router`/`fast`/`flash`/`reasoning` → Gemini 2.5 flash-lite/flash/flash/pro + `thinkingBudget` por tier. |

### 1.3 Orquestrador canvas — AI SDK v6 direto (7)

| # | Caminho | O que faz |
|---|---|---|
| 9 | `src/features/canvas-orchestrator/orchestrator.ts` | `streamText` de agente único com ~32–36 tools, `stopWhen: stepCountIs(30)`, `experimental_repairToolCall` (reparo de SQL), `prepareStep` e composição de system prompt com business context + RAG. |
| 10 | `src/features/canvas-orchestrator/orchestrator-workflow.ts` | Caminho alternativo determinístico (`build_dashboard_workflow`, opt-in por flag): plan → gather → design → fill → cross-validate → render/commit. |
| 11 | `src/features/canvas-orchestrator/workflow/` | Mini-engine de workflow **caseiro** (`create-step`, `create-workflow`, `branch`, `foreach`, `dountil`, `errors`, `types`) — não usa `@mastra/core/workflows`. |
| 12 | `src/features/canvas-orchestrator/steps/` | Os 7 steps do workflow + `schemas.ts` (Zod) e `fill-slot-subworkflow`. |
| 13 | `src/features/canvas-orchestrator/lib/` | `prepare-step` (gating de tools por step), `fill-block-fn` (preenchimento de bloco com LLM), `sub-agent` (invocação de sub-agente). |
| 14 | `src/features/canvas-orchestrator/tools/` | 22 arquivos de tools de canvas (CRUD de blocos/páginas, layout, filtros, `query_data`, `analyze`, `plan_analysis`, `build_dashboard_workflow`). |
| 15 | `src/shared/config/agents/canvas-orchestrator.ts` | System prompt do canvas (373 linhas), parametrizado por dataset/filtros/páginas/BQML/semanticContext. |

### 1.4 Prompts e contexto em código (6)

| # | Caminho | O que faz |
|---|---|---|
| 16 | `src/shared/config/agents/index.ts` + `{descriptive,diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow,orchestrator}-agent.ts` | Os 9 prompts estáticos (`buildXStatic()`), versionados em git — baseline de código e fonte do seed. |
| 17 | `src/shared/config/agents/shared-context.ts` | `SQL_RULES`, `RESPONSE_GUIDELINES`, `buildSchemaContext`, `buildBusinessContext`, `hasClientSchema`. |
| 18 | `src/shared/config/agents/dynamic-context.ts` | Bloco de contexto dinâmico por request (dataset, filtros, página, indicador em foco). |
| 19 | `src/shared/config/agents/build-system.ts` | Compõe o system prompt do canvas: cliente + persona + ICP + template + chunks RAG + macro + glossário, com degradação por pressão de tokens. |
| 20 | `src/shared/config/agents/template-blocks.ts` | Blocos de template reutilizáveis de prompt. |
| 21 | `src/shared/config/agents/types.ts` | Contratos da camada (`AgentDynamicContext`, `ModelTier`, `AgentId`, `ChatRequestFilters`, `FocusedIndicator`). |

### 1.5 AI Studio — config em Firestore (7)

| # | Caminho | O que faz |
|---|---|---|
| 22 | `src/features/ai-studio/repo.ts` + `entity-config.ts` + `protection.ts` | CRUD Firestore das 4 entidades com validação Zod, allowlist de PATCH, proteção de docs `origin:'system'` e enforcement de 1 workflow default. |
| 23 | `src/features/ai-studio/runtime/config-loader.ts` | Leitura cacheada (TTL 30s) de `aiAgents`, `aiSkills` e `aiWorkflows`. |
| 24 | `src/features/ai-studio/runtime/{resolve-agent,resolve-capabilities,select-workflow}.ts` | Resolve instruções (config + playbooks de skills, fallback no código), capacidades (toolRefs ∪ skills.toolRefs) e escolha de workflow. Todos fail-soft. |
| 25 | `src/features/ai-studio/runtime/tool-registry.ts` | Mapa `toolKey → factory` com ~60 tools; keys server-bound devolvem `null` sem tenancy (ADR-0006). |
| 26 | `src/features/ai-studio/runtime/kb-retrieval-tool.ts` | Tool de retrieval sobre knowledge bases anexadas ao agente. |
| 27 | `src/features/ai-studio/seed/{manifest,ensure-seed,skill-playbooks}.ts` | Seeds de sistema: 9 agentes, 4 skills, 1 workflow, 1 KB. `ensureSeed` é idempotente e só sobrescreve com `--force`. |
| 28 | `src/features/ai-studio/kb/` + `admin/` | Pipeline de KB (extract/ingest/upsert/query/sources) e UI admin (tabs de agentes, skills, workflows, KBs, catálogo de tools). |

### 1.6 Tools analíticas (3)

| # | Caminho | O que faz |
|---|---|---|
| 29 | `src/features/ai-agents/tools/*.ts` (~50) | Tools de dados e crédito: `execute_sql`, `dry_run_sql`, schema/sample, estatística, vintage, transição, PD/LGD, CPR/CDR, WAL, HHI, covenants, elegibilidade, cenários, Monte Carlo, macro/web externo. |
| 30 | `src/features/ai-agents/tools/bqml/` | BQML: list/suggest/create-or-use/forecast/predict/detect-anomalies + cache, multi-tenancy, invocation-logger e 4 templates de DDL. |
| 31 | `src/features/ai-agents/lib/` | `compact-messages` (poda de histórico por tamanho e contagem), `repair-sql`, `with-retry`, `format-error`, `truncate-result`, `column-validator`, `prompt-cache`. |

### 1.7 RAG, memória, macro e telemetria (4)

| # | Caminho | O que faz |
|---|---|---|
| 32 | `src/shared/lib/rag/` | Pipeline próprio: `chunker`, `embeddings`, `metadata-extractor`, `reranker`, `pii-scrubber`, `hash`, `metrics`, `rag-service`. |
| 33 | `src/shared/lib/memory/` | Memória própria em Firestore: `memory-service` (threads/working memory), `recall-store`, `persist-sql`, `persist-block`, `eviction` (TTL 90d), `readonly-guard`, `schema`, `metrics`. |
| 34 | `src/shared/lib/macro/bcb-sgs.ts` | Snapshot macro (Selic, IPCA, INCC, IGP-M, TR) via séries do BCB. |
| 35 | `src/shared/lib/telemetry/record-span.ts` + `recall-metrics.ts` | Helper de "span" caseiro (JSON em `console.log`) e métricas de recall. |

### 1.8 Business context (2)

| # | Caminho | O que faz |
|---|---|---|
| 36 | `src/features/business-context/` | `retrieve-business-context`, `retrieve-persona-themes`, `select-template`, `cache`, `telemetry`, `types` — RAG de contexto de negócio por cliente/persona/ICP. |
| 37 | `src/features/business-context/pii-guard.ts` | Guarda de PII sobre o contexto recuperado, com testes adversariais cross-tenant. |

### 1.9 Evals (4)

| # | Caminho | O que faz |
|---|---|---|
| 38 | `src/features/evals/runner/` | `run-evals` (suites smoke/full/gold), `cache`, `cost-budget`, `persist`, `types`. |
| 39 | `src/features/evals/scorers/` | `sql-correctness`, `citation-grounding`, `business-correctness`, `persona-fit`, `layout-coherence` + builtin (`faithfulness`, `prompt-alignment`, `tool-call-accuracy`). |
| 40 | `src/features/evals/scorers/judges/` | LLM-as-judge com rubricas versionadas. |
| 41 | `src/features/evals/drift/` | Detector de drift do judge com baseline versionado. |

**Total: 41 módulos.**

---

### 1.10 Mapa dos DOIS orquestradores

#### A) Orquestrador analítico — `/api/chat` (runtime **Mastra**, ADR-0014)

```
POST /api/chat
  ├─ verifyAuthToken → verifyDatasetAccess(email, dataset, clientId)   route.ts:61-103
  ├─ createThread (se não veio threadId)                                route.ts:105-112
  ├─ getClientSemanticContext(clientId)                                 route.ts:118-120
  ├─ buildMastraInstance({ ctx })  → 8 Agents Mastra                    route.ts:136
  ├─ resolveChatAgent({ mastra, ctx, messages })                        route.ts:138-142
  │     ├─ loadWorkflows()  → Firestore aiWorkflows (status=active)
  │     ├─ se vazio OU erro  ⇒ getAgent('descriptive')      [fail-soft]
  │     └─ senão ⇒ selectWorkflow() → buildSupervisorAgent({ subAgents })
  ├─ compactMessages → convertToModelMessages                           route.ts:150
  └─ agent.stream(modelMessages, { runId })                             route.ts:151-153
        └─ fullStream → convertMastraChunkToAISDKv5 → UIMessageStream   route.ts:155-188
```

**Estado real verificado no Firestore:** `aiWorkflows` tem 1 doc (`default`, `status:'active'`, `isDefault:true`). Portanto o ramo do **supervisor está ativo** — `/api/chat` roda supervisor + 8 sub-agentes, não o agente único.

**Tools concedidas:**

- **Supervisor** — *nenhuma tool direta*. Recebe apenas `agents: subAgents` (`build-supervisor-agent.ts:27`). É um router puro no sentido de `harness-engineering` §"Router agent".
- **Sub-agentes** — via `resolveAgentCapabilities` (Firestore) com fallback em `DEFAULT_AGENT_TOOLS` (`create-mastra-agent-from-config.ts:50`). Como todos os 9 docs em `aiAgents` têm `toolRefs: []` (verificado), **na prática o conjunto vem do código**:

| Sub-agente | Tier | Nº tools | Tools |
|---|---|---|---|
| `descriptive` | fast | 13 | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_statistics, build_vintage_curves, build_transition_matrix, read_dashboard_state, read_active_filters, lookup_glossary, recall_similar_sql, list_validated_queries, save_validated_query |
| `diagnostic` | reasoning | 10 | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_correlations, calculate_hhi, decompose_variation, run_hypothesis_test, list_validated_queries, save_validated_query |
| `predictive` | reasoning | 16 | dry_run_sql, execute_sql, forecast_timeseries, calculate_pd_lgd, build_survival_curve, generate_early_warnings, calculate_cpr_cdr, build_vintage_curves, build_transition_matrix, bqml_* (6), schema_describe_relationships |
| `prescriptive` | reasoning | 7 | dry_run_sql, execute_sql, run_clustering, run_causal_analysis, optimize_allocation, rank_actions, evaluate_impact |
| `monitoring` | reasoning | 10 | dry_run_sql, execute_sql, detect_anomalies, check_eligibility, check_concentration_limits, check_covenant_triggers, generate_compliance_report, bqml_list_models, bqml_forecast, bqml_detect_anomalies |
| `simulation` | reasoning | 8 | dry_run_sql, execute_sql, get_baseline, run_sensitivity, run_scenario, run_monte_carlo, apply_stress_macro, calculate_stressed_ecl |
| `external` | fast | 8 | dry_run_sql, execute_sql, search_web, get_bcb_indicator, parse_macro_data, sentiment_analysis, extract_regulatory_updates, get_market_benchmarks |
| `cashflow` | fast | 7 | dry_run_sql, execute_sql, calculate_wal, calculate_excess_spread, calculate_coverage_ratios, compare_cashflows, decompose_payments |

Fonte: `src/shared/config/agents/default-agent-tools.ts:2-11`. `kb_retrieval` é somada quando o agente tem `knowledgeBaseRefs` (`create-mastra-agent-from-config.ts:53-58`) — hoje nenhum tem.

#### B) Orquestrador canvas — `/api/canvas-chat` (runtime **AI SDK v6 direto**)

```
POST /api/canvas-chat
  ├─ verifyAuthToken → verifyDatasetAccess                              canvas-chat/route.ts:14-64
  ├─ createThread / getClientSemanticContext                            canvas-chat/route.ts:66-80
  └─ createCanvasOrchestrator(...)                                      canvas-chat/route.ts:82-97
        ├─ getWorkingMemory(threadId) → bloco no prompt                 orchestrator.ts:80-97
        ├─ monta ~32 tools + até 4 condicionais                         orchestrator.ts:99-186
        ├─ composeSystemPrompt: canvas prompt + businessCtx + macro + RAG  orchestrator.ts:226-240
        └─ streamText({ model: reasoning, stopWhen: stepCountIs(30) })  orchestrator.ts:188-245
```

**Tools concedidas (agente único, sem router):**

- **Base (32):** `plan_analysis`, `create_page`, `add_{text,kpi,chart,table}_block` (4), `move_block`, `remove_block`, `update_{text,kpi,chart,table}_block` (4), `dry_run_sql`, `vector_query`, `query_data`, `get_filter_options`, `get_table_schema`, `get_sample_data`, `set_filters`, `analyze`, `declare_layout`, `fill_block`, `fill_layout`, `add_slot`, `remove_slot`, `bqml_list_models`, `bqml_suggest_model`, `bqml_create_or_use_model`, `bqml_forecast`, `bqml_predict`, `bqml_detect_anomalies`, `schema_describe_relationships`.
- **Condicionais (+4):** `list_validated_queries` e `save_validated_query` (se `clientId` && `personaId`), `updateWorkingMemory` (se `threadId`), `build_dashboard_workflow` (se flag `useWorkflow`).

Total: **até 36 tools em um único prompt**.

#### C) Onde a config vive — código × Firestore

| Item | Código | Firestore (`liquid-play-dataviz`) | Quem vence |
|---|---|---|---|
| Prompts dos 9 agentes | `src/shared/config/agents/*-agent.ts` (`buildXStatic()`) | `aiAgents/{id}.instructions` (9 docs, `origin:'system'`, 1584–9380 chars) | **Firestore**; código é fallback (`resolve-agent.ts:14`) |
| Playbooks de skills | `seed/skill-playbooks.ts` | `aiSkills/{response-style,sql-foundations,portfolio-schema,credit-domain}` (4 docs) | **Firestore** (anexadas a 8 agentes via `skillRefs`) |
| Instrução do workflow | `seed/manifest.ts:51` | `aiWorkflows/default` (`isDefault:true`, `status:'active'`) | **Firestore** |
| Tier de modelo | `defaultModelTier` no factory | `aiAgents/{id}.model` | **Firestore** se tier válido (`create-mastra-agent-from-config.ts:38-42`) |
| Conjunto de tools | `default-agent-tools.ts` | `aiAgents/{id}.toolRefs` — **todos `[]`** | **Código** (fallback), porque o Firestore está vazio nesse campo |
| Knowledge bases | — | `aiAgents/{id}.knowledgeBaseRefs` — todos `[]`; `knowledgeBases/default` existe | Nenhum agente usa KB hoje |
| Tools do canvas | `canvas-orchestrator/orchestrator.ts:99-186` | — | **Código** (canvas não passa pelo AI Studio) |

Coleções: `aiAgents`, `aiSkills`, `aiWorkflows`, `knowledgeBases` (`entity-config.ts:28,39,49,57`), no database nomeado `liquid-play-dataviz` (`runtime-config.ts:4`), não no `(default)`.

---

## Parte 2 — Tabela de aderência

Legenda: ✅ aderente · ⚠️ parcial · ❌ não aderente · n/a não aplicável.

| Módulo | Convenção | Aderente? | Evidência | Observação |
|---|---|---|---|---|
| `package.json` | mastra-sdk §Versão — "Pin sempre a versão exata em `package.json`" | ❌ | `package.json` (`@mastra/core ^1.32.1`, `ai ^6.0.116`, `@ai-sdk/google-vertex ^4.0.80`) | Todos com caret. A convenção justifica o pin porque "minor versions trazem mudanças relevantes em APIs de workflow e memory". Também colide com security §9 ("Pin de versão exata ou range controlado"). |
| `.contexts/.../vercel-ai-sdk.md` | Doc pinada em 4.x; "5.x não adotar em produção" | n/a | `.contexts/engineering/stacks/ai/vercel-ai-sdk.md:16,24` vs `package.json` (`ai ^6.0.116`) | A **convenção** é que está desatualizada, não o código. Idem mastra-sdk, que documenta `@mastra/core ^0.x` e `@mastra/memory`/`@mastra/rag`/`@mastra/evals` — nenhum instalado. Avaliei o código contra o espírito da regra, não contra a versão citada. |
| Sub-agentes Mastra | mastra-sdk §Anti-patterns — "Agent sem `instructions` claros" | ✅ | `create-mastra-agent-from-config.ts:44-47`; `aiAgents/*.instructions` (1584–9380 chars) | Instruções compostas (estático + skills + contexto dinâmico), com persona e escopo. |
| Supervisor | harness-engineering §Padrões — "Router agent … quando há mais de ~10 tools ou domínios distintos" | ✅ | `build-supervisor-agent.ts:21-28` (`agents: input.subAgents`, sem `tools`) | Router puro: despacha para 8 sub-agentes especializados, nenhuma tool direta. |
| `canvas-orchestrator/orchestrator.ts` | vercel-ai-sdk §Anti-patterns — "Mais de ~10 tools no mesmo prompt. Accuracy degrada. Usar router pattern" | ❌ | `orchestrator.ts:99-186` (32 tools base) + `:168-186` (até +4 condicionais) | Até 36 tools em um prompt único, ~3,6× o teto. `build_dashboard_workflow` (`:181`) é o embrião do caminho determinístico, mas está atrás de flag default-OFF (`route.ts:95`). |
| Sub-agentes analíticos | vercel-ai-sdk §Anti-patterns — ~10 tools por prompt | ⚠️ | `default-agent-tools.ts:5` (`predictive` = 16), `:3` (`descriptive` = 13) | O router pattern está aplicado; 2 dos 8 passam um pouco do teto. Muito menos grave que o canvas. |
| `create-mastra-agent-from-config.ts` | harness-engineering §Decision layer — "Agent loop com `maxSteps` obrigatório — sem cap, custo e latência divergem" | ❌ | `create-mastra-agent-from-config.ts:60-65`; `route.ts:151-153` (`agent.stream(msgs, { runId })`) | Mastra **suporta** `maxSteps` e `stopWhen` (`node_modules/@mastra/core/dist/agent/agent.types.d.ts:296,402-405`) — não é limitação do SDK. `types.ts:53-55` registra que `maxSteps` saiu junto com o runtime AI SDK v6 e não foi reposto. Refutação parcial: o default do Mastra não é infinito (`chunk-VXOFGYGF.js:6586` usa `maxSteps = 1`; `chunk-YVDKR35H.js:83` usa `5`), então o risco real é menos "loop infinito" e mais **truncamento silencioso** de um agente que precisa de schema → SQL → resposta. Em ambos os casos, o cap deve ser explícito. |
| `canvas-orchestrator/orchestrator.ts` | harness-engineering §Decision layer — cap no agent loop | ✅ | `orchestrator.ts:243` (`stopWhen: stepCountIs(30)`) | Também nos sub-fluxos: `analyze.ts:29` e `fill-block-fn.ts:79` usam `stepCountIs(8)`. |
| `/api/chat` + `canvas-orchestrator` | vercel-ai-sdk §Anti-patterns — "`streamText` em endpoint sem `abortSignal`. Request hang em desconexão"; error-handling §10 | ❌ | `orchestrator.ts:188-245` (sem `abortSignal`); `route.ts:151-153` (sem `abortSignal`) | Nenhuma das duas rotas propaga `req.signal`. O caminho de workflow do canvas faz certo (`fill-slot-subworkflow.ts:71,88,106,137`; `fill-block-fn.ts:67-68` compõe timeout + signal do caller), o que mostra que o padrão existe no repo — só não chegou aos dois entrypoints. |
| Ambos orquestradores | vercel-ai-sdk §`streamText` — "Sempre cheque `finishReason`. `length` … não é resposta válida"; observability §LLM — "Registre `finish_reason`" | ❌ | `route.ts:155-188` (loop de chunks sem inspeção de finish); nenhuma ocorrência de `finishReason` em `src/` ou `app/` | Resposta cortada por limite de tokens chega ao usuário como resposta normal. |
| Tools (geral) | mastra-sdk §Tools / vercel-ai-sdk §Tool use — `inputSchema` Zod obrigatório | ✅ | `execute-sql.ts:23-27`; `tool-registry.ts:170,175,195-197` | Todas as tools inspecionadas declaram `inputSchema` Zod com `.describe()` nos campos. |
| Tools (geral) | mastra-sdk §Anti-patterns — "Tools sem schema Zod completo … Use `.strict()`, enums, `min`/`max`, `.describe()`" | ⚠️ | `describe-relationships.ts:5-7` usa `.strict()`; `execute-sql.ts:23-27` não usa | `.strict()` é exceção, não regra, no conjunto de ~60 tools. |
| `execute-sql.ts` | mastra-sdk §Error handling / vercel-ai-sdk — "`execute` … Retornar `{ error: "mensagem" }` estruturado" | ✅ | `execute-sql.ts:30-44,114-120` | Erro estruturado com `success:false`, sem vazar stack. `format-error.ts` centraliza. |
| `execute-sql.ts` | security §4/§14 — não passar input do cliente direto para SQL; output de LLM como untrusted | ✅ | `execute-sql.ts:9-11` (regex anti-DML/DDL varre a query inteira, não só o início — evita bypass por CTE), `:30-44` | Guarda SELECT/WITH-only + `jobTimeoutMs: 60_000` (`:58`) + teto de linhas e chars (`:13-14`). Uma das partes mais sólidas da camada. |
| `create-mastra-agent-from-config.ts` | mastra-sdk §Memory — thread context / semantic recall / working memory | ❌ | `create-mastra-agent-from-config.ts:60-65` (`new Agent` sem `memory`); `route.ts:105-112,189` | `/api/chat` **cria** uma thread e devolve `x-thread-id`, mas o `threadId` nunca chega ao agente: `agent.stream()` não recebe `threadId`/`resourceId` e `ctx` (`route.ts:124-134`) não carrega `memory`. O campo `AgentDynamicContext.memory` (`types.ts:80`) existe e fica sempre `undefined` no caminho analítico. Recall existe só como tool (`recall_similar_sql`). No canvas a working memory **é** usada (`orchestrator.ts:81-97,171-176`) — a lacuna é só do lado analítico. |
| `shared/lib/memory/eviction.ts` | mastra-sdk §Anti-patterns — "Memory sem TTL/limite" | ✅ | `eviction.ts:28` (`TTL_DAYS = 90`), `:74-91` | TTL de 90d sobre `embeddingsSql`/`embeddingsBlocks`, com templates curados preservados. |
| `lib/compact-messages.ts` | harness-engineering §Context layer — "Context window management: truncation strategies, prioridade por recência" | ✅ | `compact-messages.ts:24,31,108-119,128-145` | Teto duplo (tamanho 120k chars + contagem 20 turnos), piso de 4 turnos intactos, ajustável por `CHAT_HISTORY_BUDGET_CHARS`. Bem documentado e testado (`__tests__/compact-messages.test.ts`). |
| `lib/compact-messages.ts` | grounding — "Nunca invente nome ou shape de env var — confira `.env.example`" | ✅ | `compact-messages.ts:34` ↔ `.env.example:101` | `CHAT_HISTORY_BUDGET_CHARS` documentada com default e unidade. |
| `instance.ts` | mastra-sdk §Observability — "OpenTelemetry built-in. Configure exporter em `mastra.config.ts`" | ❌ | `instance.ts:47` (`new Mastra({ agents })`, sem `telemetry`) | Nenhum `telemetry:` no `Mastra`. Não existe `instrumentation.ts` no repo e nenhum pacote `@opentelemetry/*` em `package.json`. |
| `shared/lib/telemetry/record-span.ts` | observability §Os três pilares — "Não emita trace como log. Spans vivem no exporter OTel, não em `console.log`" | ❌ | `record-span.ts:14,26` | Helper caseiro que serializa um pseudo-span em `console.log`. Usado em 7 módulos (`orchestrator-workflow.ts:50`, `judge-runner.ts`, `foreach.ts`, `get-table-schema-v2.ts`, `multi-tenancy.ts`, …). |
| Camada de IA (geral) | observability §Observabilidade de LLM — spans `gen_ai.*`, tokens in/out, custo USD, latência por modelo | ❌ | `orchestrator.ts:191-200` (`experimental_telemetry` ligado, mas sem SDK OTel registrado ⇒ nenhum span exportado); ausência de `@opentelemetry/*` em `package.json` | O `experimental_telemetry` do AI SDK só emite se houver um `NodeSDK`/`registerOTel` ativo — não há. Resultado: zero visibilidade de token, custo e latência por modelo em produção. É a lacuna com maior efeito composto (ver §Achados). |
| Camada de IA (geral) | observability §Structured logging — "Use um logger central… Nunca importe `console` diretamente em código de runtime" | ❌ | `rag/metrics.ts:16`, `memory/metrics.ts`, `record-span.ts:14`, `instance.ts:44`, `resolve-chat-agent.ts:52`, `tool-registry.ts:252,256,257`, `orchestrator.ts:305,318` | 15 arquivos de runtime na camada usam `console.*`. `rag/metrics.ts:16` ao menos emite JSON com `severity`/`component`/`timestamp` (Cloud Logging-friendly), mas sem logger central não há redaction configurada num ponto só, como exige observability §PII. |
| Camada de IA (geral) | observability §Correlation — `requestId`/`traceId` propagados, `traceparent` W3C | ❌ | `route.ts:123` e `orchestrator.ts:62` geram `sessionId = crypto.randomUUID().substring(0,8)` | ID local por request, truncado em 8 chars, não propagado como trace context nem correlacionado entre as duas rotas. |
| `resolve-chat-agent.ts`, `create-mastra-agent-from-config.ts` | error-handling §5 — "Nunca escreva `catch {}`… `Nunca` use `.catch(() => null)` para esconder falhas" | ❌ | `create-mastra-agent-from-config.ts:37` (`.catch(() => null)`), `:57` (`catch { /* fail-soft */ }`); `orchestrator.ts:83` (`.catch(() => null)`); `execute-sql.ts:95,101` (`.catch(() => {})`) | 24 ocorrências de `catch {` na camada. Boa parte é fail-soft **intencional e desejável** (config indisponível ⇒ baseline de código), o que refuta a leitura de "bug escondido"; mas a regra exige `// intentionally swallowed: <razão>` + log em `debug`, e a maioria não tem nem um nem outro. |
| `lib/with-retry.ts` | error-handling §8 — "backoff exponencial **com jitter**"; "defina `maxAttempts` finito **e `maxElapsedTime`**" | ⚠️ | `with-retry.ts:41` (`baseDelay * Math.pow(2, attempt)`, sem jitter), `:31` (sem `maxElapsedTime`) | `maxRetries` finito ✅ e classificação de transitórios correta (`:5-21`, só 429/503/529/ECONNRESET) ✅. Falta jitter — relevante porque o `thundering herd` em 429 do Vertex é exatamente o caso que a regra endereça. Usado só em 2 pontos (`embeddings.ts`, `fill-block-fn.ts`), não nas chamadas principais de LLM. |
| `workflow/errors.ts` | error-handling §2 — classes de erro com discriminador `kind` | ⚠️ | `workflow/errors.ts` (`MissingTenantError`), usado em `orchestrator-workflow.ts:41` | Existem erros tipados no engine de workflow do canvas; o caminho analítico não tem taxonomia própria. |
| `app/api/chat/route.ts` | security §2/§3 — auth server-side + authz por tenant antes de qualquer processamento | ✅ | `route.ts:62-65` (401), `:100-103` (`verifyDatasetAccess` antes de `getClientSemanticContext` e do agente) | Ordem correta e comentada (`:94-99`). Mesmo padrão em `canvas-chat/route.ts:55-64`. Ponto forte. |
| `app/api/chat/route.ts` | security §4 — validar input externo com Zod no boundary | ⚠️ | `route.ts:45-59` (`interface ChatBody` + cast), `:74-92` (checagens manuais de `dataset`/`messages`/`dateRange`) | Valida o essencial à mão; não há schema Zod no boundary, apesar de Zod ser usado em toda tool. `body` entra como `as ChatBody` sem parse. |
| `/api/chat`, `/api/canvas-chat` | security §8 — "Sempre aplique rate limiting em … chamadas a LLM"; "estabeleça budget de tokens por usuário e por tenant … Cap hard no servidor" | ❌ | Nenhuma ocorrência de rate limit/`429`/`Retry-After` em `app/api/**`; não existe `middleware.ts` no repo | Duas rotas LLM autenticadas, `maxDuration` de 300s e 600s (`route.ts:43`, `canvas-chat/route.ts:11`), sem teto de chamadas nem de tokens por usuário/tenant. |
| `evals/runner/cost-budget.ts` | harness-engineering §Error/Cost — "Cost budgets por feature/user com kill-switch automático" | ⚠️ | `cost-budget.ts:28-44` (`EVAL_DAILY_BUDGET_USD`, `blocked` a 1.2×) | Existe e é bem feito — mas cobre **apenas evals offline**. Não há equivalente para o tráfego de produção. |
| `tools/bqml/create-or-use-model.ts` | harness-engineering §Guardrail — HITL antes de tools caras/destrutivas; §Reversibilidade | ✅ | `create-or-use-model.ts:127-129` (`needsApproval` por bytes e custo USD, com thresholds em env) | Gate de aprovação na tool mais cara da camada. Bom exemplo do padrão que falta nas demais. |
| `tools/bq-dry-run-sql.ts` | harness-engineering §Reversibilidade — "Tools com `dry_run` flag" | ✅ | `tool-registry.ts:102` (`dry_run_sql`); presente em **todos** os 8 `DEFAULT_AGENT_TOOLS` (`default-agent-tools.ts:3-10`) | Dry-run disponível a todo sub-agente antes de `execute_sql`. |
| `rag/pii-scrubber.ts`, `business-context/pii-guard.ts` | security §13 / harness-engineering §Guardrail — "PII detection antes de envio ao provider" | ✅ | `pii-scrubber.ts:14-27` (CPF/CNPJ formatado e cru, e-mail), `:32+` (`scrubObject` recursivo) | Aplicado em 8 pontos: `rag/`, `memory/persist-sql.ts`, `memory/persist-block.ts`, `ai-studio/kb/ingest.ts`, `business-context/`. Cobertura consistente antes de embeddar/persistir. |
| `business-context/` | harness-engineering §Anti-patterns — "Misturar contexto de tenants/usuários sem isolamento… Memory keys sempre escopadas por tenant" | ✅ | `business-context/__adversarial__/cross-tenant.test.ts`; `orchestrator.ts:63-68` (comentário G6 distingue tenant de dataset) | Existe teste adversarial dedicado a cross-tenant. |
| `runtime/tool-registry.ts` | harness-engineering §Anti-patterns — memory/cache keys escopadas por tenant | ⚠️ | `tool-registry.ts:151` (`clientId: ctx.dataset`) vs `orchestrator.ts:151-154` (`clientId: tenantId`) | Os dois caminhos passam valores diferentes para a mesma tool. Tentei refutar e **em parte se refuta**: `describe-relationships.ts` nunca lê `ctx.clientId` (o cache é `${dataset}|${tables}`, `:42`, e o conteúdo é metadado de schema do próprio dataset), então hoje não há vazamento entre tenants — é parâmetro morto + inconsistência entre caminhos, não incidente. Fica ⚠️ porque o contrato mente e a próxima edição da tool pode passar a usar o campo. |
| `model-registry.ts` | gemini §Duas plataformas — "Vertex … Default para produção neste projeto" | ✅ | `model-registry.ts:2,10-18` (`vertex(...)` de `@ai-sdk/google-vertex`) | Nenhum uso de AI Studio / `generativelanguage.googleapis.com`. |
| `model-registry.ts` | gemini §Anti-patterns — "Codificar `region` Vertex como string mágica espalhada — centralize em config" | ✅ | `.env.example:9-10` (`GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION=us-central1`) | Região vem do env lido pelo provider, não hardcoded. |
| `model-registry.ts` | gemini §Features / anti-patterns — "`thinkingBudget` ilimitado em Flash … custo explode silenciosamente" | ✅ | `model-registry.ts:30-36,50-60` | Budget explícito por tier (router/flash sem thinking, fast 2048, reasoning 8192), com justificativa em comentário. |
| Camada de IA | gemini §Features — "Context caching explícito (`cachedContents`) … reduz custo em até 75%" | ⚠️ | `lib/prompt-cache.ts:6-14` (`Map` de memoização de string, in-process); `route.ts:58` (`useVertexPromptCache` marcado "sem efeito após ADR-0014") | O que existe é memoização de montagem de prompt, não context caching do Vertex. Com system prompts de 9k+ chars por agente (medido no Firestore) e prefixo estável, é a otimização de custo mais óbvia não feita. |
| Camada de IA | gemini §Anti-patterns — `safetySettings` | ⚠️ | Nenhuma ocorrência de `safetySettings`/`HARM_CATEGORY` em `src/` | Usa os defaults do Vertex. A convenção só proíbe `BLOCK_NONE` sem justificativa, o que não ocorre — por isso ⚠️ e não ❌. |
| `manifest.ts` / camada de guardrails | harness-engineering §Guardrail (Output) — "Citation/grounding checks: se a resposta deve ser baseada em documentos, validar que citações existem no retrieval set" | ❌ | `seed/manifest.ts:51` e `aiWorkflows/default.instruction` (Firestore) pedem "citações de fonte quando houver afirmação numérica ou regulatória"; nenhuma implementação de `require-citation`/`requireCitation` em `src/` (só a spec `docs/superpowers/specs/2026-05-04-sprint3-D-evals-scorers-dataset.md:351-354,376`) | O prompt **em produção** exige citação e nada verifica. Tentei refutar por três vias: (a) `evals/scorers/citation-grounding.ts` existe — mas é scorer offline de eval, não guardrail de runtime; (b) Mastra oferece `processors` como substituto natural do output processor removido — disponível e não usado; (c) `validateAgentResult` não existe em lugar nenhum do repo. Confirma o ponto levantado no briefing. |
| Camada de IA | harness-engineering §Falha visível — "Melhor errar com erro tipado do que retornar plausível-mas-errado"; §Determinismo — "para qualquer fluxo que alimenta lógica downstream, o output passa por schema Zod" | ⚠️ | `canvas-orchestrator/steps/schemas.ts` (Zod nos steps do workflow) ✅; nenhuma validação de resultado no caminho analítico | O canvas valida output estruturado nos steps; o `/api/chat` devolve prosa do modelo sem validação. |
| `features/ai-agents/phases/` | ADR-0008 (gating de tools por fase) vs harness-engineering §Tool/Action — tool gating | ❌ | `phases/types.ts:4-6` ainda descreve o gating via `prepareStep` + `activeTools`; `:11-14` registra que `infer-phase`/`phase-to-tools` saíram; `types.ts:81-86` mantém `currentPhase` "mutado por `prepareStep`" | Sem implementação no caminho Mastra. `currentPhase` é campo morto ali (o `prepareStep` que existe é do canvas, `canvas-orchestrator/lib/prepare-step.ts`, outro fluxo). O gating estático por `DEFAULT_AGENT_TOOLS` substitui parcialmente, mas o gating dinâmico por fase da ADR não existe mais. |
| `app/api/chat/route.ts` | ai-friendly-code §Anti-patterns — "Comentários obsoletos contradizendo código — agente confia no comentário errado"; grounding | ❌ | `route.ts:12-15` ("os demais sub-agents ainda não estão migrados — temporariamente o /api/chat opera como agente único descritivo") vs `resolve-chat-agent.ts:43-50` (constrói o supervisor com os 8) e `aiWorkflows/default` ativo no Firestore | O docstring do entrypoint descreve uma arquitetura que não é mais a vigente. Mesmo problema em `instance.ts:6-7` ("dormentes até lá", "Fase 4B"). Quem ler o arquivo — humano ou agente — conclui o oposto do que roda. |
| `seed/manifest.ts` ↔ Firestore | grounding — verificar estado real antes de assumir; governance — config sem drift | ⚠️ | `manifest.ts:16` semeia `toolRefs: DEFAULT_AGENT_TOOLS[id]` (13 keys para `descriptive`); doc real `aiAgents/descriptive` tem `toolRefs: []` (`updatedAt` 2026-06-18T21:49Z) | Drift entre manifest e config viva: `ensureSeed` sem `--force` não reconcilia docs existentes (`ensure-seed.ts:15-17`). Efeito funcional é nulo (o código faz fallback em `create-mastra-agent-from-config.ts:50`), mas a UI do AI Studio mostra "0 tools" para os 9 agentes e o campo deixa de ser a fonte de verdade que a arquitetura promete. |
| `evals/` + CI | harness-engineering §Eval layer — golden sets, regression em CI, LLM-as-judge, drift detection | ✅ | `.github/workflows/agent-evals.yml:11-24` (smoke em PR path-filtered, full semanal, drift mensal), `:60-63,113,145-147`; `evals/scorers/judges/rubrics/*`; `evals/drift/detect-drift.ts` | A camada mais aderente da revisão: golden/smoke/full, judge com rubricas versionadas, detector de drift, gate de p50 ≥ 0.7 e budget de custo. |
| `evals/` | testing §14 — "teste agentes em dois níveis: unitário com LLM mockado e integração ocasional com LLM real em pipeline dedicado" | ✅ | `agent-evals.yml:11-14,92-113` (real em schedule, não por commit); 124 arquivos `*.test.ts` na camada | Exatamente o arranjo que a regra pede. |
| Camada de IA | testing §21 — "trate falha de teste em main como bloqueador" (pressupõe suíte no CI) | ❌ | `.github/workflows/` contém **um único** workflow (`agent-evals.yml`); nenhum job roda `pnpm test`, `pnpm lint` ou `pnpm build` | Os 124 testes da camada de IA nunca rodam em CI. Só os evals rodam — e apenas em PRs que tocam os paths filtrados (`agent-evals.yml:13-21`). |
| Testes da camada | testing §22 — sem `.only`/`.skip` commitado; §3 nomes descritivos | ✅ | Nenhuma ocorrência de `.only(`/`.skip(` nos testes da camada; ex.: `citation-grounding.test.ts:27` | — |
| Camada de IA | ai-friendly-code §1 — arquivos de 150–500 linhas; >1000 é anti-pattern | ✅ | Maior arquivo não-teste da camada: `shared/config/agents/types.ts` (509 linhas); depois `canvas-orchestrator.ts` (373) | Nenhum arquivo acima de 510 linhas em 17.469 linhas de código na camada. |
| Camada de IA | ai-friendly-code §6 — named exports, imports explícitos, path aliases | ✅ | `tool-registry.ts:11-72` (imports nomeados via `@/`), `orchestrator.ts:7-36` | `export default` só nos route handlers, onde o framework exige. |
| `shared/config/agents/*` | harness-engineering §Prompt layer — "System prompts versionados em git, nunca em string literal solta" | ✅ | `src/shared/config/agents/{descriptive,diagnostic,…}-agent.ts`; `seed/manifest.ts:34-42` | Prompts em git são a fonte do seed; Firestore é a camada editável por cima, com fallback no código. Arranjo coerente com a convenção. |
| `build-system.ts`, `orchestrator.ts` | security §14 — "Nunca concatene input do usuário direto no system prompt" | ✅ | `orchestrator.ts:239` (`briefing: extractLastUserText(...)`) → `composeSystemPrompt` `:294-303` usa o briefing **só** como query de retrieval; `buildAgentSystem` (`build-system.ts:142-192`) não recebe o briefing | Tentei refutar e o código se defende: o texto do usuário alimenta a busca, não o prompt. |
| `build-system.ts` | harness-engineering §Guardrail — instruction hierarchy; "user input sempre dentro de tags XML" | ⚠️ | `build-system.ts:130-140` (`renderRetrieved` injeta chunks recuperados no system prompt sem delimitador de dado não-confiável) | Os chunks vêm de KB/RAG do próprio tenant, então o risco é baixo — mas conteúdo recuperado entra no system prompt como se fosse instrução, sem `<contexto>…</contexto>` nem aviso de "trate como dado". |
| `orchestrator.ts` | vercel-ai-sdk §Telemetria — "`recordInputs`/`recordOutputs` **default true** — desligar explicitamente em qualquer rota com PII" | ⚠️ | `orchestrator.ts:191-200` (`experimental_telemetry` sem `recordInputs`/`recordOutputs`) | Hoje inócuo porque não há exporter OTel registrado; vira exposição de prompt/response no instante em que alguém ligar telemetria. Corrigir junto com o item de observability. |
| `shared/lib/rag/` | mastra-sdk §RAG — pipeline chunk → embed → store → retrieval → reranking | ✅ (impl. própria) | `rag/{chunker,embeddings,rag-service,reranker,metadata-extractor}.ts` | Não usa `@mastra/rag` (não instalado). ADR-0013 escolheu Firestore + cosine brute-force em vez de pgvector, o que torna a recomendação de vector store da convenção n/a. Pipeline conceitual está completo, incluindo reranking. |
| `canvas-orchestrator/workflow/` | mastra-sdk §Workflows — `createWorkflow`/`createStep` com retries e snapshot | ⚠️ | `canvas-orchestrator/workflow/{create-step,create-workflow,branch,foreach,dountil}.ts` (engine caseiro) | Reimplementa primitivas que `@mastra/core/workflows` já oferece — o pacote **está** instalado. Sem suspend/resume nem snapshot persistente. Justificável historicamente (o engine é anterior à ADR-0014), mas hoje é duplicação de responsabilidade. |
| `canvas-orchestrator/workflow/` | mastra-sdk §Anti-patterns — "Workflows sem observabilidade são pior que código imperativo. Se desligou OTEL, não use workflows" | ⚠️ | `orchestrator-workflow.ts:50-54` (`recordSpan`, que é `console.log`) | Há instrumentação por step (`foreach.ts` também usa `recordSpan`), mas não é OTel — cai no mesmo problema do item de observability. |

**Total: 58 linhas de aderência.**

Distribuição: ✅ 25 · ⚠️ 15 · ❌ 17 · n/a 1.

---

## Achados mais graves

### 1. Observabilidade de LLM é inexistente em produção (❌)

Não há OpenTelemetry na camada: nenhum pacote `@opentelemetry/*` em `package.json`, nenhum `instrumentation.ts`, e `new Mastra({ agents })` (`instance.ts:47`) sem bloco `telemetry`. O `experimental_telemetry` ligado em `orchestrator.ts:191-200` não exporta nada sem um SDK OTel registrado. O substituto é `record-span.ts:14`, que serializa um pseudo-span em `console.log` — exatamente o "trace como log" proibido em observability §Os três pilares.

Consequência prática: **zero visibilidade de tokens, custo em USD, latência por modelo e `finish_reason`** nas duas rotas LLM. Isso agrava três outros itens desta revisão — sem custo observado, o budget de produção ausente não tem como ser calibrado; sem `finish_reason`, resposta truncada é indistinguível de resposta completa; sem tokens, a ausência de context caching do Vertex não tem como ser priorizada.

### 2. O prompt em produção exige citação de fonte e nada verifica (❌)

`aiWorkflows/default.instruction` (verificado no Firestore, espelhado em `seed/manifest.ts:51`) manda "compor uma resposta clara com citações de fonte quando houver afirmação numérica ou regulatória". A validação que faria isso valer não existe: `require-citation` só aparece em spec (`docs/superpowers/specs/2026-05-04-sprint3-D-evals-scorers-dataset.md:351-354`) e `validateAgentResult` não existe no repo. O scorer `evals/scorers/citation-grounding.ts` é eval offline, não guardrail de runtime, e Mastra oferece `processors` como substituto direto do output processor removido — disponível e não usado.

Num produto de securitização de crédito, é a diferença entre uma afirmação regulatória fundamentada e uma alucinação com aparência de fundamentada — o cenário que harness-engineering §Falha visível trata como o pior modo de falha de sistemas de IA.

### 3. Duas rotas LLM autenticadas sem cap de custo em nenhuma dimensão (❌)

Combinação de quatro ausências no mesmo caminho: sem rate limiting (nenhum `429`/`Retry-After` em `app/api/**`, nenhum `middleware.ts`), sem budget de tokens por usuário/tenant (o único budget é de evals, `cost-budget.ts:28`), sem `abortSignal` propagado (`orchestrator.ts:188-245`, `route.ts:151-153` — cliente que desconecta não cancela a geração), e sem `maxSteps` no caminho Mastra (`create-mastra-agent-from-config.ts:60-65`). Com `maxDuration` de 300s e 600s, um usuário autenticado pode abrir requisições caras em paralelo sem teto server-side — violando security §8 em ambas as cláusulas.

O `maxSteps` merece nota: Mastra o suporta (`agent.types.d.ts:296,402-405`) e seu default não é infinito (1 ou 5 conforme o caminho), então o risco não é loop descontrolado e sim **truncamento silencioso** de um agente que precisa de schema → SQL → resposta. Nos dois casos, o cap precisa ser explícito.

---

## Observações secundárias

- **Docstrings contradizem o código no entrypoint.** `route.ts:12-15` afirma que os sub-agentes não foram migrados e que `/api/chat` opera como agente único descritivo; `resolve-chat-agent.ts:43-50` constrói o supervisor com os 8 e `aiWorkflows/default` está ativo. Idem `instance.ts:6-7`. Correção de baixo custo e alto retorno para grounding.
- **Drift de config viva.** Os 9 docs em `aiAgents` têm `toolRefs: []`, enquanto `manifest.ts:16` semeia as keys de `DEFAULT_AGENT_TOOLS`. Sem efeito funcional (há fallback em `create-mastra-agent-from-config.ts:50`), mas a UI do AI Studio mostra 0 tools por agente e o campo deixa de ser fonte de verdade. Resolve com `ensureSeed --force`.
- **Memória de thread criada e não usada no caminho analítico.** `/api/chat` cria a thread e devolve `x-thread-id` (`route.ts:105-112,189`), mas `agent.stream()` não recebe `threadId`/`resourceId` e `ctx.memory` fica sempre `undefined`. O canvas usa working memory corretamente (`orchestrator.ts:81-97`) — a lacuna é só de um lado.
- **36 tools num prompt único no canvas** (`orchestrator.ts:99-186`), contra o teto de ~10 das convenções. O caminho analítico já resolveu isso com router + sub-agentes; o canvas tem o embrião (`build_dashboard_workflow`) atrás de flag default-OFF.
- **Versões com caret** em `@mastra/core`, `ai` e `@ai-sdk/google-vertex`, contra o pin exato exigido por mastra-sdk §Versão e security §9.
- **Suíte de testes fora do CI.** Existe um único workflow (`agent-evals.yml`); os 124 arquivos de teste da camada nunca rodam em PR.
- **As convenções de AI SDK e Mastra estão desatualizadas** em relação ao projeto (doc pinada em `ai@4.x` e `@mastra/core@0.x`; projeto em `ai@6` e `@mastra/core@1.32`). Avaliei contra o espírito das regras, mas vale sincronizar `.contexts/engineering/stacks/ai/{vercel-ai-sdk,mastra-sdk}.md` — hoje um agente que as siga literalmente escreveria código incompatível com o repo.

## Pontos fortes

Vale registrar, porque contrastam com os achados: o **isolamento multi-tenant** nas duas rotas é rigoroso e bem comentado (`route.ts:94-103`), com teste adversarial cross-tenant; a **guarda SELECT-only** de `execute-sql.ts:9-11` varre a query inteira e fecha o bypass por CTE; o **scrubbing de PII** é aplicado consistentemente nos 8 pontos onde texto vira embedding ou documento persistido; a **camada de evals** é a mais aderente do escopo (golden/smoke/full, judge com rubricas versionadas, drift, budget de custo, gate de p50 em CI); e `compact-messages.ts` é um exemplo de código bem fundamentado — teto duplo, piso de turnos intactos, env documentada e o raciocínio inteiro registrado em comentário.
