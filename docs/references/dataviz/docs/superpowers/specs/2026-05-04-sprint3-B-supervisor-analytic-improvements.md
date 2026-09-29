# Sprint 3.B — Supervisor Analítico Melhorado (Phase Gating + Prompt Cache + Telemetry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o orchestrator analítico (`src/features/ai-agents/orchestrator.ts`) sem migrar para `Agent.network` (deprecated). Introduzir (1) **tool-gating por fase** via `prepareStep` (`discovery → diagnosis → prescription → monitoring`), (2) **compactação dinâmica** com summary do step anterior, (3) **tool-piping declarativo** via hints estruturadas, (4) **telemetria por sub-agente** reusando `recordSpan` (Sprint 1.B), e (5) **Vertex prompt cache** (`google.cachedContent`) para system prompts estáveis dos sub-agentes elegíveis. Reduz ≥20% tokens, mantém p95 latência em paridade, hit-rate ≥60% em sessões longas.

**Architecture:** Mantém o supervisor `streamText` existente. `prepareStep` é o ponto de inserção: a cada step do loop interno do AI SDK v6 (`adrs/vercel-ai-sdk.md` §4.3), inferimos a fase atual a partir das mensagens e dos resultados acumulados, restringimos `activeTools`, podamos `messages` e injetamos summary + hints no `system`. Telemetria emite spans `recordSpan({ agent, model, phase, tokensIn, tokensOut, durationMs, status })` consumidos pelo painel `/admin/orchestrator-analytics`. Prompt cache é resolvido na boot do servidor (singleton) com TTL configurável e fallback gracioso. Feature-flag `useImprovedSupervisor` no app-store dirige rollout A/B.

**Tech Stack:** AI SDK v6 (`prepareStep`, `dynamicTool`, `customProvider`, `cachedContent`), Vertex Gemini via `@ai-sdk/google-vertex@^4.0.80`, Vitest 4.x (Sprint 1.A), `recordSpan` (Sprint 1.B), `buildAgentSystem` dinâmico (Sprint 1.D), `retrieve_business_context` (Sprint 2.D, opcional), Zustand (`app-store`), Recharts (painel admin).

---

## Context

