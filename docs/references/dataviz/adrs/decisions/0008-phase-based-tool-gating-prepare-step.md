---
id: 0008
title: Phase-based tool gating no orchestrator analítico via `prepareStep`
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, ai-sdk, orchestrator, prepare-step, prompt-cache]
supersedes: []
related: [0002, 0003]
---

# ADR-0008 — Phase-based tool gating no orchestrator analítico via `prepareStep`

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.
  `useImprovedSupervisor`.

## Contexto

O orchestrator analítico (`src/features/ai-agents/orchestrator.ts`) é supervisor:
8 sub-agentes-tools + `generate_pdf` + `generate_csv` (10 tools no topo). O modelo
decide qual sub-agente invocar a cada turno. Diagnóstico do plano
`2026-05-04-mastra-workflows-network.md` §5:

- **Lista grande de tools no system prompt**: 10 tools sempre disponíveis aumentam
  alucinação ("vou chamar `predictive_agent` agora") quando o estado da conversa
  ainda é descritivo.
- **Sem disciplina de fase**: análise típica segue
  `descriptive → diagnostic → prescriptive → monitoring`, mas o modelo pula etapas.
- **Histórico cresce**: cada tool result adiciona N tokens; em sessões longas, prompt
  cresce sem poda → custo e latência sobem.
- **System prompt estável** (cliente-profile + persona + glossário + regulatório +
  macro snapshot, ver Sprint 1.D + 2.D) é re-enviado a cada step do `streamText`,
  desperdiçando tokens cacheáveis.

`Agent.network` da Mastra (`adrs/mastra/agents/network.mdx:14-18`) está **deprecated**
em favor de "supervisor agents" — confirma que mantemos o supervisor; o ganho está em
melhorias incrementais sobre `streamText`.

Forças:

- **AI SDK v6 `prepareStep`** (`adrs/vercel-ai-sdk.md` §4.3) controla a cada step
  interno do loop `streamText`: `activeTools`, `toolChoice`, `model`, `messages`,
  `system`. É o ponto de inserção natural.
- **Vertex prompt cache** (`google.cachedContent`): TTL configurável, mínimo ~32k
  tokens cacheáveis. System prompts dos sub-agentes (estáveis, ~5-15k tokens cada)
  são candidatos.
- **`Agent.network` deprecated**: não voltar para abordagem deprecated.
- **Custo recorrente**: cada sub-agente invocado carrega seu system prompt; em
  conversas longas, os mesmos system prompts repetem.

## Decisão

**(1) Implementamos tool-gating por fase via `prepareStep` no orchestrator analítico,
com 4 fases (`discovery → diagnosis → prescription → monitoring`), cada fase
restringindo `activeTools`. (2) Compactação dinâmica: `prepareStep` poda
`messages.slice(-10)` + injeta summary do step anterior em `system`. (3) Tool-piping
declarativo: hints estruturadas pós-tool sugerem próximo passo. (4) Telemetria por
sub-agente reusando `recordSpan`. (5) Prompt cache Vertex (`google.cachedContent`)
para system prompts estáveis dos sub-agentes elegíveis.**

Especificações:

### Fases

| Fase | Tools ativas (subset de 10) |
|---|---|
| `discovery` | `descriptive_agent`, `comparative_agent`, `lookup_glossary`, `retrieve_business_context` |
| `diagnosis` | + `diagnostic_agent`, `causal_agent` |
| `prescription` | + `predictive_agent`, `prescriptive_agent`, `bqml.*` (via sub-agente) |
| `monitoring` | + `monitoring_agent`, `generate_pdf`, `generate_csv` |

Inferência de fase: heurística sobre a conversa em
`src/features/ai-agents/orchestrator/infer-phase.ts`:
- Sem tool calls anteriores → `discovery`.
- ≥1 `descriptive_agent`/`comparative_agent` succeeded → `diagnosis`.
- Usuário pede "previsão", "forecast", "o que esperar" → `prescription`.
- Usuário pede "monitorar", "alerta", "exportar" → `monitoring`.

### `prepareStep` flow

```ts
prepareStep: async ({ messages, stepNumber }) => {
  const phase = inferPhase(messages);
  const activeTools = TOOLS_BY_PHASE[phase];
  const compactedMessages = compactMessages(messages, { keep: 10, summary: true });
  const hint = HINTS_BY_PHASE[phase]; // ex: "considere chamar diagnostic_agent"
  return {
    activeTools,
    messages: compactedMessages,
    system: composeSystem({ base: baseSystem, hint, phase }),
  };
}
```

### Compactação

- Manter últimas 10 mensagens.
- Injetar `summary` do step anterior em `system`: `summary` é gerado por chamada
  determinística a `generateObject` (`gemini-2.5-flash-lite`) sumarizando tool
  results acumulados em <500 tokens.
- Sumário cacheado no `RunContext` por step para evitar regerar.

### Prompt cache Vertex

- System prompts dos sub-agentes são candidatos quando estáveis (não dependem de
  briefing/persona dinâmica) e ≥32k tokens.
- Na boot do servidor, `cachedContent` é resolvido como **singleton** com TTL
  configurável (default 1h). Fallback gracioso se cache miss.
- Cache key inclui `clientId` (ADR-0006) — nunca cruza tenants.
- Métrica: hit-rate ≥60% em sessões longas.

### Telemetria

`recordSpan({ agent, model, phase, tokensIn, tokensOut, durationMs, status })` por
sub-agente, consumida pelo painel `/admin/orchestrator-analytics` (Sprint 3.B).

### Feature flag

