# Design: Onboarding Vila Rosa + Template Covenants v2

- **Data**: 2026-07-20
- **Status**: Draft — aguardando revisão do usuário
- **Fontes**: `docs/bases/vila-rosa/MAPEAMENTO.md` (engenharia reversa do Looker),
  ADR-0006 (multi-tenancy), ADR-0013 (Firestore canônico), ADR-0015 (semantic layer),
  `adrs/multi-product-dataset-integration.md`, specs `2026-04-14-multi-report-dashboards`,
  `2026-06-15-admin-dashboard-templates`, `2026-06-25-paginas-data-driven-canvas`.
- **Em caso de divergência, a ADR vence** (CLAUDE.md).

## 1. Objetivo

1. Cadastrar o cliente **Vila Rosa** no DataViz com todos os dados funcionando
   (datasets `vila_rosa_monitor` + `vila_rosa_covenants` + bases auxiliares).
2. Criar o **template Covenants v2**: uma nova versão do relatório de covenants
   (o v1 é o conjunto de templates do Galli/Vivapark, criados só no Firestore),
   cobrindo as 13 páginas de conteúdo do Looker "Liquid Play - Covenants (v2.7)"
   com melhorias — principalmente **status de enquadramento por covenant**, ausente
   no Looker.
3. Registrar no planejamento as funcionalidades/tipos de visualização que faltam
   na plataforma para reproduzir o relatório (gaps).

**Fora de escopo**: ingestão Pluggy (acontece fora deste repo — os dados já aterrissam
no BigQuery); as páginas mock `covenants/configuracao/*`; comparação de período no
canvas (item B7 adiado por spec anterior).

## 2. Abordagens consideradas

### A) Engine data-driven existente (RECOMENDADA — escolhida)

Reusar 100% a pipeline `dataContracts → metrics → dashboardTemplates → productBindings`:
estender o contrato `liquid-play-plus`, criar métricas `covenants.*` novas, criar
templates categoria `Covenants`, e cadastrar o cliente via Admin/seed com
`schemaBindings`. Novos tipos de visualização entram como extensões do canvas
(`CanvasBlock`/`ChartBlock`).

- ✅ Alinhada às ADRs (nada hardcoded; onboarding sem deploy); reusa permissões,
  galeria, edição via IA; beneficia todos os clientes futuros de covenants.
- ✅ Precedente validado (Galli) — inclusive padrões conhecidos (snapshot-pin,
  `metricPageFilters`).
- ⚠️ Exige fechar gaps da engine (novos chart types, filtros de página, badges).

### B) Páginas fixas dedicadas (estilo legado)

Criar `app/(dashboard)/covenants-v2/*/page.tsx` + hooks dedicados + queries próprias.

- ✅ Controle visual total imediato.
- ❌ Contraria ADR-0013/0015 e a direção "páginas data-driven" (spec 2026-06-25);
  duplicaria fluxo de dados; nada reusável para o próximo cliente; rejeitada.

### C) Híbrida (engine + página especial só para o Extrato)

Como (A), mas com página fixa para o Extrato Detalhado (filtros de página complexos).

- ⚠️ Só se os filtros de página dinâmicos (gap G3) se mostrarem caros demais.
  Mantida como fallback consciente, não como plano.

## 3. Arquitetura da solução (abordagem A)

### 3.1 Dados (BigQuery)

- Datasets do cliente: `vila_rosa_monitor` (contratos, fluxo_caixa) e
  `vila_rosa_covenants` (covenants_calculo, certidoes, ficha_cadastral,
  mapa_de_vendas, evolucao_obra, evolucao_plano_empresario, transacoes) —
  **confirmar nomes/projeto reais no console** (schemas em `docs/bases/vila-rosa/BigQuery/`).
- **Bases auxiliares (novo)**: ingerir os 2 CSVs do Sheets como tabelas de referência
  compartilhadas `liquid_aux.ba_bancos` e `liquid_aux.ba_pluggy_categorias`
  (dataset compartilhado, não por cliente: são dados públicos/genéricos — COMPE e
  taxonomia Pluggy — e servirão a qualquer cliente com open banking). Script de
  ingestão versionado em `scripts/`.
- Blends do Looker viram **métricas `derived`** (joins declarados na coleção
  `relations` + recipes SQL), seguindo os 5 joins do MAPEAMENTO §3, com os cuidados
  do §2.1 (semântica de `projeto`, cast de `unidade`, snapshot-pin, `UPPER(status_contrato)`).

### 3.2 Camada semântica (Firestore)