Plano-fonte: `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §5 (Agent Network ⇄ Orchestrator Analítico) e §6 Fase 3.

Codebase atual relevante:

- `src/features/ai-agents/orchestrator.ts` (57 LOC) — `streamText` único com 10 tools (8 sub-agentes + `generate_pdf` + `generate_csv`). Hoje sem `prepareStep`, sem tool-gating, sem cache. `compactMessages` em `lib/compact-messages.ts` é estático (corte por contagem).
- `src/features/ai-agents/agents/{descriptive,diagnostic,predictive,simulation,prescriptive,monitoring,cashflow,external}-agent.ts` — cada sub-agente exposto como tool via `createAgentTool`.
- `src/features/ai-agents/create-agent-tool.ts` — wrapper que monta sub-`generateText` por agente, já usa `withRetry`.
- `src/features/ai-agents/model-registry.ts` — `getModel('router' | 'analyst' | ...)` + `getProviderOptions`. Ponto natural para anexar `cachedContent` por agente.
- `src/features/ai-agents/lib/compact-messages.ts` — versão V1 (slice by count). Sprint 3.B introduz `compactMessagesV2(messages, summary)`.
- `src/shared/lib/telemetry/record-span.ts` (Sprint 1.B) — assinatura `recordSpan({ name, attributes, status, durationMs })`. Reuse direto.
- `src/shared/config/agents/orchestrator-prompt.ts` — `buildOrchestratorPrompt(ctx)` (sob `Sprint 1.D` ficou dinâmico). Adicionar bloco condicional por fase.
- `src/shared/stores/app-store.ts` — adicionar slice `featureFlags.useImprovedSupervisor` (boolean, persisted).
- `app/(dashboard)/admin/` — local para nova rota `orchestrator-analytics/page.tsx`.

**Importante:** `Agent.network` segue deprecated (`adrs/mastra/agents/network.mdx:14-18`). Não migrar. Todos os ganhos vêm via AI SDK v6 nativo. `cachedContent` pode degradar se a versão atual do `@ai-sdk/google-vertex` não expuser o campo — fallback obrigatório (feature-flag `useVertexPromptCache`).

---

## File Structure

```
src/
├── features/
│   └── ai-agents/
│       ├── orchestrator.ts                              # MODIFY - wire prepareStep, telemetry, flag
│       ├── orchestrator.test.ts                         # NEW
│       ├── phases/
│       │   ├── types.ts                                 # NEW - OrchestratorPhase, PhaseContext
│       │   ├── phase-to-tools.ts                        # NEW - phaseToActiveTools()
│       │   ├── phase-to-tools.test.ts                   # NEW
│       │   ├── infer-phase.ts                           # NEW - inferPhase() heurística
│       │   ├── infer-phase.test.ts                      # NEW
│       │   ├── tool-piping-hints.ts                     # NEW - tabela de hints por sub-agente
│       │   ├── tool-piping-hints.test.ts                # NEW
│       │   ├── prepare-step.ts                          # NEW - factory prepareStep()
│       │   └── prepare-step.test.ts                     # NEW
│       ├── lib/
│       │   ├── compact-messages-v2.ts                   # NEW - poda + summary injection
│       │   ├── compact-messages-v2.test.ts              # NEW
│       │   ├── summarize-step.ts                        # NEW - Gemini Flash summary
│       │   ├── summarize-step.test.ts                   # NEW
│       │   └── compact-messages.ts                      # (existing, V1, mantido)
│       ├── cache/
│       │   ├── vertex-cached-content.ts                 # NEW - boot-time cache + fallback
│       │   ├── vertex-cached-content.test.ts            # NEW
│       │   └── cacheable-agents.ts                      # NEW - lista elegíveis (>32k)
│       └── telemetry/
│           ├── record-sub-agent-span.ts                 # NEW - wrapper com schema
│           └── record-sub-agent-span.test.ts            # NEW
├── shared/
│   ├── stores/
│   │   └── app-store.ts                                 # MODIFY - featureFlags.useImprovedSupervisor
│   └── config/
│       └── agents/
│           ├── orchestrator-prompt.ts                   # MODIFY - blocos condicionais por fase
│           └── orchestrator-prompt.test.ts              # NEW
app/
└── (dashboard)/
    └── admin/
        └── orchestrator-analytics/
            ├── page.tsx                                 # NEW - dashboard p50/p95
            └── ui/
                ├── OrchestratorAnalyticsPage.tsx        # NEW
                ├── PhaseTable.tsx                       # NEW
                ├── SubAgentMetricsCard.tsx              # NEW
                └── RetryRateChart.tsx                   # NEW
adrs/
└── decisions/
    └── 0008-phase-based-tool-gating-prepare-step.md     # EXISTING (Accepted) — referenced, not recreated
