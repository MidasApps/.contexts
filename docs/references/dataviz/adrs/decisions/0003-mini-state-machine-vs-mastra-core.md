---
id: 0003
title: Mini state-machine interna vs `@mastra/core` workflows
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, workflow, canvas-orchestrator, state-machine]
supersedes: []
related: [0002]
---

# ADR-0003 — Mini state-machine interna sobre AI SDK v6

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.
- 2026-05-04 — implementação Sprint 2.B concluída (~440 LOC core + 6 primitives + 6 steps + 1 sub-workflow). Validado em smoke E2E com flag `useWorkflowOrchestrator`. Gatilhos de migração futura confirmados: suspend/resume, snapshot persistido, cron scheduler, observability UI.

## Contexto

O Canvas Orchestrator (`src/features/canvas-orchestrator/orchestrator.ts`) é hoje um
único `streamText` com 23 tools e `stopWhen: stepCountIs(30)`. O modelo decide a
ordem em runtime. Funciona, mas tem limites que o paralelismo do AI SDK por si só não
resolve (vide diagnóstico em `2026-05-04-mastra-workflows-network.md` §1):

- **Drift de plano**: o modelo às vezes "esquece" de declarar layout antes de preencher
  blocos, ou re-consulta schemas já vistos. `stepCountIs(30)` é teto, não estrutura.
- **Branching implícito**: "BQML disponível? usa `ML.FORECAST`" e "cliente=OM → persona X"
  diluídos no system prompt, não verificáveis em teste.
- **Sem retry estruturado por slot**: SQL inválido volta como tool-error, modelo retenta
  livremente; não há `dountil(valid, max=3)` por bloco.
- **Lógica de geração+validação dentro do loop do modelo**: não há `Promise.allSettled`
  determinístico, retry granular por slot, error handling estruturado nem branches
  condicionais confiáveis.

A motivação real para uma state-machine **não é vencer serialização que não existe**
(o AI SDK já paraleliza tool calls). É **disciplina arquitetural**: tornar o pipeline
`plan → gather → layout → fill → validate → render` explícito, tipado, testável,
idempotente por step e cancelável globalmente.

Forças sobre a escolha de **como** implementar a state-machine:

- ADR-0002 estabelece "Mastra-as-library, não Mastra full". `@mastra/core/workflows`
  é parte do runtime full — adoção contradiz ADR-0002.
- O conjunto necessário cabe em **6 primitives**: `createStep`, `then`, `parallel`,
  `foreach`, `branch`, `dountil`. Sem suspend/resume, sem persistência, sem cron.
- Estimativa do plano: 350-500 LOC TypeScript sobre AI SDK quando incluímos tipagem
  encadeada (output do step N = input do step N+1), error handling com agregação,
  `AbortSignal` propagado, validação Zod entre steps, `dountil` com max-attempts,
  `foreach` com concurrency cap.
- A API espelha `@mastra/core/workflows`: porte futuro é mecânico se ADR-0002 for
  revisada.

## Decisão

**Implementamos uma mini state-machine interna em `src/features/canvas-orchestrator/workflow/`
expondo seis primitives (`createStep`, `then`, `parallel`, `foreach`, `branch`,
`dountil`) sobre AI SDK v6, com tipagem genérica encadeada, validação Zod entre steps,
`AbortSignal` propagado e telemetria via `recordSpan`.** Não adotamos `@mastra/core`.

Especificações concretas:

- **Tamanho-alvo**: 350-500 LOC TypeScript (não inclui Canvas Orchestrator migrado).
- **API espelha Mastra `@mastra/core/workflows`** para porte mecânico futuro:
  ```ts
  const buildDashboard = workflow('build-dashboard')
    .then(planStep)
    .then(gatherContextStep)
    .then(designLayoutStep)
    .then(fillBlocksStep)
    .then(crossValidateStep)
    .then(renderCommitStep);
  ```
- **Sem suspend/resume nem persistência de snapshot.** Se a necessidade aparecer, é o
  sinal explícito para migrar para `@mastra/core`.
