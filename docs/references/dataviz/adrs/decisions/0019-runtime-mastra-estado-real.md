---
id: 0019
title: Runtime Mastra — estado real (supervisor via agents, memória própria em Firestore)
status: Accepted
date: 2026-08-04
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, mastra, runtime, agent, memory, arquitetura]
supersedes: [0014]
related: [0010, 0013, 0017]
---

# ADR-0019 — Runtime Mastra: estado real

## Status

Accepted — 2026-08-04. Substitui a **ADR-0014**.

## Contexto

A ADR-0014 (`Accepted`, 2026-05-06) decidiu a migração do AI SDK v6 direto para
o runtime Mastra completo. A decisão continua válida; **a descrição do estado
não**. A revisão de módulos de 2026-08-04 encontrou três afirmações da 0014 que
não correspondem mais ao código, e o `CLAUDE.md` já carregava um aviso de que a
ADR estava defasada — aviso que, pela regra do próprio projeto, não é o lugar
onde se corrige uma ADR: decisão aceita é imutável, e mudança vai em ADR nova
com `supersedes:`.

Os três pontos:

1. **A migração dos sub-agentes está concluída.** A 0014 a descreve como
   pendente. Os 8 sub-agentes vivem em `src/features/ai-agents/mastra/`.
2. **O orchestrator v6 não existe mais.** A 0014 fala dele como componente
   ativo; `features/ai-agents/orchestrator.ts` e o diretório `agents/` foram
   removidos.
3. **A supervisão multi-agente voltou.** A 0014 registra que ela havia sido
   removida na migração. Ela existe hoje, por outro mecanismo: a chave
   `agents:` do construtor `Mastra`, montada em
   `features/ai-agents/mastra/build-supervisor-agent.ts` e selecionada em
   `app/api/chat/resolve-chat-agent.ts`.

Há ainda um quarto ponto, que a 0014 não errou mas também não decidiu
explicitamente: `@mastra/memory` **não está em uso**.

## Decisão

Registrar o estado real do runtime como decisão, em quatro pontos:

1. **`@mastra/core` é o runtime de agente.** `Mastra` + `Agent`, e os
   conversores de `@mastra/core/stream` para a superfície de UI message stream
   do `ai@6`. Versão em uso: `@mastra/core@^1.32.1`.

2. **Supervisão multi-agente pela chave `agents:`, não por `tools:`.** O
   supervisor recebe os sub-agentes como agentes, não como ferramentas. É o
   mecanismo que permite ao workflow ativo (ADR-0017) trocar a instrução do
   supervisor sem tocar em código.

3. **A memória é serviço próprio em Firestore, não `@mastra/memory`.**
   `src/shared/lib/memory/memory-service.ts`, coleção `workingMemory`, com
   busca vetorial por cosseno em `src/shared/lib/firestore/vector-search.ts`.
   Coerente com a ADR-0013, que tornou o Firestore o storage canônico: adotar
   `@mastra/memory` significaria um segundo storage de memória, com outro
   modelo de retenção e de PII, contra o que a ADR-0011 estabeleceu.

4. **`@mastra/rag`, `@mastra/evals` e `@mastra/mcp` não são adotados.** RAG usa
   a busca vetorial própria acima; evals usam o harness próprio da ADR-0010.

## Consequências

**Positivas.** A ADR volta a descrever o sistema, e o aviso de defasagem sai do
`CLAUDE.md` — que é contexto sempre-ativo e não deveria carregar errata de ADR.
A escolha de memória fica registrada como decisão, e não como omissão: quem
propuser `@mastra/memory` no futuro parte de um "por que não" escrito.

**Negativas.** Manter memória e RAG próprios significa não herdar melhorias do
Mastra nessas áreas. É o preço de ter um único storage canônico.

**Riscos.** `@mastra/core` evolui rápido: uma major nova pode mexer na chave
`agents:` e em `@mastra/core/stream`, que é o ponto de contato com o `ai@6`.
Mitigação: a rota de chat degrada para o agente `descriptive` quando a
resolução de workflow falha (fail-soft), e esse caminho tem teste.

**Dívida reconhecida, não resolvida aqui.** Não há observabilidade de LLM —
sem telemetria no `new Mastra(...)`, sem token, custo ou latência
instrumentados (achado R6 da revisão de 2026-08-04). Fica registrado como
consequência aceita do MVP, não como esquecimento.

## Alternativas consideradas

- **Editar a ADR-0014.** Rejeitada: `adrs/README.md` estabelece que ADR é
  imutável após `Accepted`; mudança vai em ADR nova com `supersedes:`.
- **Adotar `@mastra/memory`.** Rejeitada por ora: criaria um segundo storage de
  memória, em conflito com a ADR-0013, e obrigaria a reimplementar o TTL e o
  scrubbing de PII da ADR-0011 no modelo do Mastra.
- **Deixar como está e manter a errata no `CLAUDE.md`.** Rejeitada: o
  `CLAUDE.md` é lido em todo turn e vira o lugar errado para corrigir decisão;
  além disso a errata não sobrevive a quem lê a ADR direto.
