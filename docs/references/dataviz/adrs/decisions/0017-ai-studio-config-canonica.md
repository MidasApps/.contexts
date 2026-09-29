---
id: 0017
title: AI Studio — Config Canônica (prompts data-driven, fim das flags)
status: Accepted
date: 2026-06-18
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, studio, config, flags, mastra, arquitetura]
supersedes: []
related: [0016, 0014, 0013]
---

# 17. AI Studio — Config Canônica (prompts data-driven, fim das flags)

Date: 2026-06-18

## Status

Accepted

Supersede o mecanismo de rollout faseado por flags (`AI_STUDIO_*`) das Fases 1–4. Complementa ADR-0016 (config data-driven), realizando-a por completo. Não altera ADR-0014 (Mastra runtime).

## Context

As Fases 1–4 introduziram instruções/skills/KB/workflows data-driven atrás de flags `AI_STUDIO_*` com fallback ao prompt de código (zero-regressão durante o desenvolvimento). Isso deixou dois caminhos divergentes: com flag on, os agentes liam instruções rasas do Firestore e **perdiam** o contexto dinâmico (schema, glossário, filtros, semantic) que o builder de código injeta. O produto não está em produção (sem clientes), então a complexidade do dual-source não se justifica.

## Decision

A configuração do AI Studio é a **fonte de verdade canônica** dos prompts:
- O texto estático (persona, guia de tools, domínio do agente) vive em `Agent.instructions`; conhecimento compartilhado em 4 skills de sistema (playbooks sempre injetados); o contexto dinâmico (filtros/schema/semantic/dashboard) é sempre anexado em runtime.
- As flags `AI_STUDIO_AGENTS/KB/SKILLS/WORKFLOWS` (env) e os espelhos `useAiStudio*` (app-store) são **removidos**.
- O runtime sempre lê a config; em falha/ausência, cai num **baseline em código** equivalente (estático + dinâmico) — resiliência, não caminho paralelo.
- O código mantém os builders estáticos como fonte do seed e fallback; o seed espelha tudo no Firestore (editável); "Restaurar padrão" reaplica o baseline.
- As tools permanecem code-wired nesta fase (`buildToolsFactory`); tornar o catálogo de tools data-driven é decisão/fase futura.

## Consequences

- **Positivo:** um único caminho de comportamento; agentes nunca rodam cegos; conteúdo editável de fato; menos código condicional.
- **Negativo / risco:** o seed precisa ser aplicado (reseed `--force`) para a config valer; edições do admin a docs de sistema persistem (não são sobrescritas sem `--force`).
- **Follow-up:** tool-catalog data-driven; introspecção dinâmica de schema; migração do corpus de benchmarking para a KB.