- **Data contract**: estender `liquid-play-plus` (aditivo, MVP `canonical` — ADR-0015):
  - novas entidades: `ficha_cadastral`, `mapa_de_vendas`; split de `evolucao` em
    `evolucao_obra` e `evolucao_plano_empresario` (mantendo `evolucao` legada para o
    Galli até migração);
  - novos atributos em `covenants_calculo` (vgv, total_de_unidades, total_m2,
    total_valor_vendido, valor_medio_m2, valor_estoque) e `certidoes`
    (data_validade, status).
  - Compatibilidade: bindings do Galli seguem válidos — atributos sem coluna mapeiam
    `null` (coverage soft, refs de catálogo são soft-warning; só resolveColumn de
    dados é fail-loud).
- **Métricas**: catálogo `covenants.*` complementar ao existente (~25-35 métricas
  novas conforme inventário do MAPEAMENTO §6), globais (`ownerClientId: null`) para
  reuso; snapshot-pin nas recipes de KPI sobre tabelas snapshot.
- **Produto**: `products/liquid-play-plus` ganha os novos `metricRefs`.
  (Retificado na execução: o Firestore vivo mostrou que `products/covenants`
  contém um domínio distinto — covenants de emissão/bonds, `total_emissoes`,
  `breaches_ativos` — e que o cliente covenants real, Galli, binda
  `liquid-play`/`liquid-play-plus`. Vila Rosa espelha o Galli.)
- **Cliente**: `clients/vila-rosa` com `productBindings` para `credit`
  (→ `vila_rosa_monitor`) e `covenants` (→ `vila_rosa_covenants`), `schemaBindings`
  via `/api/schema-detect/v2` + revisão manual, `tableBindings` onde tabela ≠ entidade.
- **Convenção de slug**: doc `vila-rosa` (kebab, padrão Slug); token BQML `vila_rosa`
  (mapeamento explícito quando BQML for habilitado — hífen é inválido em dataset BQ
  e no `MODEL_REF_RE`).

### 3.3 Template Covenants v2 (Firestore `dashboardTemplates`)

- **1 template por página do Looker** (13), categoria `Covenants`,
  `productRefs: ['liquid-play-plus']` (ver retificação em §3.2), nomeados `covenants-v2-*`
  (ex.: `covenants-v2-visao-executiva`, `covenants-v2-empreendimento`, …).
- **Seeds versionados no repo** (`scripts/templates/covenants-v2-*.template.mjs`) —
  corrige o gap do v1 (templates do Galli existem só no Firestore, sem versionamento).
- **Estrutura de navegação**: grupo "Covenants" no cliente com 13 reports importados
  na ordem do Looker (MAPEAMENTO §1).
- **Melhorias v2 sobre o Looker** (o "outra versão" do pedido):
  1. **Status de enquadramento**: blocos `gauge` (threshold verde/âmbar/vermelho) para
     os covenants monitorados (Índice Recebível, Certidões Válidas %, Inadimplência %,
     Over 90%, Desvio de Obra, Dívida vs Limite do Plano Empresário) + `alertThreshold`
     nos KPIs + `referenceLines` (limites) nos gráficos de série.
  2. Badge semântico Válida/Inválida na tabela de certidões.
  3. Correções dos bugs do Looker (MAPEAMENTO §8): rótulo "Saídas", nome de banco via
     join (não CASE quebrado).
  4. `filters.metricPageFilters` apontando a entidade correta por página
     (ex.: `covenants_calculo.data_base_report`), replicando deliberadamente quais
     gráficos são "sempre histórico".
- **Thresholds**: nesta fase, valores estáticos por template (blocos `gauge`/`alertThreshold`),
  documentados como premissa; parametrização por cliente é evolução futura (ver §5 G7).

### 3.4 Permissões e acesso

- `users/*.clientAccess += {clientId: 'vila-rosa'}` (sem isso: 403 fail-closed).
- Novas métricas entram no `metric-route-map.ts` (gating G1 por rota).
- Rotas de navegação vêm de grupos/reports (sidebar dinâmica) — sem `page.tsx` novo.

## 4. Correções necessárias no código (bloqueadoras)

1. **`/api/filter-options`** (`app/api/filter-options/route.ts:17-29`):
   `findClientByDataset` só lê campos legados `dataset`/`datasets[]` — cliente criado
   apenas com `productBindings` toma 403 (não-admin) e fica sem filtros. Corrigir a rota
   para resolver via `productBindings[].datasets[]` (e manter fallback legado).
