---
id: 0025
title: Filtro só quando pedido — painel global enxuto e filtro de página criado pela IA
status: Accepted
date: 2026-08-18
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [produto, ui, filtros, ai, arquitetura]
related: [0015, 0020, 0023, 0024]
---

# ADR-0025 — Filtro só quando pedido

## Status

Accepted — 2026-08-18.

## Contexto

O painel de filtros trazia doze controles. Sete deles não filtravam nada, e isso
não é figura de linguagem — está medido:

| Fato | Evidência |
|---|---|
| Os seis "filtros avançados" (Rating, Elegibilidade, Faixa LTV, Faixa de Atraso, Tipo Proponente, Grupo Repasse) tinham as opções **escritas à mão no código** | `DataProvider.tsx` — `['A','B',…]`, `['0-30%','30-50%',…]` |
| Eles e o **Empreendimentos** só chegavam à consulta pela via *ambient*: `{ambient:entidade}` no template, ou recipe `aggregation` | `resolve-metric.ts` |
| O catálogo em produção tem **zero** `{ambient` e **zero** recipes `aggregation` | as 64 métricas `covenants.*` são `sql` escrito à mão |
| Nenhum template declara filtro `in` sem `control: 'dropdown'` — nada era alimentado pelo Empreendimentos | os 5 `kind:'in'` existentes têm `control` |

Marcar "Rating A" não mudava um número na tela. O único efeito real que restava
era no prompt: o contexto dinâmico injetava "Projetos filtrados: …" e uma
cláusula `AND projeto IN (…)` pronta para o `execute_sql` dos sub-agentes.

Enquanto isso, o filtro que recorta de verdade — o de **página**
(`metricPageFilters` + `PageFilterBar`, valores vindos de
`/api/metrics/filter-values`) — só existia se um template o declarasse de
antemão.

## Decisão

**1. O painel global fica com cinco controles**: período analisado, modo de
visualização, comparar períodos, testar como usuário e modo debug (mais a ação
de exportar PDF). Saem Empreendimentos e os seis avançados, junto de tudo que só
existia para servi-los: o retrato por cliente no store, `advancedFiltersToAmbient`,
as cláusulas prontas no prompt, o `buildProjetoClause` de cinco tools analíticas
e o `parameterize-sql`, que já não tinha chamador.

**2. Página não nasce com filtro.** Filtro aparece porque alguém pediu —
`add_page_filter` cria o seletor na página aberta, `remove_page_filter` tira.

**3. As ferramentas escrevem direto no Firestore.** O `handleSave` do relatório
grava apenas `blockMap` e `layout`; filtro que viajasse pelo canvas se perderia
no salvamento. A tela relê o documento por evento de janela — mesmo padrão do
`new-page-request`.

**4. Declarar o filtro não o faz filtrar, e a ferramenta diz isso.** A métrica
precisa citá-lo no template (`{filter.banco:transacoes.banco_codigo}`).
`add_page_filter` confere quais blocos da página citam a chave e devolve os dois
grupos — quem reage e quem ignora. Quando ninguém reage, o resultado manda o
assistente ou ajustar a métrica (se for `chat.*`, via `update_metric`) ou avisar
o usuário. Sem isso, a ferramenta recriaria o defeito que esta ADR remove.

**5. `remove_page_filter` não toca nos filtros de tempo** (`date_range`,
`snapshot`, `ate`): eles não são controles de tela, são como as métricas da
página recebem o período do painel. Removê-los faria os blocos pararem de
responder à data, em silêncio.

**6. Os filtros já declarados também saem.** Os cinco seletores que dois
templates traziam (Banco, Categoria, Tipo) deixam de ser declarados, e
`scripts/remove-page-dropdown-filters.mjs` os remove dos relatórios já gravados
— template só vale no import, e sem a varredura as páginas em produção
continuariam mostrando os seletores para sempre.

Isso custa barato porque **as métricas não mudam**: elas seguem citando
`{filter.banco:transacoes.banco_codigo}` no template, e placeholder sem filtro
declarado vira `1=1`. O seletor volta a valer no instante em que for pedido —
desde que a chave seja a mesma. Por isso `add_page_filter` aceita `chave`
explícita e devolve, em `chavesQueAsMetricasEsperam`, os nomes que as métricas
daquela página já aceitariam: sem isso, "Banco emissor" viraria `banco_emissor`
e o filtro nasceria decorativo.

## Consequências

**Positivas.** A tela deixa de prometer o que não cumpre. O painel encolhe para
o que de fato recorta. Filtro passa a ser resposta a um pedido, com o alcance
declarado no ato — e o assistente tem como dizer "esse filtro não alcança aquele
bloco" em vez de anunciar sucesso.

**Negativas.** Quem usava o seletor de Empreendimentos acreditando que ele
filtrava perde o botão — e essa é a intenção: o número na tela nunca mudou.
Filtrar por empreendimento passa a ser um pedido ao assistente, que cria o
filtro de página e verifica se as métricas o honram.

**O canal *ambient* continua no resolver**, sem ninguém o alimentar. É o que um
filtro de página usaria para valer na página inteira sem precisar de placeholder
por métrica; `useReportData` manda lista vazia, o que diz a verdade.

**Migração.** Os relatórios já gravados precisam da varredura
(`scripts/remove-page-dropdown-filters.mjs`), porque template só vale no import.
Ela é conservadora: apaga apenas entradas com `control: 'dropdown'`, nunca as
chaves de tempo.

## Alternativas consideradas

- **Manter os controles e ligá-los de verdade** (pôr `{ambient:…}` nas 64
  métricas). Rejeitada: são opções literais no código, não do dado do cliente —
  ligar significaria oferecer "Rating A–H" a quem não tem rating.
- **Manter os filtros de página que os templates já declaravam.** Rejeitada
  pelo dono do produto: eles funcionam, mas continuam sendo filtro que ninguém
  pediu. A regra vale para os dois níveis — nasce a pedido, some quando não é
  pedido.
- **Deixar a IA declarar filtro sem conferir quem o honra.** Rejeitada: é
  exatamente o defeito que a ADR remove, com outro nome.
- **Filtro pelo canvas, salvo junto com os blocos.** Rejeitada: exigiria alargar
  o `handleSave` e faria o filtro depender de o usuário salvar — em conflito com
  a ferramenta que já escreve página direto no banco.
