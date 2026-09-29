---
id: 0014
title: Mastra Runtime full — Agent + Memory + RAG (substitui ADR-0002)
status: Accepted
date: 2026-05-06
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, mastra, runtime, agent, memory, arquitetura]
supersedes: [0002]
related: [0003, 0006, 0008, 0013]
---

# ADR-0014 — Mastra Runtime full

## Status

`Accepted` — desde 2026-05-06.

Histórico:
- 2026-05-06 — decisão executiva do owner (giulliano.soares) de migrar para
  Mastra runtime full, supersedendo ADR-0002 ("Mastra-as-Library sobre Vercel
  AI SDK v6"). Esta ADR não aguarda a janela de reavaliação de 6 meses
  prevista na ADR-0002 — é uma override explícita motivada por alinhamento
  com specs Superpowers que assumiam Mastra Agent runtime.

## Contexto

A ADR-0002 (2026-05-04) optou por usar **Mastra como biblioteca** (somente
`@mastra/rag`) preservando o **Vercel AI SDK v6** com `streamText` direto
como runtime LLM em ambos os orchestrators (analítico em
`src/features/ai-agents/orchestrator.ts` e canvas em
`src/features/canvas-orchestrator/orchestrator.ts`). A motivação na época:
preservar telemetria sintonizada, retry hooks, `prepareStep` e o ecossistema
de tools v6 já em produção; encarar Mastra Agent runtime como reescrita de
alto custo sem ganho imediato.

Entretanto, dois fatores empurraram a decisão na direção oposta nas semanas
seguintes:

1. **Specs Superpowers convergiram em Mastra Agent.** Os planos de memória,
   semantic recall, RAG ingest e drift detection escritos em
   `docs/superpowers/specs/` e `docs/superpowers/plans/` referenciam APIs
   `Agent`, `Memory`, `Workflow` do `@mastra/core` como ponto de integração
   esperado. Manter a abstração AI-SDK-direto força tradução manual entre o
   modelo conceitual das specs e o código real, gerando atrito recorrente
   em revisão de plano.
2. **Mandato direto do owner.** Em conversa de planejamento de Sprint 4
   (2026-05-06), o owner pediu explicitamente "IMPLEMENTE O MASTRA",
   override executivo das condições de reavaliação da ADR-0002.

A migração inicia pelo orchestrator analítico (sub-agente descritivo +
roteamento via `Mastra` instance + `Agent.stream`) porque é o caminho de
menor risco: tem o menor número de tools envolvidas (`execute_sql`,
`dry_run_sql`, `get_table_schema`, etc.) e cobertura de teste já estável.
O canvas orchestrator (23 tools, `stepCountIs(30)`, workflow de geração de
dashboard) e os demais sub-agents (diagnostic, predictive, simulation,
prescriptive, monitoring, cashflow, external) ficam **fora deste bulk** e
serão migrados em sprints subsequentes, cada um em ADR/PR próprio se
introduzir trade-off arquitetural novo.

## Decisão

Adotar **Mastra runtime full** como stack canônica para LLM agents:

- `@mastra/core` (`Mastra` instance + `Agent` class) substitui o uso direto
  de `streamText`/`generateText` do Vercel AI SDK v6 no orchestrator
  analítico e em sub-agents migrados.
- `@mastra/memory` (`Memory` class) substitui o `memory-service` Pg-backed
  customizado para working memory + thread state. Storage permanece
  Firestore (ADR-0013) via adapter; vetor permanece pgvector (ADR-0004) ou
  o adapter equivalente quando disponível na versão do Mastra em uso.
- `@mastra/rag` segue como já decidido na ADR-0005 (embedding + rerank).
- Vertex Gemini segue como provider padrão (ADR-0002 §Decisão item modelo);
  o adapter `@ai-sdk/google-vertex` agora é injetado dentro da `Agent` via
  campo `model`, em vez de ser invocado direto pelo orchestrator.
- Tools existentes em `src/features/ai-agents/tools/` permanecem
  compatíveis: `Agent` aceita o shape do AI SDK `tool({...})`
  (`isVercelTool` no Mastra) sem reescrita.
- O orchestrator analítico atual (`src/features/ai-agents/orchestrator.ts`)
  é mantido enquanto sub-agents não migrados ainda dependem dele; a rota
  `/api/chat` passa a delegar para a `Agent` Mastra do sub-agente
  descritivo, que assume papel de **agente único** nesta primeira fase
  (sem supervisor multi-agente). Reintrodução de supervisão multi-agente
  via Mastra (`Workflow` ou `Agent.network`) fica para ADR posterior
  quando os demais sub-agents tiverem migrado.

## Consequências

**Positivas**:

- Alinhamento direto com specs Superpowers (sem tradução conceitual).
- Memory + RAG + Agent passam a compartilhar abstrações, reduzindo código
  cola entre os módulos `lib/memory`, `features/business-context` e o
  loop LLM.
- Acesso nativo a recursos de agente (sub-agents, tracing, scorers,
  network) sem reimplementar — reduz superfície de manutenção custom.

**Negativas / trade-offs**:

- **Lock-in Mastra**: APIs de `Agent`/`Memory` mudam mais rápido que as do
  AI SDK puro; precisamos congelar versões e revisar upgrades.
- **Perda temporária do supervisor multi-agente**: a primeira fase opera
  com agente único descritivo; diagnóstico/predição etc. ficam acessíveis
  apenas pelo orchestrator legado até serem migrados. Mitigação: rota
  `/api/chat` mantém compatibilidade de schema; sprint seguinte reintroduz
  network/workflow Mastra.
- **Reescrita do orchestrator analítico**: este bulk reescreve
  `app/api/chat/route.ts` para invocar `agent.stream(messages, {...})`
  e adapta a resposta ao `UIMessageStream` consumido pelo front. Telemetria
  fina (sub-agent spans, memory metrics) precisa ser religada nos hooks
  do `Agent` (`onStepFinish`, `onChunk`).
- **Memory custom**: o `memory-service` Pg-backed continua sendo usado no
  `working-memory tool` e nos consumers fora do agente até ser migrado
  para o `Memory` do Mastra. Convivência temporária permitida.

## Alternativas consideradas

- **Manter ADR-0002 (Mastra-as-Library)**: rejeitada pela override
  executiva e pelo custo recorrente de tradução AI-SDK ↔ specs.
- **Migrar tudo de uma vez (orchestrator analítico + canvas + 8 sub-agents)**:
  rejeitada por risco — canvas tem 23 tools e workflow próprio, melhor
  isolar em ADR/PR dedicado quando for migrado.
- **Adotar somente `@mastra/memory` mantendo AI SDK direto**: rejeitada
  por inconsistência (Memory acoplada ao Agent é mais idiomática que
  encaixá-la em loop AI-SDK puro).

## Referências

- ADR-0002 (`adrs/decisions/0002-mastra-as-library-sobre-ai-sdk.md`) —
  superseded por esta.
- ADR-0003 — mini state machine vs Mastra core (mantida; complementar).
- ADR-0006 — multi-tenancy strict isolation (Memory respeita
  `clientId`/`personaId` em `resourceId`).
- ADR-0008 — phase-based tool gating; precisa ser reimplementado no hook
  `prepareStep` do Mastra Agent quando a multi-fase voltar.
- ADR-0013 — Firestore para config/metadata; Memory storage roda sobre o
  mesmo Firestore via adapter.