2. **Extensões do canvas** (ver gaps §5): novos tipos exigem mudanças em
   `src/shared/config/agents/types.ts`, `CanvasBlockRenderer`/`blocks/*` e no schema
   de template (aditivas, retrocompatíveis).

## 5. Gaps de funcionalidade (novas capacidades da plataforma)

| # | Gap | Necessário para | Proposta |
|---|---|---|---|
| G1 | **Waterfall chart** | Extrato Resumido (pág. 2) | novo `chartType: 'waterfall'` no `ChartBlock` (Recharts Bar com acumulado invisível) |
| G2 | **Barra horizontal (inclusive 100%)** | Inadimplência (pág. 10) | prop `layout: 'horizontal'\|'vertical'` no `ChartBlock` (Recharts `layout="vertical"`) |
| G3 | **Filtros de página por atributo (dropdowns)** | Banco/Categoria/Tipo (págs. 12/14) | estender `metricPageFilters` kind `'in'` com UI de dropdown no report (opções via query distinct) |
| G4 | **Badge/formatação condicional em tabela** | Certidões (pág. 13), Rating (pág. 6) | novo `format: 'status-badge'` em `TableBlock.columns` + mapa valor→cor |
| G5 | **Drill-through entre reports com filtros** | pág. 12 → pág. 14 | bloco/CTA com link para report + propagação de `pageFilters` via querystring |
| G6 | **Barras espelhadas (±)** | Entradas & Saídas | provavelmente já suportado (bar com valores negativos); validar e ajustar eixo/cores por sinal |
| G7 | **Registro de thresholds de covenant por cliente** | status enquadrado/desenquadrado | fase 1: estático no template; evolução: coleção `covenantThresholds` por binding (fora deste ciclo) |
| G8 | **Pivot 2 dimensões em tabela** | Recebíveis (pág. 7) | contornável com groupBy composto (dim concatenada) na recipe; pivot real fica como melhoria futura |

Nada disso quebra templates existentes — todas as mudanças de schema são aditivas.

## 6. Fluxo de dados resultante (inalterado na essência)

`Bloco (metricId) → useReportData → POST /api/metrics/batch → executeMetric
(tenant + rota + coverage) → resolveMetric (recipe → SQL) → getBigQueryClientFor →
BigQuery`. Erro por métrica é isolado (rows vazias + console.error) — na validação
final, conferir página a página contra os valores do Looker (MAPEAMENTO §6 traz os
valores de mai/2026 como massa de verificação).

## 7. Testes e validação

- Unit: novos chart types/formats do canvas (render + edge cases), fix do
  filter-options (formato novo + legado), resolvers de recipes derived (joins).
- Seeds idempotentes (validação Zod antes de gravar, como `seed-play-templates.ts`).
- **Validação numérica**: para cada uma das 13 páginas, comparar os valores
  renderizados com os valores de referência do Looker (mai/2026) registrados no
  MAPEAMENTO §6 — critério de aceite do onboarding.
- Flakiness conhecida da suíte (baseline ~6 falhas em full-run): rodar testes novos
  em isolamento para distinguir regressão.

## 8. Decisões tomadas (premissas — revisar)

| Decisão | Escolha | Alternativa descartada |
|---|---|---|
| Arquitetura | Engine data-driven (A) | Páginas fixas (B) |
| Contrato | Estender `liquid-play-plus` | Contrato novo v2 (fragmentaria o catálogo) |
| Slug | `vila-rosa` + token BQML `vila_rosa` | `vilarosa` |
| CSVs auxiliares | Dataset compartilhado `liquid_aux` | tabelas por cliente (duplicação) |
| Escopo do v2 | Paridade Looker + status de enquadramento + correções | réplica 1:1 do Looker |
| Thresholds | Estáticos no template (fase 1) | coleção por cliente (G7, futuro) |
| Faixas de atraso | `faixa_atraso_1` e `_2` como dimensões distintas | unificação |

## 9. Questões em aberto (não bloqueiam o plano)

1. Nome real do projeto GCP/datasets do Vila Rosa (confirmar no console antes da Fase 1).
2. Valores contratuais dos thresholds de covenant (limite do Índice Recebível,
   inadimplência máxima etc.) — obter do contrato com o Inter; até lá, gauges entram
   com thresholds ilustrativos marcados como "a confirmar".
3. Perfil de business-context da IA para Vila Rosa (recomendado, não bloqueante).
4. Migração do Galli para as entidades split (`evolucao_obra`/`evolucao_plano_empresario`)
   — fora deste ciclo.
