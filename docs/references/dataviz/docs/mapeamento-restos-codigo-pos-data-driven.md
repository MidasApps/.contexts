# Mapeamento de restos de código & funcionalidades dormentes

> ⚠️ **DOCUMENTO HISTÓRICO — não use como retrato do código atual.**
> Descreve o estado de 2026-06-25. A purga de clientes de 2026-08-03
> (branch `chore/limpeza-vila-rosa`) removeu boa parte do que aqui aparece
> como vivo: as 10 páginas fixas do Play e suas rotas, o runtime AI SDK v6
> (`orchestrator.ts` + `agents/*`), `RouteTemplatePage`, a BottomTabBar, os
> seeds dos clientes legados e os 4 patches one-off listados abaixo como
> "genuinamente adiado" — três deles foram removidos, `patch-covenants-
> snapshot-pin` ficou por ser do Vila Rosa e foi removido em 2026-09-25,
> depois de confirmado o forward-fold em `scripts/metrics/covenants-v2.mjs`.
>
> Para o estado atual, veja `CLAUDE.md` e as ADRs em `adrs/decisions/`.

> Pós-migração data-driven (PR #29–#36). Levantamento read-only de 2026-06-25
> por sweep de 6 agentes (BigQuery layer, UI órfã, estado dormente, dados
> hard-coded, scripts, docs/exports).

## Status de execução (concluído — PRs #37–#42)

| Item | PR | LOC |
|---|---|---|
| Tier 1 — órfãos/dead (arquivos, componentes, store slice, exports) | #37 | ~2.355 |
| Tier 2a/2b — bloco morto de `queries.ts` + variant de chart | #38 | ~1.490 |
| Tier 2c — array `DASHBOARD_TEMPLATES` + seeds legados | #39 | ~1.790 |
| Tier 3 — config morta (`constants.ts`) + scripts dev-DB + docs superseded | #40 | ~640 |
| Permissão por indicador (write-only) → controle fica por rota | #41 | ~430 |
| Tier 2d — `filter_options` → `/api/filter-options`; remove `/api/bigquery` | #42 | ~30 |

**Total removido: ~6.700 LOC.** Tudo verificado com tsc/lint/build verdes e suíte
sem regressão (as 6 falhas residuais do full-run são flakiness pré-existente de
Mastra/orchestrator, reproduzem em `develop` limpo).

### Falta (genuinamente adiado — não é cleanup mecânico)
- **Patches one-off no DB vivo** (`patch-sbpe-gaps`, `patch-covenants-snapshot-pin`,
  `cleanup-canonical-and-play-metrics`, `migrate-dev-to-play-dataviz`): exigem
  confirmar *forward-fold* contra o Firestore vivo antes de arquivar (não
  verificável headless).
- **ADR-0015** ainda `Proposed` apesar de ser canon de-facto — promover é decisão
  do arquiteto (ADRs são imutáveis; vai em ADR nova com `supersedes:` se preciso).
- **Smoke-test de runtime** das 10 rotas + filtros contra BigQuery real (gate
  humano — não executável headless).
- Exports usados in-file de baixo valor (`tokenizeExpression`, `LegacyClientSchemaMap`,
  `Client` schema Zod) e comentários de deprecation citando `/api/bigquery` (cosmético).

## Contexto

As 10 páginas fixas são **100% data-driven** (Firestore `dashboardTemplates` →
`useReportData` → canvas). Os `app/(dashboard)/*/page.tsx` são wrappers finos
`<RouteTemplatePage templateId="…" />`. O que ficou para trás é a **camada de
dados legada por baixo** + UI/estado/config que só os antigos consumidores liam.

**Meta-achado (resolvido):** a "Fase 4 / G9-final" do design doc — que à época
do levantamento **nunca tinha sido executada** — foi concluída aqui: o bloco
morto de `queries.ts` saiu (#38, sobrou só o helper de `filter_options` + o
bloco de benchmark, ambos vivos); `/api/bigquery` foi removida e `filter_options`
realocada para `/api/filter-options` (#42); `schema-resolver.ts` manteve só o
contrato fail-loud testado (`resolveColumnOrThrow`).

---

## Resumo por tiers de remoção

| Tier | O quê | Risco | LOC aprox. |
|---|---|---|---|
| **1 — Morto, zero-risco** | 0 importadores, deletar já | nenhum | ~1.700 |
| **2 — Morto após pré-requisito** | vira morto depois de um passo | baixo | ~1.480 |
| **3 — Vivo mas stale** | precisa substituto antes de remover | médio/alto | — |
| **NÃO-TOCAR** | parece morto, está vivo | — | — |

---

## TIER 1 — Morto, zero importadores (deletar já)

### Arquivos inteiros
| Item | Arquivo | Evidência |
|---|---|---|
| **mock-data** (≈434 linhas, ~30 arrays fake) | `src/shared/data/mock-data.ts` | 0 importadores em `src/`/`app/`. Comentário: "will be replaced with BigQuery". Já foi. |
| **comparison helpers** (`calcDelta`, `mergeComparisonData`) | `src/shared/lib/comparison.ts` | só `DeltaBadge` (também morto) lê `calcDelta`; `mergeComparisonData` sem caller |
| **DeltaBadge** | `src/shared/ui/delta-badge.tsx` | não renderizado em lugar nenhum; `KpiCard` usa `PeriodDeltaBadge` interno próprio |
| **IndicatorGuard** | `src/shared/ui/indicator-guard.tsx` | nenhum `<IndicatorGuard>` em JSX vivo |
| **useIndicatorPermissions** | `src/shared/hooks/useIndicatorPermissions.ts` | só `IndicatorGuard` (morto) consome |
| **useRegisterIndicators + useSyncFiltersToStore** | `src/shared/hooks/useRegisterIndicators.ts` | nunca chamados (páginas bespoke que chamavam foram deletadas) |
| **RatingChartPatterns + FaixaChartPatterns** | `src/shared/ui/chart-patterns.tsx` | 0 importadores |

### Componentes UI órfãos (0 importadores reais — só barrels/comentários)
`src/widgets/`: **MockupsMenu** (`app-bar/ui/MockupsMenu.tsx`), **KpiGrid**
(`kpi-grid/ui/KpiGrid.tsx`), **ProductSwitcher** (`product-switcher/ui/`),
**GroupTabs** + **ReportList** + **NewReportModal** (`nav-sidebar/ui/`),
**InlineAIChat** (`ai-sidebar/ui/`), **SimpleBarChart** + **StackedBarChart** +
**ComposedBarLineChart** + **ComparisonTooltip** (`chart-widget/ui/` — os 3
gráficos bespoke + o tooltip que só eles usam), **CanvasHeader**
(`src/pages/explore/ui/CanvasHeader.tsx`).
→ Ao remover os 3 gráficos, limpar também `chart-widget/index.ts:2-4` e
`kpi-grid/index.ts:2`.

### Exports órfãos (símbolo morto, arquivo permanece)
| Símbolo | Local |
|---|---|
| `listProducts` | `src/shared/repositories/product-repo.ts:42` |
| `listDataSources` | `src/shared/repositories/data-source-repo.ts:34` |
| `Client` (schema+type) + `LegacyClientSchemaMap` | `src/shared/schemas/client.ts:31,14` |
| `DashboardTemplate` (schema Zod) | `src/shared/schemas/dashboard-template.ts:38` (3 defs duplicadas vivas) |
| `Intent`/`GatheredContext`/`LayoutPlan`/`ValidationReport` | `src/shared/config/agents/types.ts:15/23/32/36` (sombreados por `canvas-orchestrator/steps/schemas.ts`) |
| `tokenizeExpression` (+ seu teste) | `src/shared/lib/metrics/expression.ts:11` |
| barrel `repositories/index.ts` | 0 importadores (todos deep-import) |
| `isFieldUnavailable` | `src/shared/hooks/useQuery.ts:196` |
| `clearBigQueryClientCache`, `formatTableRefSafe` | `src/shared/lib/bigquery/client.ts:82,129` |
| `selectField`, `buildSelect` | `src/shared/lib/bigquery/schema-resolver.ts:40,54` |
| `getTemplateById` | `src/shared/config/dashboard-templates.ts:1654` |

### Store: slice de indicadores permanentemente vazio
`src/shared/stores/app-store.ts`: `indicators` + `setIndicators`/`upsertIndicator`/
`upsertIndicators`/`clearIndicators` + `filtersSnapshot`/`setFiltersSnapshot`.
Todos os *writers* só eram alcançáveis via `useRegisterIndicators` (morto) → o
slice fica sempre vazio. `buildAIContext` (vivo) lê mas sempre vê `[]` → emite
"Nenhum indicador carregado ainda". **Manter `buildAIContext`**, podar os ramos
indicators/snapshot dele.

### DataProvider: setters sem caller
`setDataBase` (`DataProvider.tsx:196`) e `setProjeto` (`:222`) — nenhum chamador.

---

## TIER 2 — Morto após um pré-requisito

### 2a. `queries.ts` — ~1.150 LOC mortas (o maior bloco)
`src/shared/lib/bigquery/queries.ts` (1.417 linhas). **Vivo:** só
`queryFilterOptions` (+`formatMonthOptionLabel`) e o bloco de benchmark
(`queryBenchmarkAggregated`, `BENCHMARK_FIELDS`, `BenchmarkClient`,
`BenchmarkResult`). **Morto** (14 funções de página + helpers):

`queryTable`, `queryContratosAggregated`, `queryContratosPage`,
`queryPagamentosEvolucao`, `queryFluxoCaixa`, `queryElegibilidadePage`,
`queryInadimplenciaDetalhe` (210 linhas!), `queryPricingPage`, `queryPddPage`,
`querySimulacaoPage`, `queryRepassePage`, `queryDashboardFaixaAtraso`,
`queryDetalhamento`, `queryKpiHistory`, `comparePeriods`, `transformWithJsonata`
+ helpers (`buildAdvancedWhere`, `buildProjetoFilter`, `buildDateFilter`,
`sanitize`, `ALLOWED_VALUES`, `escapeSqlString`, `QueryOptions`,
`AdvancedFilterParams`, `expressionCache`) + o import de `jsonata` (linha 1).

**Pré-requisito:** conferir que `app/api/bigquery/__tests__/route.test.ts` não
importa nenhuma função morta antes de deletar. Em cascata, viram mortos:
`schema-resolver.ts` `safeColumnName` + `resolveColumnOrThrow` — **mas
`resolveColumnOrThrow` tem teste + contrato fail-loud (ADR)**; decisão
deliberada, não mecânica.

### 2b. EvolutionSaldoChart + FaixaAtrasoChart — dead-reachable
`src/pages/explore/ui/blocks/EvolutionSaldoChart.tsx` (exporta os 2). Importado
só por `ChartBlock.tsx:16`, renderizado só nos ramos
`if (variant === 'evolucao-saldo')` / `'faixa-atraso'` (`ChartBlock.tsx:66-86`).
**Nenhum template emite `variant`** (verificado em `scripts/templates/*.mjs` +
`src/`). Os blocos `chart-evolucao-saldo`/`chart-faixa-atraso` usam
`chartType:'bar'` genérico, não o variant. **Pré-requisito:** remover os 2 ramos
+ o campo `variant?:` em `agents/types.ts:254` junto com os componentes.

### 2c. `DASHBOARD_TEMPLATES` array — duplicata superseded (~1.450 LOC)
`src/shared/config/dashboard-templates.ts:1606` — 40 templates com **metricIds
fantasma `dashboard.*` + `productRefs` errados**, substituídos pelo Firestore
(`scripts/templates/*.template.mjs`, namespace `play.*`). Runtime **não** lê o
array (`getTemplate()` lê Firestore). **Pré-requisitos antes de remover:**
1. Aposentar `scripts/seed-dashboard-templates.ts` (substituído por
   `seed-play-templates.ts`) **e corrigir `package.json`** (`seed:templates`
   ainda aponta pro legado).
2. Re-apontar `scripts/seed-galli-templates.ts` (único consumidor funcional do
   array — cria os `reports/` da galli) para `scripts/templates/*.mjs`.
3. **Preservar/realocar** os tipos exportados pelo módulo — 5 arquivos vivos
   importam: `TemplateQueryConfig`, `TemplateBlockMapping` (`useReports.ts`,
   `useReportData.ts`, `firestore/reports.ts`, `firestore/dashboard-templates.ts`)
   e `TemplateSegment` + `TEMPLATE_CATEGORIES` (`TemplateGallery.tsx`).
   Inclui as matrizes ilustrativas inline `LTV_STRESS_MATRIX_ROWS` (:181) e
   `REPASSE_DESCRICAO_GRUPOS_ROWS` (:192).

### 2d. `/api/bigquery` full removal
`app/api/bigquery/route.ts` serve só `filter_options` (dropdown de
data-base/projetos do `DataProvider`). Remover de vez exige migrar
`filter_options` para fonte semântica/Firestore. Enquanto isso, `queries.ts`
não pode sumir inteiro (mantém `queryFilterOptions`) nem `fetchBigQuery`.

---

## TIER 3 — Vivo mas stale (precisa substituto)

### `ALL_INDICATORS` — namespace legado `dashboard.*`, mas vivo no admin
`src/features/admin/model/types.ts:75` (83 entradas). Sombreia o catálogo
Firestore `metrics/{id}` e usa o namespace antigo, **mas** `GroupForm.tsx` +
`IndicatorCheckboxGrid.tsx` (admin de permissões por grupo) dependem dele.
**Risco alto** — precisa de lista de indicadores vinda do Firestore antes de
remover.

### `NAV_ITEMS` / `ANEXO_ITEMS` / `COVENANTS_NAV_ITEMS`
`src/shared/config/constants.ts` — aparentam 0 importadores (o roteamento
dinâmico `g/[groupId]` + grupos do Firestore os substituiu). Comentário do
próprio `NAV_ITEMS` diz "fallback estático". Confirmar que não há uso
fallback/dinâmico antes de remover.

### Scripts superseded / one-off já aplicados
**Superseded (alvo era o DB abandonado `liquid-dataviz-dev`):**
`seed-dataviz-dev.mjs`, `seed-play-product.mjs`, `migrate-semantic-layer.mjs`,
`migrate-to-dataviz-dev.mjs`, `flatten-client-bindings.mjs`,
`drop-datasource-credentialref.mjs`, `drop-entity-domain.mjs`.
**Superseded (legado, mas mira o DB vivo):** `seed-dashboard-templates.ts`
→ `seed-play-templates.ts` (⚠️ corrigir wiring `package.json` primeiro).
**One-off concluídos:** `cleanup-canonical-and-play-metrics.mjs`,
`migrate-dev-to-play-dataviz.mjs`.
**⚠️ One-off com risco de forward-fold** (verificar se o estado final já está
nos seeds canônicos antes de arquivar): `patch-sbpe-gaps.mjs` (cria
`play.rating_distribuicao`), `patch-covenants-snapshot-pin.mjs` (reescreve 11
recipes `covenants.*`).
**Gap `package.json`:** `seed:templates` aponta pro legado;
`seed-play-templates.ts` e `seed-galli-metrics.mjs` não têm entrada npm.

### Docs stale (arquivar)
| Doc | Status |
|---|---|
| `docs/roadmap-migracao-paginas-fixas-g9.md` | SUPERSEDED por `2026-06-25-paginas-data-driven-canvas-design.md` |
| `docs/superpowers/specs/2026-06-24-dashboard-rewire-batch-design.md` + plan | COMPLETED — entregável (`useDashboardMetrics`) foi deletado depois |
| `docs/superpowers/specs/2026-06-24-dashboard-escopo-data-design.md` + plan | COMPLETED (catálogo) |
| `docs/superpowers/specs/2026-06-24-catalogo-play-dashboard-design.md` + plan | COMPLETED (catálogo) |
| `docs/auditoria-arquitetura-camada-semantica.md` | PARCIAL — marcar G1/G7/G9-pages como fechados |
| ADR-0015 | ainda `status: Proposed` apesar de ser canon de-facto (só reportar — ADRs são imutáveis) |

---

## NÃO-TOCAR — parece morto na dashboard, está vivo no chat AI

`viewMode` / `compareEnabled` / `comparePeriod` (DataProvider + toggles em
`GlobalFilters`/`FilterPanel`): **ignorados por `useReportData`** (nenhum widget
de dashboard mostra período-contra-período), **mas** são serializados no corpo
do chat e consumidos pelos agentes — `viewMode` troca o modo de data do SQL
(`tool-context.ts:31`), `compareEnabled`/`comparePeriod` entram no
`descriptive-agent.ts:58-59`. Também são persistidos/restaurados por conversa.
Remover quebraria o comportamento do AI silenciosamente.

**Manter como config legítima:** `chart-theme.ts`, `recharts.ts`, `glossary.ts`,
`INDICATOR_SUGGESTIONS`, loader de personas de business-context, `RATING_COLORS`.

---

## Achado funcional (não é código morto — é lacuna)

**Sistema de permissão por indicador virou write-only.** O admin ainda atribui
acesso por indicador (`GroupForm`/`IndicatorCheckboxGrid`, vivo), mas o único
enforcer em runtime (`IndicatorGuard` via `useIndicatorPermissions`) ficou
desmontado após a deleção das páginas bespoke. **Permissões são gravadas mas
nunca verificadas** em nenhum indicador renderizado. Decidir: re-cablar o guard
no canvas, ou remover a feature inteira (UI admin + tipos) — não deixar no
meio-termo.
