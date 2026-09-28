# Páginas fixas → renderização 100% data-driven (canvas) — Design

> **Princípio (do usuário):** o aplicativo **não tem nada hard-coded** — toda
> página é buscada da estrutura do banco (produto → rota → template → métrica →
> dados). Este doc consolida a auditoria paralela (9 agentes, 2026-06-25) e
> **supersede** o enquadramento de "rewire bespoke por página" do roadmap
> anterior (`roadmap-migracao-paginas-fixas-g9.md`).

## Achado central da auditoria

O caminho **dinâmico já existe e funciona**: `template (Firestore)` →
`useReportData` (`POST /api/metrics/batch`) → `ReportPage`/grid →
`CanvasBlockRenderer` → blocos (`kpi`, `kpis`, `chart` [bar|line|area|composed|
stacked-bar], `table`, `donut`, `gauge`, `text`), reusando os MESMOS widgets das
páginas fixas (`DataTableWidget`, `ChartWidget`). **Nenhuma das 9 páginas exige
um tipo de bloco novo.** As rotas fixas são meros re-exports
(`app/(dashboard)/pdd/page.tsx` = `export { PddPage } from …`).

Logo, "tornar tudo data-driven" **não** é reescrever 9 páginas — é fechar um
**conjunto pequeno e compartilhado** de lacunas:

### A. Templates apontam para `metricId` fantasma (universal)
**Todos** os 9 templates (`dashboard-templates.ts`) referenciam ids que **não
existem** no catálogo (`pdd.total_*`, `pricing.kpi_*`, `contratos.*`,
`inadimplencia.*`, `repasse.*`, `simulacao.*`, `fluxo.serie_mensal`,
`pagamentos.evolucao_recebimentos`, `detalhamento.contratos_full`) — placeholders
escritos antes do catálogo. **Hoje renderizam vazio.** Precisam ser religados aos
`play.*` reais; `productRefs:['credit']` → produto `play`; alguns templates estão
**incompletos** vs a página (ex.: `inadimplencia` não tem LTV Médio, 2 séries por
faixa, nem a aba Restrições inteira — ~8 blocos).

### B. Consertos no renderizador genérico (1× cada, servem TODAS as páginas)
| # | Conserto | Onde | Prioridade | Sem ele |
| --- | --- | --- | --- | --- |
| B1 | **`ambientFilters`** (advancedFilters + projeto via `advancedFiltersToAmbient`) no corpo do batch | `useReportData` | **P0** | filtros avançados/projeto ignorados em todo o canvas |
| B2 | **Escala `format:'percent'` ×100** (catálogo emite razão 0–1) | `useReportData.formatValue` + `TableBlock.formatCell` | **P1** | `ltv`/`desagio`/`inadimplencia` 100× errados |
| B3 | **`bucket` (DATE `YYYY-MM-DD`) → rótulo de mês** + bug `r.month`↔`bucket` nas sparklines | `applyMetricRowsToBlock`, `applySparklineRowsToKpi`, `ChartBlock.isMonthAxis` | **P1** | eixos mensais e sparklines mostram data crua / vazio |
| B4 | **stacked-bar `stackOffset:'expand'`** (+ tick/tooltip %) e **orientação horizontal** | `ChartBlock` + schema | **P1** | contratos rating×empreendimento e 3 charts % da elegibilidade ficam errados |
| B5 | **composed multi-bar + 2º eixo Y** | `ChartBlock` + schema | P2 | safra/saldo-atraso: linha de % achatada contra BRL |
| B6 | **cores por dataKey (escala risco A→H)**; `TableBlock` `stickyFirstColumn`/`pageSize` | `ChartBlock`/`TableBlock` + schema | P2 | cores genéricas; tabela larga sem 1ª col fixa |
| B7 | **Comparação de período** (compareEnabled/comparePeriod → 2º batch → `prev_*`/`DeltaBadge`/delta KPI) | `useReportData` + blocos | **adiar** | sem comparação no canvas (degradação v1 aceitável, como o viewMode) |

### C. Pequenas adições de catálogo (não são "páginas")
- **`play.fluxo_serie`** (sql wide: `bucket, fluxo_esperado, fluxo_contratado`) — o
  composed/tabela do `/fluxo` precisa de **uma** métrica wide; as 2 single-series
  que criamos não compõem num bloco só.
- **~3 escalares** para os KPIs do `/repasse` (count contratos, sum saldo_devedor,
  count restrições>0) e 1 para "Contratos Inadimplentes" do `/elegibilidade` —
  o canvas lê `rows[0].value`, não agrega tabela. (As tabelas wide já criadas —
  `faixa`/`pdd_rating`/`grupos_repasse`/`pricing`/`restrições` — encaixam direto.)

### D. Dados estáticos (não data-driven hoje)
Matriz LTV×Stress (`/simulacao`) e "Descrição dos Grupos" (`/repasse`) são tabelas
ilustrativas hardcoded. Honestamente: ou viram `table` com `rows` embutidas no
template (dado no banco, ilustrativo), ou `text`, ou uma métrica real (SQL de
stress) — esta última fora do escopo atual. Registrado como não-data-driven.

## Decisões que preciso confirmar com você
1. **Escala % (B2):** padronizar o renderizador para `format:'percent'` fazer ×100
   (catálogo continua 0–1). **Risco:** se algum report/template existente já emitia
   `%` ×100, dobraria. Recomendo verificar e padronizar 0–1+×100 (consistente com a
   convenção travada). _Decisão sua._
2. **Comparação (B7):** incluir na v1 (trabalho transversal grande) ou **adiar**
   como o `viewMode` foi adiado no dashboard? Recomendo **adiar** (degradação aceita).
3. **Abas / paginação manual / patterns SVG / IndicatorGuard por-widget:**
   degradações v1 aceitáveis (viram scroll vertical / cores sólidas / sem gating
   por bloco)? Recomendo **aceitar** na v1.

## Plano (fases)

1. **Fase R — Fundações do renderizador** (keystone; brainstorming→spec→TDD).
   B1 (P0) + B2/B3/B4 (P1). B5/B6 conforme apetite; B7 adiado. Toca a `/explore`+
   `/report` vivas → TDD + sem regressão. **Destrava todas as páginas.**
2. **Fase T — Templates canônicos no Firestore.** Religar os 9 templates aos
   `play.*` (+ blocos faltantes, `sparklineMetricId`, `metricPageFilters`,
   `footerAggregations`, `productRefs→play`); adicionar as poucas métricas C.
   Tornar o **Firestore a fonte-de-verdade** (o array TS vira só seed inicial; o
   "hard-coded" a eliminar é a autoria em código → autoria via admin/seed-once).
3. **Fase Flip + aposentadoria.** Repontar cada rota fixa para o renderizador
   dinâmico (1 linha), verificar página a página, e **remover** o componente
   bespoke + hooks legados daquela rota.
4. **G9-final.** Remover `/api/bigquery` + `queries.ts` + `schema-resolver.ts` +
   hooks legados + o array `dashboard-templates.ts` em código.

## Consequência
Uma renderização só (canvas), tudo vindo do banco (produto/rota/template/métrica/
dados), zero página ou template hard-coded. As 9 páginas convergem para o mesmo
motor; melhorias no canvas beneficiam todas e os relatórios custom de uma vez.

## Não-objetivos / degradações v1 aceitas
Comparação de período (B7), abas (→ scroll), paginação manual, patterns SVG por
rating (→ cores sólidas), `IndicatorGuard` por-widget, e a métrica real de stress
de LTV. Todos adicionáveis depois ao renderizador genérico, sem voltar a hard-codear.
