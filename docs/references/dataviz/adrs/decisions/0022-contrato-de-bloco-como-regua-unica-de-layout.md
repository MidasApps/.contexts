---
id: 0022
title: Contrato de bloco como régua única de layout, e forma declarada na métrica
status: Accepted
date: 2026-08-13
deciders: [giulliano.soares]
consulted: [time-ai, time-eng]
informed: [time-eng]
tags: [canvas, layout, autoria, schema, metricas, ai]
related: [0015, 0019, 0020, 0021]
supersedes-partial: [0021]
---

# ADR-0022 — Contrato de bloco como régua única de layout

## Status

Accepted — 2026-08-13.

## Contexto

A ADR-0020 pôs as tools de autoria no supervisor. Com a IA construindo bloco a
bloco — em vez de a página nascer de template, já com layout pronto — apareceu o
que nenhum template exercitava: **três componentes do sistema mediam a mesma
linha com réguas diferentes.**

| onde | régua | efeito |
|---|---|---|
| renderer (`ReportPage.tsx:440`, `CanvasPanel.tsx:610`) | `grid-cols-6` | a verdade da tela |
| `canvas-store` (`MIN_SLOTS`, `SLOTS_POR_LINHA = 3`) | 3 slots | encaixe de linha errado |
| tools de autoria (`.min(1).max(3)`, "1=1/3, 2=2/3, 3=full") | 3 colunas | teto na metade da tela |

Consequência medida: **tudo que a IA criava nascia com no máximo metade da
largura que ela acreditava ter pedido.** Um KPI de `colSpan: 1` ocupa 1/6; uma
"tabela linha inteira" (`colSpan: 3`) ocupa 3/6. A tabela `MIN_SLOTS` não tinha
entrada para `kpi`, `donut` nem `gauge` — os três caíam no default 1, e são
justamente os que menos toleram 1. `addBlock` e `moveBlock` chegaram a discordar
entre si sobre o que cabe numa linha.

Três blocos existiam no renderer, em produção, **sem tool**: `donut`, `gauge` e
`chart` do tipo `waterfall` — inalcançáveis pela IA. `gauge` é o formato de
covenant, que é o assunto do produto.

E a métrica **não declara a forma do resultado**. Existe `metric.type`, marcado
back-compat, com zero leitores em runtime; as 64 métricas de produção são
`recipe.kind: 'sql'`, e para essas o resolver devolve `outputColumns: []`. O
catálogo injetado no prompt era `id — label — description`: para o modelo,
`contratos_total` (escalar) e `rating_serie` (série pivotada de 8 colunas) são
indistinguíveis. Uma série dentro de um KPI exibe **o primeiro mês como se fosse
o valor atual** — número errado, com confiança, sem erro nem log.

Não havia nenhuma etapa de layout, design ou revisão visual — nem agente, nem
step, nem validação. A única rubrica de layout do repositório
(`evals/scorers/layout-coherence.ts`) lê um shape produzido pelo orquestrador
deletado na ADR-0020 e roda contra um stub.

## Decisão

1. **Contrato de bloco em módulo único**
   (`src/features/report-authoring/schema/block-specs.ts`): por tipo, o
   propósito, as formas de métrica que aceita, os campos obrigatórios e
   `{ min, recomendado, max }` em colunas do grid de 6, cada número com a
   justificativa medida junto.

2. **Todo consumidor deriva dele.** O encaixe do `canvas-store`, os limites e
   defaults do Zod das tools, a tabela de blocos do prompt do supervisor e a
   normalização em `apply-tool-result`. A régua passa a ser uma. O prompt é
   **gerado** do contrato — texto não fica em sincronia com código por
   disciplina, fica por ser derivado dele.

3. **A largura depende da configuração, não só do tipo.** Barra horizontal
   exige 4 (o eixo de categoria reserva 120px fixos); tabela de 4+ colunas não
   desce de 6 (células `nowrap` viram scroll, não refluem); rosca sem cards
   laterais desce para 2.

4. **`shape` e `outputColumns` passam a ser declarados no documento da métrica**
   (aditivos, opcionais — regra `schemas`), preenchidos no seed para as 64.
   Formas: `scalar`, `timeseries`, `timeseries_multi`, `timeseries_pivot`,
   `breakdown`, `rows`. A forma manda na escolha do bloco.

5. **`donut`, `gauge` e `waterfall` ganham tool**, e `update_*` passa a validar
   `metricId` — a checagem existia só nos `add_*`, então trocar a métrica de um
   bloco por um id inventado passava batido até o 404 do batch, depois de salvar.

6. **A verificação é determinística, não um segundo agente.** Cada criação
   devolve em `layout` a linha em que o bloco caiu e quantas colunas sobraram,
   simulando com a mesma função de encaixe que o store aplica. Um LLM revisor
   seria mais lento, não-determinístico e precisaria do mesmo contrato para
   julgar — o contrato é o revisor.

7. **Correção da ADR-0021, decisão 4.** Aquela ADR registra que o supervisor
   passou ao tier `flash` (thinking 0). O que ficou em código é `fast`
   (thinking 2048), por estabilidade de tool-calling — duas falhas intermitentes
   com thinking zero, ambas em turno com ferramenta. O comentário em
   `build-supervisor-agent.ts:14-50` carrega a medição. Vale `fast`; o tier
   `flash` segue sem consumidor em produção.

## Consequências

**Positivas.** O layout deixa de depender de o modelo adivinhar. A largura de
bloco muda em um arquivo e o prompt acompanha. A IA alcança todos os blocos que o
produto renderiza. Forma incompatível vira recusa com motivo, no lugar de número
errado exibido com confiança.

**Negativas.** `shape` precisa ser preenchido em toda métrica nova — métrica sem
forma declarada volta ao regime de adivinhação. O `canvas-store` passa a depender
de `features/report-authoring`, uma inversão em relação ao normal (shared não
depende de feature); aceita porque o contrato é de domínio, não de UI, e a
alternativa era manter a régua duplicada.

**Sem migração.** Blocos já salvos ficam como estão — os templates de produção já
usam a escala /6 correta (2, 3, 6). Só o que a IA criou sob a régua antiga está
estreito, e `apply-tool-result` normaliza o que voltar de conversa antiga.

## Alternativas consideradas

- **Um agente revisor de layout (9º sub-agente).** Rejeitada: exigiria as três
  edições hardcoded que a ADR-0019 documenta (`AGENT_FACTORIES`,
  `SUB_AGENT_KEYS`, factory), e ainda precisaria do contrato para ter critério.
  Custo de latência e não-determinismo sem ganho sobre a verificação em código.
- **Inferir a forma do template SQL por regex.** Rejeitada: cobre os 64 casos
  atuais mas quebra em CTE, `SELECT *` e no SQL que a IA gera em runtime.
- **Normalizar as páginas existentes na carga.** Rejeitada pelo dono do produto:
  alteraria em silêncio páginas ajustadas à mão no inspector.
