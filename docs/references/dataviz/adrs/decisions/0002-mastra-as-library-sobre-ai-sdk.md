---
id: 0002
title: Mastra-as-Library sobre Vercel AI SDK v6 (em vez de Mastra Agent runtime)
status: Superseded by 0014
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, mastra, ai-sdk, runtime, arquitetura]
supersedes: []
superseded_by: [0014]
related: [0003, 0004, 0005, 0006, 0008]
---

# ADR-0002 — Mastra-as-Library sobre Vercel AI SDK v6

> **Nota (2026-05-06):** esta ADR foi **superseded por ADR-0014** —
> "Mastra Runtime full". A decisão de usar Mastra somente como biblioteca
> (mantendo AI SDK direto como runtime) foi revertida. Override executivo
> do owner. Mantida como histórico; consulte
> `adrs/decisions/0014-mastra-runtime-full.md` para a decisão vigente.

## Status

`Superseded by 0014` — desde 2026-05-06.

Histórico anterior: `Accepted` desde 2026-05-04.

Histórico:
- 2026-05-04 — aceita ao consolidar diagnóstico dos planos macro de memory/RAG e
  workflows; reavaliação programada em 6 meses.

## Contexto

O projeto opera dois orchestrators LLM:

- **Orchestrator Analítico** (`src/features/ai-agents/orchestrator.ts`): supervisor que
  expõe 8 sub-agentes-tools + `generate_pdf` + `generate_csv` (10 tools no topo, ~44
  tools concretas internamente em `src/features/ai-agents/tools/`).
- **Canvas Builder** (`src/features/canvas-orchestrator/orchestrator.ts`): single
  `streamText` com 23 tools e `stopWhen: stepCountIs(30)`.

Ambos rodam sobre **Vercel AI SDK v6** com **Vertex Gemini** via `@ai-sdk/google-vertex`,
com `customProvider` configurando aliases (`gemini-2.5-flash-lite|flash|pro`) em
`src/features/ai-agents/model-registry.ts`. Toda a infraestrutura de tools, retry
(`src/features/ai-agents/lib/with-retry.ts`), telemetria, hooks de toolCallOptions, etc.
está sintonizada com a API do AI SDK.

Os planos macro `2026-05-04-mastra-memory-rag.md` (§6) e
`2026-05-04-mastra-workflows-network.md` (§3) enfrentam a pergunta:

> Para adicionar memória, RAG, workflows e (eventualmente) observabilidade, devemos
> migrar para `new Agent()` da Mastra (full runtime) ou consumir Mastra como **conjunto
> de bibliotecas** sobre o AI SDK?

Forças:

- **Lock-in**: Mastra full traz seu próprio loop de agente, server, observability UI,
  workflow runtime. Adoção amarra reescritas futuras.
- **Vertex e `customProvider`**: Mastra `Agent` aceita modelos AI SDK, mas o
  `customProvider` fino que temos (com aliases por sub-agente) é nativo do AI SDK e
  exige adapter na Mastra full.
- **Next.js 16 App Router**: routes `/api/*` com `runtime: 'nodejs'` rodam o AI SDK
  nativamente. Subir Mastra server (separado) duplica deploy. Embedar Mastra no mesmo
  processo Next entra em conflito com Edge bundling.
- **Curva de adoção**: migrar 2 orchestrators para `new Agent()` é reescrita do loop;
  importar `@mastra/memory`/`@mastra/rag`/`@mastra/pg` é incremental.
- **Valor real da Mastra**: as primitives (memory class, MDocument, embedMany helpers,
  rerank, PgVector, metadata-filters MongoDB-like) são úteis **isoladamente** — não
  exigem o `Agent` runtime para entregar valor.

## Decisão

**Mantemos `streamText`/`generateText` do Vercel AI SDK v6 como runtime dos
orchestrators. Importamos `@mastra/memory`, `@mastra/rag` e `@mastra/pg` como
bibliotecas, sem adotar `new Agent()` nem subir Mastra server.**

Concretamente:

- Continua o **AI SDK v6** governando: o loop multi-step, `stopWhen`, `prepareStep`,
  `dynamicTool`, `experimental_repairToolCall`, `experimental_telemetry`,
  `customProvider`, ToolApprovalResponse, preliminary tool results.
- Da Mastra usamos:
  - `@mastra/memory` — classe `Memory`, `workingMemory: { schema, scope }`, tool
    `updateWorkingMemory`, `semanticRecall`. Opcional `observationalMemory` (atrás de
    feature flag — `scope: 'resource'` é experimental).
  - `@mastra/rag` — `MDocument` (chunking strategies markdown/json/recursive), helpers
    de `embedMany`, `rerank` (semantic/vector/position weights), `metadata-filters`
    com sintaxe MongoDB-like.
  - `@mastra/pg` — `PgVector` Mastra-compat (HNSW + dotproduct) e Postgres store
    (validar nome exato do export — doc Mastra alterna entre `PgStore`/`PostgresStore`).
- **Não usamos**: `new Agent()`, `Agent.network` (deprecated em
  `adrs/mastra/agents/network.mdx:14-18`), Mastra server, `mastra build`/`mastra dev`.
- Routes que tocam memory/RAG declaram `export const runtime = 'nodejs'` (`@mastra/pg`
  usa `pg` driver Node-only, incompatível com Edge).

Reavaliação formal em **6 meses** (≈ 2026-11-04). Critérios de migração para Mastra full:
(a) precisamos de suspend/resume de workflows com persistência; (b) precisamos da UI de
observabilidade Mastra; (c) precisamos de cron triggers nativos. Sem esses gatilhos,
mantemos a forma atual.