- **`createStep`**: aceita `{ inputSchema, outputSchema, execute }` Zod-tipado.
- **`parallel([a,b,c])`**: `Promise.allSettled` para suportar partial success.
- **`foreach(step, { concurrency })`**: `p-limit` (já instalado em Sprint 1.B) +
  `Promise.allSettled`.
- **`branch([[cond, step], ...])`**: tabela de despacho. Primeiro `cond` truthy vence.
- **`dountil(step, predicate, { maxAttempts })`**: loop com cap obrigatório.
- **`AbortSignal`** criado no entrypoint propaga a todos os steps e a cada
  `generateText`/BQ call.
- **Multi-tenancy**: `requestContext.clientId` propagado em **todo step**. Step paralelo
  replica contexto. `clientId` ausente faz step falhar fechado com `RequestContextError`
  tipado (alinhado a ADR-0006).
- **Rate limit**: `foreach` aplica `p-limit` cap conservador (3) sobre `generateText`
  Vertex; reusa `withRetry` (`src/features/ai-agents/lib/with-retry.ts`) para 429/503.
- **Idempotência por slot**: `fillSlot(slotId, ctx)` é idempotente; re-execução com
  mesmo input produz mesmo bloco (ou falha do mesmo modo).
- **Steps usam AI SDK por dentro**: `generateText` + `Output.object()`/Zod ou call
  determinística (BQ `EXPLAIN`/`dryRun`); `prepareStep` controla `activeTools`/`toolChoice`
  **dentro** do `streamText` interno do step, não no workflow externo.
- **Feature-flag `useWorkflowOrchestrator`** no `app-store` permite rollout gradual e
  rollback instantâneo.
- **Telemetria**: cada step instrumentado com `recordSpan` (Sprint 1.B Task 7) emitindo
  p50/p95 wall-clock por step e tokens.

Sub-workflow exemplificativo (`fillSlot`):

```ts
const fillSlot = workflow('fill-slot')
  .then(pickIndicatorStep)
  .branch([
    [({ intent }) => intent.kind === 'forecast' && ctx.bqml, useBqmlStep],
    [() => true, generateSqlStep],
  ])
  .dountil(validateSqlStep, ({ ok, attempts }) => ok || attempts >= 3)
  .then(pickVizStep)
  .then(materializeBlockStep);
```

Limite explícito: **se precisarmos de uma 7ª primitive ou de qualquer forma de
persistência de execução, paramos e abrimos ADR de superseção.**

## Consequências

### Positivas
- Pipeline explícito e testável. Cada step tem schema de I/O e roda isolado.
- Branches BQML/cliente/blockKind verificáveis em teste fora do navegador.
- Retry granular por slot via `dountil` + `withRetry`.
- Partial success real: `foreach` com `Promise.allSettled` permite que slots falhos
  marquem erro local sem abortar build inteiro.
- Cancelamento global via `AbortSignal` quando usuário fecha o chat.
- Porte futuro para `@mastra/core` é mecânico (mesma forma de API).
- Wall-clock potencialmente menor em builds com ≥4 blocos (KPI a medir, não
  garantido a priori).

### Negativas / Trade-offs
- **Risco "framework caseiro"**: limite estrito de 6 primitives mitigado, mas exige
  disciplina em PRs. Code review **rejeita** PRs que tentam adicionar primitive nova
  fora de uma ADR de extensão.
- **Sem snapshot/observability UI** out-of-the-box. Construímos `/admin/...` à mão
  (Sprint 3.B/3.D).
- **Custo de implementação**: ~2 semanas (Sprint 2.B).
- **Tokens podem aumentar** com paralelismo (cada sub-agente carrega system prompt).
  Mitigação: prompt cache Vertex (`google.cachedContent`) para system prompts estáveis
  — Sprint 3.B.

### Neutras
- Migração do Canvas Orchestrator é caminho crítico — feature flag protege rollout.
- Orchestrator analítico não migra para workflow (mantém supervisor `streamText`); ver
  ADR-0008 (phase gating via `prepareStep`).

