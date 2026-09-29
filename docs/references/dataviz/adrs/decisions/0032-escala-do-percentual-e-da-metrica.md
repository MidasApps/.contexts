---
id: 0032
title: A escala do percentual é metadado da métrica — KPI e tabela respeitam as colunas em pontos
status: Accepted
date: 2026-09-26
deciders: [andrelmm]
consulted: [time-eng]
informed: [time-ai, time-produto]
tags: [metricas, percentual, formato, kpi, tabela, schema]
supersedes: []
related: [0015, 0022, 0023]
---

# ADR-0032 — A escala do percentual é metadado da métrica

## Status

`Accepted` — 2026-09-26.

Histórico:
- 2026-09-26 — decidida após o teste de corretude de dados. Entre três
  opções, o dono do produto escolheu a declaração na métrica.
- Numeração: 0029–0031 estão reservadas para as ADRs do módulo Fontes, que
  ainda não foram escritas.

## Contexto

O app tem duas convenções para `format: 'percent'`:

- **KPI e tabela** multiplicam por 100 (`formatValue` em `useReportData.ts`,
  `formatCell` em `TableBlock.tsx`). Esperam fração: 0,8227.
- **Gauge, progresso, gráfico, heatmap e dispersão** formatam o número como
  vem. Esperam pontos: 82,27.

As métricas também seguem as duas convenções. No catálogo `imobiliaria.*`, o
helper `sql({ scale })` embrulha o template em `SELECT * REPLACE (100 * col …)`
para alimentar o segundo grupo. As métricas de obra de `covenants.*` já vêm em
pontos no próprio dado.

Até esta ADR, a escala só existia no texto do SQL. Só um teste offline, o
`real-estate-templates.test.ts`, cobrava o par certo entre métrica e bloco, e
só para os templates versionados. O caminho de autoria em runtime (o
assistente pelo `add_block`/`update_block`, o inspetor, a paleta) não passava
por esse teste.

O teste de corretude de 2026-09-26 encontrou a consequência. Em Metas &
Resultados, o assistente criou um KPI "Atingimento da Meta de VGV" com
`format: 'percent'` sobre `imobiliaria.atingimento_meta_vgv_pct`, que devolve
82,27, e a tela exibia **8.227,22%**. O mesmo número aparecia certo (82%) no
bloco de progresso do Painel Executivo.

## Decisão

A métrica declara quais colunas do resultado estão em pontos percentuais:

```ts
percentPointColumns?: string[]   // MetricDoc, src/shared/schemas/metric.ts
```

- **Ausente** significa que toda coluna percentual é fração, que é o
  comportamento de antes. A mudança é aditiva e todo documento antigo continua
  válido.
- **KPI e tabela** respeitam a declaração. Em `applyMetricRowsToBlock`, a
  coluna declarada em pontos vira fração antes de formatar, e só quando o
  bloco (ou a coluna da tabela) está em `format: 'percent'`. A tabela converte
  a linha uma vez, então célula, rodapé e CSV leem o mesmo número.
- **Os blocos do segundo grupo não mudam.** Eles já esperam pontos.
- **Os catálogos declaram o campo:**
  - o helper `sql({ scale })` do imob preenche `percentPointColumns` com as
    mesmas colunas que multiplica;
  - `covenants-v2.mjs` declara as métricas de obra e
    `plano_empresario_uso_pct`.
- **Os testes dos catálogos travam a coerência:**
  - no imob, a declaração existe exatamente quando o template multiplica
    por 100;
  - nos dois catálogos, toda coluna declarada existe em `outputColumns`.
- **Backfill:** `scripts/seed-metric-percent-points.mjs` grava o campo por
  merge, com dry-run por padrão, idempotente e com a guarda de produção.
- **O teste de templates relaxa:** KPI ou tabela sobre uma métrica em pontos
  só é erro se a métrica **não** declarar a escala.

## Consequências

Positivas:
- O KPI de 8.227,22% passa a exibir 82,27% sem ninguém mexer no bloco
  gravado.
- A proteção vale para qualquer caminho de autoria (assistente, inspetor,
  paleta, templates), porque a leitura acontece na aplicação do dado, não na
  criação do bloco.
- A escala deixa de ser inferida do texto do SQL no runtime.

Negativas e riscos:
- Existem duas fontes para a mesma informação no catálogo do imob: o
  `REPLACE (100 *)` do template e a declaração. O teste de catálogo impede
  que divirjam.
- Métrica criada ou alterada **pelo chat** (ADR-0023) não declara a escala.
  Se o modelo escrever `100 * x`, o problema volta para aquela métrica.

Follow-ups:
- Deixar `create_metric`/`update_metric` declararem `percentPointColumns`, ou
  recusar `100 *` no SQL de percentual pedindo fração.
- Rodar o backfill em cada banco: `seed-metric-percent-points.mjs --apply`.

## Alternativas consideradas

- **Padronizar tudo em fração.** Acabaria o helper `scale`, e gauge,
  progresso e gráfico passariam a multiplicar por 100. Seria o modelo mais
  simples no fim, mas mexe em ~70 métricas, nos renderizadores e nos
  thresholds dos templates de uma vez, com risco alto de quebrar números que
  hoje estão certos. Pode vir depois, com esta ADR como passo intermediário.
- **Só uma trava no `add_block`/`update_block`.** É barata, mas cobre apenas
  o assistente e ainda precisaria descobrir a escala por inferência do SQL.
