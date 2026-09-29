---
id: 0016
title: AI Studio — Configuração de IA data-driven (Agents/Skills/Workflows/KB)
status: Accepted
date: 2026-06-17
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, studio, config, data-driven, agents, skills, workflows, kb, arquitetura]
supersedes: []
related: [0014, 0013, 0003, 0006, 0008, 0011]
---

# ADR-0016 — AI Studio

## Status

`Accepted` — desde 2026-06-17.

## Contexto

Instruções de agentes, "skills" e orquestração vivem em código (`src/shared/config/agents/*`,
`src/features/ai-agents/agents/*`). Ajustar comportamento exige PR+deploy. O produto precisa de
uma camada de gestão (CRUD na admin) que valha em runtime, sem deploy.

## Decisão

Introduzir o **AI Studio**: Agents, Skills e Workflows passam a ser configuração **data-driven**
no Firestore (coleções `aiAgents`, `aiSkills`, `aiWorkflows`), globais à org. Knowledge Bases
(`knowledgeBases` + `knowledgeBaseDocs`) organizam documentos para RAG escopado, podendo ser
globais ou por `clientId`. Tools permanecem em **código** (catálogo read-only).

- **Tudo é instrução que dirige o runtime LLM** (coerente com Mastra/ADR-0014).
- **Workflow** = instrução em prosa interpretada pelo supervisor; selecionado por descrição +
  agente roteador, com 1 workflow default de fallback.
- **Proteção:** `origin: system|user`; registros de sistema não são deletáveis e têm campos
  estruturais travados (política em código), com ação "restaurar padrão" (re-seed).
- **Integração runtime live e faseada**, atrás de feature flags, com **fallback** aos builders
  de prompt em código (zero regressão).
- A state-machine determinística do Canvas (ADR-0003) **não é alterada**; coexiste.

## Consequências

**Positivas**:

- Gestão de IA sem deploy; superfície de admin uniforme; rollback por flag.
- Reaproveita RAG/embeddings, multi-tenancy e tool gating existentes.

**Negativas / trade-offs**:

- Config de runtime agora depende de leitura do Firestore (mitigado por cache + fallback).
- Builders de prompt passam a ter papel duplo (fonte de tipos/seed/fallback) até consolidação.

## Alternativas consideradas

- **Manter tudo em código**: rejeitada por exigir deploy frequente, bloqueando iteração rápida.
- **SQL catalogue para config de IA**: rejeitada por simplicidade (Firestore é onde já moram
  metadados, embeddings e memória).

## Referências

- ADR-0014 — Mastra Runtime full (Agent + Memory + RAG; estas extensões usam Agent/Memory).
- ADR-0013 — Firestore para config/metadata (Storage canônico para AI Studio).
- ADR-0003 — mini state-machine Canvas (coexiste, não alterada).
- ADR-0006 — multi-tenancy strict isolation (Agents/Skills/KB respeita clientId onde aplicável).
- ADR-0008 — phase-based tool gating (integra com AI Studio tool gating).
- ADR-0011 — semantic recall TTL/PII (reusa mecanismo de embeddings/recall).
