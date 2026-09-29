---
id: 0001
title: Adotar Architecture Decision Records (Nygard-style, em PT-BR)
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai, time-data]
informed: [time-eng]
tags: [meta, processo, documentacao]
supersedes: []
related: []
---

# ADR-0001 — Adotar Architecture Decision Records (Nygard-style, em PT-BR)

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta e aceita simultaneamente para destravar o lote inicial de 10 ADRs
  derivadas dos planos macro `2026-05-04-mastra-*` e `business-context-personas-evals`.

## Contexto

O projeto `liquid-play-dataviz` cresceu rapidamente em superfície arquitetural durante
Q1-Q2/2026:

- Dois orchestrators LLM (analítico em `src/features/ai-agents/orchestrator.ts`, Canvas
  Builder em `src/features/canvas-orchestrator/orchestrator.ts`), juntos consumindo
  ~50 tools entre sub-agentes e ferramentas concretas.
- Multi-cliente (OM/BRZ/CONX/IMCASA) com schemas BQ divergentes.
- Stack heterogênea: Next.js 16 App Router, Vercel AI SDK v6, Vertex Gemini, BigQuery,
  Firebase, e — entrando agora — Cloud SQL Postgres + pgvector e primitives Mastra
  (`@mastra/memory`, `@mastra/rag`, `@mastra/pg`).
- Quatro **planos macro** simultâneos em `docs/superpowers/plans/2026-05-04-*.md`
  (memory+RAG, workflows, tools+SQL+BQML, business-context+evals) e doze specs sprint
  derivadas em `docs/superpowers/specs/2026-05-04-sprint*.md`.

O diretório `adrs/` existia, mas continha **research notes / tech guides** (ex.
`vercel-ai-sdk.md` com 83KB) e **documentação importada** (`mastra/`, `vercel-ai-sdk/`,
`vercel-ui-elements/`). Nenhum dos arquivos seguia o formato Michael Nygard
(Context/Decision/Consequences) — não era possível identificar quais decisões
arquiteturais estavam em vigor, quem decidiu, quando, ou que alternativas foram
descartadas.

Forças:

- **Volume de decisões pendentes**: ≥10 decisões arquiteturais relevantes saíram dos 4
  planos macro recentes. Sem registro formal, o time esquece o "por que" em 3 meses, e
  Claude Code (parceiro de implementação primário) **alucina** sobre stacks e padrões
  que nunca foram adotados.
- **Engenharia de contexto para IA**: o Claude Code (`.claude/agents/`,
  `.claude/commands/`) lê os arquivos do repo como contexto. Documento errado vira
  comportamento errado. ADRs precisam ser **fonte canônica** para o agente.
- **Distinção entre ADR e tech guide**: o material existente é útil, mas não é ADR. Não
  pode ser misturado.

## Decisão

**Adotamos o formato Michael Nygard (1️⃣ Title, 2️⃣ Status, 3️⃣ Context, 4️⃣ Decision,
5️⃣ Consequences) em PT-BR, com extensões pragmáticas (Alternativas, Implementação,
Referências) e numeração sequencial em 4 dígitos.**

Estrutura final do diretório:

```
adrs/
├── README.md                 ← índice + processo
├── _template.md              ← template canônico (PT-BR)
├── decisions/                ← ADRs Nygard-style numeradas
│   ├── 0001-record-architecture-decisions.md
│   └── 00NN-...md
├── stack/    (futuro)        ← research notes / tech guides movidos da raiz
└── reference/ (futuro)       ← docs externos importados (Mastra, AI SDK)
```

Convenções obrigatórias:

- **Frontmatter YAML** com `id`, `title`, `status`, `date`, `deciders`, `consulted`,
  `informed`, `tags`, `supersedes`, `related`.
- **Status**: `Proposed | Accepted | Deprecated | Superseded by ADR-NNNN`.
- **Idioma**: português técnico (alinhado a `CLAUDE.md`).
- **Imutabilidade após aceitas**: mudanças vão em **nova ADR** com `supersedes`
  apontando para a anterior; a anterior recebe `Superseded by ADR-NNNN` no status.
- **Tamanho típico**: 200-500 linhas.
- **Nomenclatura**: `NNNN-slug-em-kebab-case.md`, sem acentos, sem espaços.