## Consequências

### Positivas
- **Sem lock-in adicional**: continuamos no AI SDK que já dominamos; as libs Mastra são
  substituíveis individualmente (ex: `@mastra/rag` por código próprio se preciso).
- **Vertex/`customProvider` nativos**: zero adapter, zero retrabalho de model registry.
- **Routes Next.js intocadas**: `/api/ai`, `/api/canvas` etc. não mudam de forma.
- **Adoção incremental**: cada plano (memory, RAG, workflows, business-context) entra
  por sprint sem big-bang.
- **Reversibilidade**: se virmos valor em ir full Mastra, a fronteira entre nosso código
  e as primitives Mastra é fina (wrappers em `src/shared/lib/memory/`,
  `src/shared/lib/rag/`).

### Negativas / Trade-offs
- **Não temos workflow runtime persistente** (suspend/resume). Quando precisarmos,
  ADR-0003 (mini state-machine) cobre o curto prazo, e migração para Mastra full vira
  candidata real.
- **Sem UI de observabilidade Mastra**: precisamos construir `/admin/orchestrator-analytics`
  e `/admin/agent-quality` à mão (já planejado em Sprint 3.B/3.D).
- **Risco de `wrappers caseiros virarem framework caseiro`**: mitigado limitando os
  wrappers a thin façades sobre as APIs Mastra (ex: `MemoryService` espelha interface
  `Memory` original).
- **Dependência transitiva de `@mastra/rag` testada conflituosa com Next.js 16 App
  Router** (verificado em prototipagem do Sprint 1.A — ver Sprint 2.A spec). Mitigação:
  usar wrapper local `MDocument`-like em `src/shared/lib/rag/chunker.ts` quando
  `@mastra/rag` direto falhar no build.

### Neutras
- Versões de `@mastra/*` evoluem rápido — fixar versão exata em `package.json` e
  atualizar deliberadamente, não em `^`.
- Documentação Mastra importada em `adrs/mastra/` permanece como referência
  (eventualmente migra para `adrs/reference/mastra/`).

## Alternativas consideradas

### Alternativa A — Mastra full (`new Agent()` + Mastra server)
**Pros**: workflows com snapshots/persistência out-of-the-box, observabilidade UI,
networks, cron, futuro-proof se Mastra virar padrão de mercado.
**Cons**: lock-in alto; precisa de adapter para `customProvider`; conflito potencial
com App Router Next.js 16; reescrita de 2 orchestrators (≥4 semanas); perda da
flexibilidade do `streamText` direto.
**Por que rejeitada**: ROI insuficiente hoje. Reavaliação em 6 meses.

### Alternativa B — AI SDK puro, sem Mastra
**Pros**: zero dependência transitiva, controle total.
**Cons**: reescrever working memory schema, semantic recall, MDocument chunking,
metadata filters MongoDB-like, rerank — semanas de trabalho duplicando arte.
**Por que rejeitada**: as libs Mastra entregam valor real isoladamente; reinventar
não faz sentido.

### Alternativa C — LangChain / LlamaIndex
**Pros**: ecossistema vasto.
**Cons**: API estilo Python-first, mais opinionada, lock-in maior que Mastra,
abstrações grossas que conflitam com o controle fino do AI SDK.
**Por que rejeitada**: incompatibilidade arquitetural com o que já temos.

### Alternativa D — Status quo (sem memory/RAG/workflows)
**Por que rejeitada**: stateless impede personalização por persona, citação
regulatória, reuso de SQL — todos requisitos críticos dos planos macro.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §6
  (decisão); `2026-05-04-mastra-workflows-network.md` §3 (mapeamento Mastra⇄AI SDK).
- **Specs sprint que materializam**:
  - `2026-05-04-sprint1-A-cloud-sql-working-memory.md` — `MemoryService` thin wrapper.
  - `2026-05-04-sprint2-A-rag-ingest.md` — `MDocument`-like wrapper local +
    `embedMany` direto + `pg` driver.
  - `2026-05-04-sprint2-B-workflow-statemachine.md` — mini state-machine sobre AI SDK
    (ver ADR-0003).
- **Código existente preservado**:
  - `src/features/ai-agents/orchestrator.ts`
  - `src/features/canvas-orchestrator/orchestrator.ts`
  - `src/features/ai-agents/model-registry.ts` (`customProvider` + aliases Vertex)
  - `src/features/ai-agents/lib/with-retry.ts`
- **Código a criar (thin wrappers Mastra-as-lib)**:
  - `src/shared/lib/memory/memory-service.ts`
  - `src/shared/lib/rag/{chunker,pgvector,pii-scrub,rerank}.ts`
- **Sem feature flag**: decisão arquitetural global, não A/B.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §6 (tabela comparativa
  Mastra full vs AI SDK + primitives).
- `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §3 (mapeamento
  Mastra⇄AI SDK).
- `adrs/mastra/memory/memory-class.mdx` — `Memory`, `workingMemory`, `readOnly`.
- `adrs/mastra/agents/network.mdx:14-18` — `Agent.network` deprecated.
- `adrs/vercel-ai-sdk.md` §4.3 — `prepareStep`, `dynamicTool`, `experimental_repairToolCall`,
  `experimental_telemetry`, `stopWhen`.
- ADR-0003 (mini state-machine), ADR-0004 (Postgres+pgvector), ADR-0006
  (multi-tenancy), ADR-0008 (phase gating) — todas dependem desta decisão.
