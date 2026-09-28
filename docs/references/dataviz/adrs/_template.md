---
id: NNNN
title: Título curto e imperativo da decisão
status: Proposed   # Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
date: 2026-MM-DD
deciders: [nome1, nome2]
consulted: [nome3]
informed: [time-ai, time-data]
tags: [tag1, tag2]
supersedes: []     # opcional — IDs de ADRs substituídas por esta
related: []        # opcional — IDs de ADRs ou paths de planos/specs
---

# ADR-NNNN — Título curto e imperativo da decisão

## Status

`Proposed` — desde 2026-MM-DD.

Histórico:
- 2026-MM-DD — proposta.
- 2026-MM-DD — aceita após revisão de [@nome].

## Contexto

Forças em jogo, restrições e o problema concreto que motiva a decisão. Inclua:

- O que está em `docs/superpowers/plans/...` que dispara a discussão.
- Que parte do código está afetada (`src/...`, `app/...`).
- Restrições de runtime (Next.js 16, App Router, Edge vs Node), de stack
  (Vercel AI SDK v6, Vertex Gemini, BigQuery, Cloud SQL) ou de domínio
  (multi-tenancy OM/BRZ/CONX/IMCASA, LGPD/PII, regulatório).
- Forças contraditórias: custo vs qualidade, lock-in vs ergonomia, etc.

## Decisão

Frase imperativa no presente do indicativo: **"Adotamos X para Y."**

Detalhamento técnico **específico**: versões exatas, paths de arquivos, schemas Zod,
nomes de tabelas, valores de configuração — tudo que outro engenheiro (humano ou
Claude Code) precisa para implementar sem inferir. Sem hedge.

## Consequências

### Positivas
- Item objetivamente mensurável ou verificável.
- ...

### Negativas / Trade-offs
- Limitação real. Indicar quando reavaliar.
- ...

### Neutras
- Implicações operacionais, mudanças de processo, custo de migração.
- ...

## Alternativas consideradas

### Alternativa A — Nome
**Pros**: ... **Cons**: ... **Por que rejeitada**: ...

### Alternativa B — Nome
**Pros**: ... **Cons**: ... **Por que rejeitada**: ...

### Alternativa C — Status quo (não decidir)
**Por que rejeitada**: ...

## Implementação

Engenharia de contexto — links para o que materializa esta decisão:

- **Plano macro**: `docs/superpowers/plans/...`
- **Specs sprint**: `docs/superpowers/specs/...`
- **Código existente**: `src/...`, `app/...`
- **Código a criar**: paths planejados.
- **Feature flag**: nome no `app-store` (se aplicável).

## Referências

- Docs Mastra: `adrs/mastra/...`
- Docs AI SDK: `adrs/vercel-ai-sdk.md` §...
- RFCs / papers / docs externas com links estáveis.