docs/superpowers/specs/
└── 2026-05-04-sprint3-B-acceptance.md                   # NEW (Task 13)
scripts/
└── ab-test-supervisor.ts                                # NEW - 30 conversações on/off
```

---

## Tasks

### Task 1: Referenciar ADR-0008 + tipos de fase

- [ ] **Step 1.1:** ADR-0008 (`adrs/decisions/0008-phase-based-tool-gating-prepare-step.md`) já existe e está aceita; este sprint é a sua implementação. Conferir aderência (motivação, alternativas descartadas — Agent.network deprecated, workflow puro —, decisão `prepareStep` + `activeTools` por fase, consequências, reversibilidade via feature-flag) e linkar no PR. Não recriar ADR.
- [ ] **Step 1.2:** Criar `src/features/ai-agents/phases/types.ts`:
  ```ts
  export type OrchestratorPhase = 'discovery' | 'diagnosis' | 'prescription' | 'monitoring';
  export interface PhaseContext {
    phase: OrchestratorPhase;
    confidence: number;        // 0..1
    reason: string;            // log/telemetry
    fallbackToAuto: boolean;   // após 2 erros de gating
  }
  export type SubAgentName =
    | 'descriptive_agent' | 'diagnostic_agent' | 'predictive_agent'
    | 'simulation_agent'  | 'prescriptive_agent' | 'monitoring_agent'
    | 'cashflow_agent'    | 'external_agent';
  ```
- [ ] **Step 1.3:** Commit: `feat(ai-agents): add OrchestratorPhase types (impl ADR-0008)`.

### Task 2: `phaseToActiveTools()` (TDD)

- [ ] **Step 2.1:** Tests-first (`phase-to-tools.test.ts`):
  - `discovery` → `['descriptive_agent', 'cashflow_agent', 'external_agent']` + utilitárias (`generate_pdf`, `generate_csv`).
  - `diagnosis` → discovery ∪ `['diagnostic_agent', 'predictive_agent', 'simulation_agent']`.
  - `prescription` → diagnosis ∪ `['prescriptive_agent']`.
  - `monitoring` → all sub-agentes (cobertura completa, monitoria contínua).
  - Transições válidas: discovery→diagnosis→prescription→monitoring; saltos para trás permitidos (usuário pode voltar).
  - `fallbackToAuto: true` retorna `undefined` (= todas tools, AI SDK trata como sem filtro).
- [ ] **Step 2.2:** Implementar `phase-to-tools.ts` com mapping puro + tabela exportável `PHASE_TOOL_MAP`.
- [ ] **Step 2.3:** Commit: `feat(ai-agents): phase-to-active-tools mapping with TDD`.

### Task 3: `inferPhase(messages, lastResults)` (TDD)

- [ ] **Step 3.1:** Tests-first (`infer-phase.test.ts`):
  - Mensagem inicial sem tool calls → `discovery`, confidence ≥ 0.8.
  - Após `descriptive_agent` returnar dados → `diagnosis`, confidence ≥ 0.7.
  - Após `diagnostic_agent` retornar hipóteses (regex `hipótese|causa|driver`) → `prescription`.
  - Mensagem do usuário com keywords (`recomende|action|próximos passos`) → `prescription`.
  - Mensagem com `monitorar|alerta|threshold` → `monitoring`.
  - Sem sinais → fallback `discovery` com confidence 0.4.
  - Após 2 `tool-error` consecutivos com `phase-gating` → `fallbackToAuto: true`.
- [ ] **Step 3.2:** Implementar heurística keyword-based + análise de `stepResults` (toolName histórico).
- [ ] **Step 3.3:** Commit: `feat(ai-agents): infer-phase heuristic with fallback`.

### Task 4: `compactMessagesV2(messages, summary)` (TDD)

- [ ] **Step 4.1:** Tests-first:
  - Retorna `messages.slice(-10)` quando `length > 10`.
  - Quando `summary` fornecido, prepend `system` message com `[SUMMARY_PREVIOUS_STEP] ${summary}`.
  - Sempre preserva mensagens dos últimos 3 steps (summary é additive, não substitutivo) — risco mitigation §6 plano-fonte.
  - Idempotente sob re-aplicação.
- [ ] **Step 4.2:** Implementar em `lib/compact-messages-v2.ts`. Manter V1 intacto.
- [ ] **Step 4.3:** Commit: `feat(ai-agents): compact-messages-v2 with summary injection`.

### Task 5: `summarizeStep(stepResults)` via Gemini Flash (TDD)

- [ ] **Step 5.1:** Tests-first (mock `generateText`):
  - Recebe array de `{ toolName, output }` do step anterior, retorna string ≤ 280 caracteres.
  - Concatena `toolName: <one-line>` por entrada.
  - Em erro do model retorna `''` (degradação silenciosa, log warn).
  - Aborta após 5s (`AbortSignal.timeout`).
- [ ] **Step 5.2:** Implementar `lib/summarize-step.ts` chamando `getModel('flash')` (registrar em `model-registry.ts` se não existir) com prompt fixo `Resuma em 1 frase o que cada tool retornou:`.
- [ ] **Step 5.3:** Commit: `feat(ai-agents): summarize-step via gemini-flash with timeout`.

### Task 6: Tool-piping hints (TDD)

- [ ] **Step 6.1:** Tests-first (`tool-piping-hints.test.ts`):
  - `getHintAfter('descriptive_agent')` → `'Considere chamar diagnostic_agent se houver anomalia ou variação inesperada.'`
  - `getHintAfter('diagnostic_agent')` → menciona `predictive_agent` E `prescriptive_agent`.
  - `getHintAfter('predictive_agent')` → menciona `simulation_agent`.
  - `getHintAfter('simulation_agent')` → menciona `prescriptive_agent`.
  - `getHintAfter('prescriptive_agent')` → menciona `monitoring_agent`.
  - Sub-agente desconhecido → `''`.
- [ ] **Step 6.2:** Implementar tabela em `tool-piping-hints.ts`.
- [ ] **Step 6.3:** Commit: `feat(ai-agents): tool-piping hint table per sub-agent`.

### Task 7: `prepareStep` factory (TDD)

- [ ] **Step 7.1:** Tests-first (`prepare-step.test.ts`):
  - Retorna `{ activeTools, system, messages }` no shape esperado pelo AI SDK v6.
  - Combina: `inferPhase` → `phaseToActiveTools` → `compactMessagesV2` (com summary do step anterior obtido via `summarizeStep`) → injeta hint do último sub-agente chamado.
  - `phase` registrado em `recordSpan` ao final do step (Task 10).
  - Quando flag `useImprovedSupervisor=false` retorna `undefined` (no-op, AI SDK comportamento default).
  - Tentativa de chamar `prescriptive_agent` na fase `discovery` é interceptada: retorna `tool-error` tipado com `code: 'PHASE_GATING'` e mensagem sugerindo `descriptive_agent`. Após 2 ocorrências, `fallbackToAuto=true` no próximo step.
- [ ] **Step 7.2:** Implementar `prepare-step.ts` exportando `createPrepareStep(ctx, flags) => PrepareStepFn`.
- [ ] **Step 7.3:** Commit: `feat(ai-agents): prepareStep factory composing phase gating + compaction`.

### Task 8: Vertex `cachedContent` (TDD + fallback)

- [ ] **Step 8.1:** Criar `cache/cacheable-agents.ts` listando agentes com system prompt > 32k tokens (descriptive, diagnostic, predictive). Estimativa por contagem de chars / 4.
- [ ] **Step 8.2:** Tests-first (`vertex-cached-content.test.ts`):
  - `bootCachedContents()` chama API uma vez por agente elegível, registra TTL (env `VERTEX_CACHE_TTL_SECONDS`, default 3600).
  - Retorna `Map<SubAgentName, CachedContentRef>`.
  - Em erro (API indisponível, version mismatch) loga warn e retorna `Map` vazio (degradação graciosa).
  - `getCachedContentFor(agent)` retorna `undefined` se não cacheado.
  - TTL expira → re-cria automaticamente no próximo `getCachedContentFor`.
- [ ] **Step 8.3:** Implementar com try/catch envolvendo `vertex.cachedContents.create` (verificar disponibilidade real em `@ai-sdk/google-vertex@^4.0.80`; se ausente, stub que sempre retorna vazio + log).
- [ ] **Step 8.4:** Wire em `model-registry.ts`: `getProviderOptions(agent)` injeta `google.cachedContent: ref` quando disponível.
- [ ] **Step 8.5:** Boot-time call em `app/api/agent/route.ts` (uma vez por cold start, lazy).
- [ ] **Step 8.6:** Commit: `feat(ai-agents): vertex cachedContent with graceful fallback`.

### Task 9: `recordSubAgentSpan` (TDD)

- [ ] **Step 9.1:** Tests-first (`record-sub-agent-span.test.ts`):
  - Schema validado: `{ agent: SubAgentName, model: string, phase: OrchestratorPhase, tokensIn: number, tokensOut: number, durationMs: number, status: 'done'|'error'|'awaiting_input' }`.
  - Delega para `recordSpan` com `name: 'sub-agent.invoke'` e attributes prefixados `sub_agent.*`.
  - `cacheHit?: boolean` opcional (true quando `cachedContent` foi usado).
- [ ] **Step 9.2:** Implementar wrapper.
- [ ] **Step 9.3:** Commit: `feat(ai-agents): record-sub-agent-span typed wrapper`.

### Task 10: Wire orchestrator (`prepareStep` + telemetry + flag)

- [ ] **Step 10.1:** Modificar `orchestrator.ts`:
  - Ler `useImprovedSupervisor` do contexto (vem do request, propagado pela rota).
  - Se on: `prepareStep: createPrepareStep(ctx, flags)`; senão omitir.
  - Envolver cada chamada de sub-agente (em `create-agent-tool.ts`) com `recordSubAgentSpan`.
  - Trocar `compactMessages` → `compactMessagesV2` (com summary obtido em prepareStep, persistido em `ctx.lastSummary`).
- [ ] **Step 10.2:** Tests `orchestrator.test.ts` (integration, mock model):
  - Flag off: comportamento idêntico ao baseline (snapshot).
  - Flag on: emit ≥1 span `sub-agent.invoke` com `phase`.
  - Tentativa de tool fora de fase → `tool-error` tipado.
- [ ] **Step 10.3:** Commit: `feat(ai-agents): wire prepareStep + telemetry into orchestrator`.

### Task 11: App-store flag

- [ ] **Step 11.1:** Adicionar slice `featureFlags` em `app-store.ts`:
  ```ts
  featureFlags: {
    useImprovedSupervisor: boolean;
    useVertexPromptCache: boolean;
  }
  ```
  Persisted (zustand persist middleware existente).
- [ ] **Step 11.2:** Toggle em `/admin` (botão + aviso "experimental").
- [ ] **Step 11.3:** Propagar flag no body do POST `/api/agent` → `OrchestratorInput`.
- [ ] **Step 11.4:** Tests: flag persiste após reload (jsdom localStorage mock).
- [ ] **Step 11.5:** Commit: `feat(app-store): featureFlags slice for supervisor rollout`.

### Task 12: Dashboard `/admin/orchestrator-analytics`

- [ ] **Step 12.1:** Criar `app/(dashboard)/admin/orchestrator-analytics/page.tsx` que renderiza `OrchestratorAnalyticsPage`.
- [ ] **Step 12.2:** Hook `useOrchestratorMetrics()` que consulta endpoint `/api/admin/orchestrator-metrics` (lê spans persistidos — Sprint 1.B baseline). Agrupa por `phase` e `sub_agent.name`.
- [ ] **Step 12.3:** UI: tabela p50/p95 latência por fase + sub-agente; gráfico Recharts retry rate ao longo do tempo; cache hit rate badge global.
- [ ] **Step 12.4:** Engenharia de contexto: invocar `ux-dashboard-analyst` (subagent) para revisar UI antes do merge.
- [ ] **Step 12.5:** Commit: `feat(admin): orchestrator-analytics dashboard with phase metrics`.

### Task 13: A/B test acceptance script + dataset

- [ ] **Step 13.1:** Criar `scripts/ab-test-supervisor.ts`:
  - Carrega 30 conversações sintéticas (curadas via `credit-risk-analyst` subagent — Step 13.2) cobrindo as 4 fases.
  - Roda cada uma com flag off e on, paralelizando com `pLimit(3)`.
  - Salva CSV com `tokensIn`, `tokensOut`, `durationMs`, `phasesObserved`, `quality.hasHypothesis` (regex), `quality.citesSource` (regex).
- [ ] **Step 13.2:** Invocar `credit-risk-analyst` para curar dataset realista (BRZ/OM cenários), salvo em `scripts/datasets/supervisor-eval.jsonl`.
- [ ] **Step 13.3:** Acceptance doc `docs/superpowers/specs/2026-05-04-sprint3-B-acceptance.md` com baseline ↔ improved comparison + assinatura.
- [ ] **Step 13.4:** Commit: `test(ai-agents): A/B harness + curated dataset for supervisor`.

### Task 14: Smoke E2E manual + verification

- [ ] **Step 14.1:** Subir `pnpm dev`. Conversação real cobrindo `discovery → diagnosis → prescription → monitoring`. Validar:
  - Nenhuma tool fora de fase chamada (lendo logs `recordSpan`).
  - Hint apareceu no system após cada tool.
  - Cache hit em sessão > 3 turnos (badge no admin).
- [ ] **Step 14.2:** Invocar skill `superpowers:verification-before-completion` antes de declarar done.
- [ ] **Step 14.3:** Smoke do dashboard `/admin/orchestrator-analytics` (verificar p50/p95 não-zero).
- [ ] **Step 14.4:** Commit: `chore(ai-agents): sprint 3.B smoke verified`.

---

## Acceptance Criteria

- [ ] Redução média de **tokens consumidos ≥ 20%** (flag on vs off, dataset 30 conversações, Task 13).
- [ ] **p95 latência por sub-agente** em paridade ou melhor que baseline (`recordSpan` Sprint 1.B).
- [ ] **Cache hit rate ≥ 60%** em sessões com > 3 turnos (admin dashboard).
- [ ] Tool-gating funcional: `prescriptive_agent` em fase `discovery` → `tool-error` tipado `PHASE_GATING` sugerindo `descriptive_agent`.
- [ ] Após 2 erros de gating → `fallbackToAuto=true` próximo step (sem travar conversa).
- [ ] **Cobertura ≥ 85%** em `src/features/ai-agents/phases/` (vitest --coverage).
- [ ] Todos os spans novos visíveis em `/admin/orchestrator-analytics` com filtro por fase.
- [ ] Flag `useImprovedSupervisor=false` reproduz baseline byte-by-byte (snapshot test).
- [ ] `cachedContent` indisponível na lib → log warn, fluxo continua, sem crash.
- [ ] Quality heurística: ≥ 80% das respostas (flag on) contêm hipótese explícita ou cita fonte (vs baseline a medir).

---

## Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Phase inference errada bloqueia tools necessárias | Fallback para `auto` após 2 `tool-error`s consecutivos com code `PHASE_GATING`; confidence < 0.5 já entra em fallback |
| `cachedContent` API incompatível com `@ai-sdk/google-vertex@^4.0.80` | Feature-flag `useVertexPromptCache` + degradação graciosa (Map vazio); ADR-0008 documenta path de upgrade |
| Compactação V2 remove contexto crítico | Summary é additive (não substitutivo); preserva últimos 3 steps integrais; testes idempotência |
| Summary chama Gemini Flash em todo step → custo extra | Cache de summary por `stepId`; timeout 5s; fallback string vazia |
| A/B test inconclusivo (variância alta) | n=30 com seed determinístico; bootstrap CI 95% no script; `credit-risk-analyst` cura cenários cobrindo 4 fases |
| Dashboard admin acessível por não-admin | Guard route via `useAuth` + claim `admin`; fallback 403 |
| Hint poluindo prompt e enviesando modelo | Hint ≤ 80 chars; A/B mede `quality.hasHypothesis` para detectar regressão |

---

## Engenharia de Contexto

- **ADR:** ADR-0008 "Phase-based Tool Gating no Orchestrator Analítico via `prepareStep`" (já aceita; este sprint é a implementação).
- **Skills obrigatórias:** `superpowers:test-driven-development` (Tasks 2–9), `superpowers:verification-before-completion` (Task 14), `superpowers:systematic-debugging` (qualquer task com falha).
- **Subagents:**
  - `credit-risk-analyst` → curar dataset 30 conversações (Task 13.2).
  - `ux-dashboard-analyst` → revisar `/admin/orchestrator-analytics` antes do merge (Task 12.4).

---

## Self-Review

- [ ] Cada task entrega valor isolado e tem TDD onde aplicável.
- [ ] Telemetria nova (`recordSubAgentSpan`) reusa `recordSpan` Sprint 1.B sem reinventar.
- [ ] Feature-flag `useImprovedSupervisor` permite rollback instantâneo.
- [ ] Fallback gracioso para `cachedContent` evita acoplamento à API specific da lib.
- [ ] Phase inference com confidence + fallback evita travar conversa em sinais fracos.
- [ ] Acceptance mensurável (≥20% tokens, ≥60% cache hit, ≥85% coverage).
- [ ] Sem migração para `Agent.network` (deprecated) — mantém supervisor existente, ganhos puramente via AI SDK v6.
- [ ] Compactação V2 preserva últimos 3 steps (summary additive) — risco do plano-fonte §6 endereçado.
- [ ] Dashboard admin gated por claim — não vaza métricas internas.
- [ ] A/B test com `credit-risk-analyst` curador garante representatividade real.

---

## Resumo (≤100 palavras)

Sprint 3.B evolui o orchestrator analítico via AI SDK v6 `prepareStep`, sem migrar para `Agent.network` (deprecated). Introduz **4 fases** (discovery/diagnosis/prescription/monitoring) com **tool-gating** (`activeTools` por fase), **compactação V2** (poda + summary additive), **tool-piping hints** declarativas e **Vertex `cachedContent`** para system prompts >32k. Telemetria por sub-agente reusa `recordSpan` (Sprint 1.B). Feature-flag `useImprovedSupervisor` dirige rollout A/B (30 conversações curadas pelo `credit-risk-analyst`). Acceptance: ≥20% economia de tokens, ≥60% cache hit, p95 em paridade, ≥85% coverage. Fallback gracioso protege contra `cachedContent` indisponível e phase inference errada.