`useImprovedSupervisor` em `src/shared/stores/app-store.ts` controla rollout. A/B
contra supervisor legado mede:
- Tokens p50/p95 por conversa.
- Latência p95 por turno.
- Hit-rate de prompt cache.
- Taxa de re-chamada de sub-agente já invocado (deve cair).

Critério de aceite (Sprint 3.B):
- ≥20% redução de tokens em sessões longas.
- p95 latência em paridade ou melhor.
- Hit-rate prompt cache ≥60% em sessões >3 turnos.

## Consequências

### Positivas
- **Menos alucinação**: lista menor de tools por fase reduz "vou chamar X" prematuro.
- **Custo menor**: compactação + prompt cache reduzem tokens enviados.
- **Disciplina conversacional**: fase explícita ajuda o modelo a seguir o fluxo
  natural de análise.
- **Telemetria por sub-agente**: gargalos identificados (qual sub-agente é mais
  caro/lento).
- **Compatível com ADR-0002 e ADR-0003**: `prepareStep` é AI SDK puro; sem Mastra
  full; sem state-machine externa para o analítico (este flow é conversacional, não
  pipeline).

### Negativas / Trade-offs
- **Inferência de fase é heurística**: erros de classificação restringem tools
  legítimas. Mitigação: modelo pode pedir "ativar fase X" via tool dedicada (futuro);
  por ora, fase muda só por heurística.
- **Sumário gerado a cada step** custa tokens extras (ainda que com modelo barato
  `flash-lite`). Trade-off mensurável no A/B.
- **Prompt cache exige system prompts ≥32k tokens**: sub-agentes pequenos não cabem.
  Aceitável — só os maiores se beneficiam.
- **Complexidade de manutenção**: `TOOLS_BY_PHASE`, `HINTS_BY_PHASE`,
  `inferPhase` precisam evolução conjunta. Documentado em
  `src/features/ai-agents/orchestrator/phases.md`.

### Neutras
- Phase gating não se aplica ao Canvas Builder — esse usa state-machine (ADR-0003)
  com pipeline determinístico.
- Mudanças futuras de fase (ex: nova fase `comparative-deep-dive`) exigem
  atualização do enum + tabelas — alteração contida.

## Alternativas consideradas

### Alternativa A — Adotar `Agent.network` (Mastra)
**Pros**: routing declarativo entre sub-agentes.
**Cons**: **deprecated** em `adrs/mastra/agents/network.mdx:14-18`. Mastra
explicitamente recomenda supervisor agents.
**Por que rejeitada**: stack deprecated.

### Alternativa B — Workflow rígido (state-machine como Canvas Builder, ADR-0003)
**Pros**: pipeline determinístico, testável.
**Cons**: orchestrator analítico é conversacional — usuário pode pedir
"compare safra X com Y" no meio de uma análise prescritiva. Workflow rígido perde a
flexibilidade.
**Por que rejeitada**: forma errada para o caso de uso. Mantemos supervisor.

### Alternativa C — Status quo (10 tools sempre, sem compactação)
**Pros**: simplicidade.
**Cons**: custo de tokens, alucinação, sem telemetria por sub-agente.
**Por que rejeitada**: não atende KPIs de qualidade/custo.

### Alternativa D — Routing manual via tool `route_to(phase)`
**Pros**: explícito.
**Cons**: o modelo precisa lembrar de chamar; mais uma tool no prompt; falha quando
modelo não chama.
**Por que rejeitada**: heurística do `prepareStep` é mais confiável.

## Implementação

- **Plano macro**:
  `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §5, §6 Fase 3.
- **Spec sprint**:
  `docs/superpowers/specs/2026-05-04-sprint3-B-supervisor-analytic-improvements.md`.
- **Arquivos a criar**:
  - `src/features/ai-agents/orchestrator/phases.ts` (`OrchestratorPhase`,
    `TOOLS_BY_PHASE`, `HINTS_BY_PHASE`).
  - `src/features/ai-agents/orchestrator/infer-phase.ts` (heurística).
  - `src/features/ai-agents/orchestrator/compact-messages.ts`.
  - `src/features/ai-agents/orchestrator/prompt-cache.ts` (singleton
    `google.cachedContent` por sub-agente).
- **Arquivos a alterar**:
  - `src/features/ai-agents/orchestrator.ts` — adicionar `prepareStep`.
- **Reuso**: `recordSpan` (`src/shared/lib/telemetry/record-span.ts`, Sprint 1.B),
  `buildAgentSystem` (Sprint 1.D), `retrieve_business_context` (Sprint 2.D).
- **Painel admin** (Sprint 3.B): `app/(dashboard)/admin/orchestrator-analytics/`.
- **Feature flag**: `useImprovedSupervisor` em `src/shared/stores/app-store.ts`.
- **Variáveis de ambiente**:
  - `VERTEX_PROMPT_CACHE_TTL_SECONDS=3600`
  - `IMPROVED_SUPERVISOR_ROLLOUT_PERCENT=0` (incrementa em prod gradual).

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §5
  (orchestrator analítico), §6 Fase 3.
- `docs/superpowers/specs/2026-05-04-sprint3-B-supervisor-analytic-improvements.md`.
- `adrs/vercel-ai-sdk.md` §4.3 — `prepareStep`, `dynamicTool`, `customProvider`.
- `adrs/mastra/agents/network.mdx:14-18` — `Agent.network` deprecated.
- Vertex docs — `google.cachedContent`.
- ADR-0002 (Mastra-as-library), ADR-0003 (state-machine para Canvas Builder),
  ADR-0006 (multi-tenancy em prompt cache).
