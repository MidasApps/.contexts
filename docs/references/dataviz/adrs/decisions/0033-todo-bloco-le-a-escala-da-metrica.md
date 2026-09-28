---
id: 0033
title: Todo bloco lê a escala do percentual da métrica — e o chat a declara
status: Accepted
date: 2026-09-26
deciders: [andrelmm]
consulted: [time-eng]
informed: [time-ai, time-produto]
tags: [metricas, percentual, formato, blocos, ia, schema]
supersedes: []
related: [0023, 0032]
---

# ADR-0033 — Todo bloco lê a escala do percentual da métrica

## Status

`Accepted` — 2026-09-26.

Estende a ADR-0032 sem substituí-la. A 0032 continua valendo para o campo
`percentPointColumns` e para KPI e tabela. Esta ADR muda o trecho em que a
0032 dizia que gauge, progresso e gráficos "não mudam".

## Contexto

A ADR-0032 tornou a escala do percentual um metadado da métrica
(`percentPointColumns`), mas só KPI e tabela passaram a lê-lo. Com isso,
dois buracos continuaram abertos:

1. **O caso espelhado.** Gauge, progresso, gráfico, heatmap, dispersão,
   rosca, boxplot, metas, treemap, funil, sankey, comparativo e sparkrows
   formatam o número como vem, ou seja, esperam pontos. Uma métrica em
   **fração** exibida num gauge com `format: 'percent'` mostraria "0,82%" em
   vez de 82%. Só o teste offline dos templates pegava isso; a autoria em
   runtime (assistente, inspetor, paleta) não passa por ele.
2. **Métricas criadas pelo chat** (ADR-0023). O `create_metric` e o
   `update_metric` não tinham como declarar a escala. Um modelo que
   escrevesse `100 * x` gravaria uma métrica em pontos sem declaração, e o
   KPI voltaria a mostrar "8.227%".

Estado no dia da decisão:
- 34 métricas declaram colunas em pontos (26 `imobiliaria.*` e 8
  `covenants.*`).
- Nenhuma métrica foi criada pelo chat.
- A auditoria das 38 páginas não achou nenhum bloco cujo número mude com
  esta regra: o único afetado, o KPI de atingimento, já tinha sido corrigido
  pela 0032.

## Decisão

**1. A escala é resolvida entre métrica e bloco, antes de qualquer
aplicador.** O módulo `src/shared/lib/metrics/percent-scale.ts` põe as linhas
da métrica na convenção do bloco. O `useReportData` o chama para o período
atual e para o comparativo, de modo que as duas séries saem na mesma régua.

- KPI e tabela multiplicam `percent` por 100 e querem fração: uma coluna
  declarada em pontos é dividida por 100.
- Todos os outros blocos querem pontos: uma coluna em `percent` que **não**
  está declarada em pontos é multiplicada por 100.
- `percentColumnsOf` diz quais colunas da métrica cada bloco formata em
  `percent`. No gráfico, cada eixo usa o próprio formato (`format` e
  `rightFormat`), e `value` corresponde a `dataKeys[0]`. Na dispersão, `x` e
  `y` seguem `xFormat` e `yFormat`.

**2. O que o bloco configura em `percent` é sempre em pontos.** Limite de
gauge, faixa de atenção e meta de progresso: 5 significa 5%. As descrições
das tools `add_block`/`update_block` dizem isso ao modelo. O teste de
templates passa a cobrar um gauge percentual com limite em fração, no lugar
da regra antiga de "casar a escala com o bloco".

**3. O chat declara a escala.** `create_metric` e `update_metric` aceitam
`percentPointColumns`. A instrução é devolver percentual como fração e
declarar só o que já vem em pontos. A validação do rascunho ganha a etapa
`escala` (`percent-scale-guard.ts`), que recusa:
- uma coluna declarada que a consulta não devolve;
- um `× 100` no SQL sem nenhuma coluna declarada.

A recusa explica os dois caminhos, e o modelo corrige na chamada seguinte.
Uma correção que não menciona a escala herda a declaração do documento,
podada às colunas que o SQL novo ainda devolve.

## Consequências

Positivas:
- O número certo deixa de depender de quem monta o bloco lembrar de casar a
  escala com o tipo. Vale para qualquer bloco e qualquer caminho de autoria.
- A mesma métrica pode alimentar um KPI e um gauge lado a lado, e os dois
  mostram 82%.

Negativas e riscos:
- **Uma métrica em pontos sem declaração** exibida em bloco da família
  "pontos" com `percent` passaria a ser multiplicada por 100. Hoje não
  existe nenhuma: os catálogos declaram todas, e os testes de catálogo
  impedem que o `REPLACE (100 * …)` do imob exista sem a declaração. Uma
  métrica nova de outra origem (admin, seed novo) precisa declarar.
- A trava do `× 100` é heurística e textual. Um `* 100` que não é percentual
  (centavos, por exemplo) também é recusado. A saída é declarar ou reescrever
  a conta; a mensagem explica.

Follow-ups:
- O editor de métricas do admin ainda não expõe `percentPointColumns`.

## Alternativas consideradas

- **Padronizar tudo em fração.** Descartada na 0032 pelo raio de mudança;
  esta ADR chega ao mesmo efeito, uma escala que não depende do bloco, sem
  reescrever métricas nem thresholds.
- **Só a parte do chat.** Impediria o "8.227%" em métricas novas, mas
  deixaria o gauge mostrando "0,82%" para qualquer métrica em fração.
