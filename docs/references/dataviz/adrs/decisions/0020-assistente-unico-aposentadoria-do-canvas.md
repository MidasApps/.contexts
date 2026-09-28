---
id: 0020
title: Assistente único — tools de autoria no supervisor e aposentadoria da pilha de canvas
status: Accepted
date: 2026-08-12
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [ai, mastra, agent, arquitetura, produto, ui]
related: [0015, 0017, 0019]
---

# ADR-0020 — Assistente único: autoria no supervisor, canvas aposentado

## Status

Accepted — 2026-08-12.

## Contexto

O produto tinha **duas pilhas de LLM em paralelo**, e qual delas atendia o
usuário dependia da tela em que ele estava:

| | Assistente geral | Canvas |
|---|---|---|
| Rota | `/api/chat` | `/api/canvas-chat` |
| Runtime | supervisor Mastra (ADR-0019) | orquestrador próprio + motor de workflow próprio |
| Componente | `AISidebar` | `ChatPanel` (em `ConversationSidebar`) |
| Sabe construir página | não | sim |

`ChatContent` escolhia entre os dois por `editingReport`. O sintoma que expôs o
desenho foi o usuário pedir uma página nova ao assistente e ouvir que ele não
tinha essa funcionalidade — resposta correta sobre si mesmo, já que as tools de
autoria só existiam do outro lado.

O arranjo produzia mais do que uma recusa:

- **Lógica duplicada e já divergente.** O `switch` que aplica resultado de tool
  no store existia nos dois componentes. Só uma das cópias checava
  `action === 'update_block'` antes de mesclar; pela outra, um update recusado
  pela tool virava merge cego — que foi como um KPI virou um `chart` sem `data`
  e derrubou a página no ErrorBoundary.
- **Página que não persistia.** O `create_page` do canvas criava página no store
  do navegador; o `handleSave` do relatório grava um documento só. Página criada
  por ali não existia em lugar nenhum depois do reload.
- **Segundo conjunto de prompts e tools** para o mesmo domínio, com a
  manutenção pagando duas vezes.

`/api/canvas-chat` tinha um único consumidor restante: a rota `/explore`
("Análise Conversacional"), alcançável pela landing page e por permissão de
admin.

## Decisão

1. **O supervisor Mastra recebe as tools de autoria** (`tools:`), além dos
   sub-agentes (`agents:`): `create_report_page`, `add_*_block`,
   `update_*_block`, `remove_block`, `move_block`. Isto **não contradiz** o
   ponto 2 da ADR-0019: delegação a sub-agente continua por `agents:`; `tools:`
   carrega ferramenta de autoria, não agente.

2. **Página é documento de relatório, e só isso.** `create_report_page` escreve
   em `clients/{id}/groups/{g}/reports/{r}` com `clientId` do contexto do
   servidor (ADR-0006). O conceito de "página de canvas" efêmera acaba.

3. **O inventário de blocos da tela aberta vai em toda requisição** —
   `pagesContext` + `selectedBlockIds`, não só em modo de edição. É ele que
   permite à tool recusar alvo de tipo incompatível; sem ele o modelo edita às
   cegas.

4. **Um aplicador só** (`features/report-authoring/apply-tool-result.ts`),
   função pura testável sem render. A diferença entre telas vira dependência
   injetada, não código duplicado.

5. **Um componente de chat.** `ChatContent` deixa de trocar por `editingReport`.

6. **A pilha de canvas é aposentada**: `/api/canvas-chat`, o orquestrador e seu
   motor de workflow próprio, o prompt `canvas-orchestrator`, as tools que só
   ele usava (`declare_layout`, `fill_block`, `add_slot`, `remove_slot`,
   `create_page`, `set_filters`, `query-data`, …), a rota `/explore` e seus
   componentes. O que sobra — 4 tools de bloco + o aplicador — deixa de se
   chamar `canvas-orchestrator` e passa a `features/report-authoring/`.

7. **Bloco aponta para métrica; não carrega número.** As tools de autoria vieram
   do canvas, onde a IA consultava o BigQuery e colava o valor formatado dentro
   do bloco (`value: "R$ 1.200.000,00"`, dez pontos de sparkline no payload).
   Isso é incompatível com o filtro de período: valor literal é número congelado
   no documento, e `useReportData` refaz a busca quando o `dateRange` muda. Os
   schemas passam a exigir `metricId` e a **não** aceitar `value`/`data`/`rows`.
   A tool recusa `metricId` fora do catálogo do cliente (`METRIC_NOT_FOUND`, com
   candidatos), como já recusava alvo de tipo errado.

8. **O supervisor recebe o catálogo de métricas.** `buildOrchestratorDynamicContext`
   injetava contexto de sessão e indicadores, mas não o contexto semântico — só
   `buildAgentDynamicContext` (sub-agentes) o fazia, porque quem escrevia SQL
   eram eles. Com autoria no supervisor, bloco É referência a métrica: sem a
   lista ele pedia os ids ao usuário — que não os conhece — ou delegava a um
   sub-agente para "listar as métricas". Entra só a seção de métricas
   (`renderMetricCatalogSection`); entidades e atributos do data contract ficam
   de fora, pois servem para gerar SQL novo.

## Consequências

**Positivas.** A capacidade do assistente para de depender da tela. A correção
de um comportamento passa a valer em todo lugar, porque só existe um lugar.
Some um runtime de LLM inteiro da manutenção — 63 arquivos. Durante a edição de
relatório passa a existir histórico de conversas, que o `ChatPanel` não tinha.

**Negativas.** `/explore` sai do produto; quem usava a tela imersiva de canvas
perde a experiência de página inteira. O fluxo de esqueleto (bloco `skeleton`
preenchido por `fill_block`) deixa de existir — o tipo e o renderer continuam,
para dados antigos, mas nenhum caminho novo cria bloco assim.

**Riscos.** O supervisor passa a acumular ferramentas de análise e de autoria no
mesmo agente: prompt maior, e mais espaço para escolher a tool errada. O gate por
fase que o `prepare-step` do canvas fazia não foi migrado — sem workflow de
canvas não há fase. Mitigação atual: a seção de autoria do prompt lista os
blocos existentes com id e tipo, e as tools de update recusam alvo incompatível.

## Alternativas consideradas

- **Migrar `/explore` para `/api/chat` e mantê-lo.** Rejeitada: preservaria o
  fluxo de esqueleto, que precisaria ser reimplementado no supervisor, e
  devolveria ao produto dois modos de fazer a mesma coisa — a origem do problema.
- **Dar as tools de autoria ao `/api/chat` e manter `/api/canvas-chat` vivo.**
  Rejeitada: as duas pilhas continuariam divergindo, agora com sobreposição.
- **Registrar as tools de autoria no `TOOL_REGISTRY` do AI Studio.** Rejeitada:
  o registry resolve tools por chave de configuração (ADR-0017), e as de autoria
  dependem do `pagesContext` da requisição — construção por requisição, não
  configuração de agente.