Os arquivos atuais em `adrs/` raiz **permanecem** durante este lote inicial. Migração
para `stack/` e `reference/` é roadmap explícito no `README.md`, executada em PR
dedicado.

## Consequências

### Positivas
- Decisões rastreáveis em git: `git log adrs/decisions/0007-*.md` revela história.
- Claude Code passa a ter fonte canônica para "o que está em vigor" — reduz
  alucinação sobre stacks (ex: "usamos Mastra full" → não, ver ADR-0002).
- Onboarding de novos engenheiros: ler `adrs/decisions/` em ordem dá panorama
  arquitetural em ≤2h.
- Code review ganha gancho: "isso conflita com ADR-NNNN" é argumento concreto.

### Negativas / Trade-offs
- Custo de manter ADRs atualizadas. Mitigado pelo template e pela regra de
  imutabilidade (não há "manter" — há criar nova quando muda).
- Risco de virar burocracia. Mitigado pelo critério de inclusão estrito: ADR só para
  decisões com ≥2 alternativas reais e impacto arquitetural.

### Neutras
- Documentação anterior em `adrs/*.md` (raiz) **não é descartada** — será reclassificada
  como `stack/` (research notes) ou `reference/` (docs importadas). Reescrita seletiva
  como ADR real fica como tarefa pontual quando algum guide acumular decisões implícitas.

## Alternativas consideradas

### Alternativa A — MADR (Markdown ADR) v4.0
**Pros**: extensão do Nygard com `Decision Drivers`, `Considered Options` e Pros/Cons
estruturados por opção. Ferramental adr-tools compatível.
**Cons**: mais ceremônia para decisões pequenas; estrutura "considered options" duplica
nossa seção "Alternativas consideradas".
**Por que rejeitada**: ganho marginal não justifica fricção. Nygard adaptado já cobre
80% do valor. Migração futura para MADR é trivial — campos são superset.

### Alternativa B — Y-Statements (Olaf Zimmermann)
**Pros**: ultra-conciso ("In the context of X, facing Y, we decided Z to achieve W,
accepting that V"). Cabe num parágrafo.
**Cons**: insuficiente para decisões com múltiplas alternativas e trade-offs detalhados.
**Por que rejeitada**: nosso domínio (multi-tenancy regulatório + LLM + multi-cliente) tem
decisões densas; Y-statement não cabe.

### Alternativa C — Notion / Linear / wiki externo
**Pros**: rich text, comentários nativos, busca cross-projeto.
**Cons**: fora do git; descolado do código que materializa a decisão; não é parte do
contexto do Claude Code.
**Por que rejeitada**: ADR como código (markdown no repo) é o ponto. Fora do repo,
perde-se a engenharia de contexto para IA.

### Alternativa D — Status quo (apenas planos `docs/superpowers/`)
**Por que rejeitada**: planos descrevem **o que fazer** em uma janela de 4-6 semanas.
ADRs descrevem **decisões com consequências de longo prazo**, ortogonais a planos. Sem
ADR, a decisão "Mastra-as-lib vs Mastra-Agent" fica enterrada no §6 do plano de memory+RAG
e morre quando o plano é arquivado.

## Implementação

- **Template canônico**: `adrs/_template.md` (criado neste lote).
- **README de processo**: `adrs/README.md` (criado neste lote).
- **Lote inicial de ADRs**: `adrs/decisions/0002` a `adrs/decisions/0010` (criadas neste
  lote junto com esta ADR-0001).
- **Migração legacy** (futuro PR): mover `adrs/{claude-code,firebase-firestore,...}.md`
  para `adrs/stack/`; mover `adrs/{mastra,vercel-ai-sdk,vercel-ui-elements}/` para
  `adrs/reference/`. Não automatizada — exige revisão humana de links quebrados.
- **Atualizar `CLAUDE.md`** (futuro PR pequeno): apontar `adrs/decisions/` como fonte de
  verdade arquitetural junto a `docs/superpowers/`.

## Referências

- Michael Nygard, *Documenting Architecture Decisions*, Cognitect blog 2011 — formato
  original.
- Olaf Zimmermann et al., *MADR (Markdown Architectural Decision Records) v4.0* —
  https://adr.github.io/madr/
- Project lead `CLAUDE.md` — define convenções de idioma, stack e organização que esta
  ADR estende.
- Diretório `docs/superpowers/{plans,specs}/` — origem das decisões dos ADRs 0002-0010.