## Alternativas consideradas

### Alternativa A — Adotar `@mastra/core/workflows`
**Pros**: workflows persistentes, snapshots, observability UI, cron, networks; porte
direto da forma do plano.
**Cons**: (1) acoplamento a runtime extra; (2) reescrita da camada de tools para
formato Mastra; (3) conflito com ADR-0002 (Mastra-as-library, não full); (4) Next.js
16 App Router + Mastra server adiciona complexidade de deploy.
**Por que rejeitada**: ganho marginal (snapshots/UI) não justifica violação de
ADR-0002 hoje. Reavaliar quando aparecer requisito real de suspend/resume.

### Alternativa B — XState
**Pros**: state-machine industrial-strength, visualizer, atores, history.
**Cons**: peso conceitual alto (eventos, atores, hierarchical states) para um pipeline
linear-com-foreach; integração com AI SDK exige adapter; dependência grande.
**Por que rejeitada**: fricção conceitual desproporcional ao problema.

### Alternativa C — Status quo (sem state-machine, só `streamText` + 23 tools)
**Pros**: zero código novo de orquestração.
**Cons**: drift de plano, branches implícitos, retry frouxo, partial success
inexistente — todos os problemas que motivam a ADR.
**Por que rejeitada**: status quo não atende requisitos.

### Alternativa D — Effect-TS / fp-ts pipelines
**Pros**: composição funcional poderosa, error handling tipado.
**Cons**: paradigma fora da base de código (TS imperativo + AI SDK); curva de
aprendizado para o time; ferramentas de debugging diferentes.
**Por que rejeitada**: custo de adoção alto para benefício comparável às 6 primitives.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §3,
  §4, §6 Fase 2 (decisão e mapeamento).
- **Spec sprint**: `docs/superpowers/specs/2026-05-04-sprint2-B-workflow-statemachine.md`
  — implementação task-by-task.
- **Diretório a criar**: `src/features/canvas-orchestrator/workflow/`
  - `create-step.ts`, `run-workflow.ts`
  - Primitives: `then.ts`, `parallel.ts`, `foreach.ts`, `branch.ts`, `dountil.ts`
  - `types.ts` (`RequestContext`, `RunContext`, `WorkflowError`)
- **Steps do Canvas Builder**: `src/features/canvas-orchestrator/workflow/steps/`
  - `plan-step.ts`, `gather-context-step.ts`, `design-layout-step.ts`,
    `fill-blocks-step.ts`, `cross-validate-step.ts`, `render-commit-step.ts`
  - Sub-steps de `fill-slot`: `pick-indicator-step.ts`, `generate-sql-step.ts`,
    `validate-sql-step.ts`, `pick-viz-step.ts`, `materialize-block-step.ts`
- **Reuso explícito**:
  - `withRetry` (`src/features/ai-agents/lib/with-retry.ts`)
  - `recordSpan` (`src/shared/lib/telemetry/record-span.ts`, Sprint 1.B Task 7)
  - `p-limit@^6` (instalado em Sprint 1.B)
- **Feature flag**: `useWorkflowOrchestrator: boolean` em `src/shared/stores/app-store.ts`.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §3 (tabela
  Mastra⇄AI SDK), §4 (redesenho), §6 (fases).
- `docs/superpowers/specs/2026-05-04-sprint2-B-workflow-statemachine.md`
- `adrs/mastra/workflows/{workflow,step}.mdx`
- `adrs/mastra/workflow-methods/{parallel,branch,foreach}.mdx`
- `adrs/vercel-ai-sdk.md` §4.3 (multi-step, `prepareStep`, `dynamicTool`, `stopWhen`).
- ADR-0002 (Mastra-as-library) — esta ADR é consequência direta.
- ADR-0006 (multi-tenancy) — `clientId` propagado em todo step.
- ADR-0008 (phase gating no orchestrator analítico) — caminho complementar para o
  outro orchestrator.
