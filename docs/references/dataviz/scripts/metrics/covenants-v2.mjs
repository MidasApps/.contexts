/**
 * Catálogo de métricas `covenants.*` v2 — Vila Rosa (Task 11).
 *
 * Fonte de verdade: .superpowers/sdd/task-11-brief.md (inventário) +
 * docs/bases/vila-rosa/MAPEAMENTO.md (regras de negócio, refs §4/§5, valores
 * de validação §6/§9). Schema Zod: src/shared/schemas/metric.ts. Sintaxe de
 * placeholders confirmada em src/shared/lib/metrics/resolve-metric.ts:374-446.
 *
 * ── Decisões de recipe kind (documentadas no report — ver task-11-report.md
 *    para as tabelas de validação SQL que embasam cada uma) ──
 *
 * 1. `SqlRecipe.template` é o campo real (não `sql`, como o exemplo do brief
 *    sugeria) — confirmado em src/shared/schemas/metric.ts:119-128.
 *
 * 2. NENHUMA métrica deste catálogo usa `kind: 'derived'`. Os 3 itens do
 *    inventário rotulados "derived fluxo×contratos" (recebiveis_por_inadimplencia,
 *    fluxo_por_faixa_serie, mapa_vendas_table) juntam `fluxo_caixa` e `contratos`
 *    — AMBAS entidades do MESMO contrato (`liquid-play`), logo cobertas pelo
 *    MESMO ClientDatasetBinding. Isso torna `kind: 'sql'` viável (JOIN literal
 *    via `{entity}`/`{entity.attr}`, com alias de tabela manual no template) e
 *    estritamente MELHOR que `kind: 'derived'` aqui, porque o resolver de
 *    `derived` (resolveDerivedMetric, resolve-metric.ts:541-564) monta o JOIN
 *    apenas como `col(leftRef) = col(rightRef)` — SEM qualificar por tabela.
 *    Prototipei `covenants.recebiveis_por_inadimplencia` como `derived`
 *    primeiro e RODEI a SQL exata que o resolver geraria contra o BigQuery
 *    real: `Column name id_contrato is ambiguous` — falha dura, não uma
 *    lacuna sutil, porque `fluxo_caixa` e `contratos` compartilham várias
 *    colunas (id_contrato, data_base_report, status_contrato, empresa,
 *    projeto). Além disso, mesmo sem a ambiguidade, `derived` não tem hook
 *    para (a) igualdade adicional em `data_base_report` (exigida pela própria
 *    relation `fluxo-caixa-contratos`) nem (b) subquery de snapshot-pin
 *    `MAX(data_base_report)` (DerivedFilter só aceita attribute op
 *    literal/page-filter). A versão `sql` equivalente foi validada contra o
 *    BigQuery real e reproduz EXATAMENTE os valores de referência do
 *    MAPEAMENTO §6 (Pós-chaves 70.746.923,26 / Pré-chaves 15.015.218,05,
 *    12 linhas tipo×faixa). Achado registrado no report para o ticket —
 *    afeta qualquer futura métrica `derived` que junte entidades com nomes
 *    de coluna repetidos (comum neste domínio: id_contrato/data_base_report/
 *    empresa/projeto/status_contrato aparecem em quase todas as entidades).
 *    O único join genuinamente cross-contract do domínio (`contratos` ×
 *    `mapa_de_vendas`, via relation `contratos-mapa-de-vendas`, que exigiria
 *    `derived` de verdade + CAST(unidade AS STRING) — outra lacuna, já que
 *    `derived` também não tem hook de CAST no JOIN) **não é usado por
 *    nenhuma métrica deste inventário**: os KPIs de permuta/garantia
 *    (`emp_permutas_*`, `emp_garantias_*`) são calculados só sobre
 *    `mapa_de_vendas` (filtros `permuta`/`pavimento`), sem precisar de
 *    `contratos`. Confirmado por query real (ver report).
 *
 * 3. Snapshot-pin (convenção do projeto, introduzida pelo patch one-off
 *    patch-covenants-snapshot-pin.mjs, já removido): `WHERE {entity.data_base_report}
 *    = (SELECT MAX({entity.data_base_report}) FROM {entity} WHERE {filter.ate:entity.data_base_report})`. Só expressável
 *    em `kind: 'sql'` (subquery). `kind: 'aggregation'` é reservado para (a)
 *    séries temporais completas (sem pin — o próprio agrupamento por mês é a
 *    série) e (b) filtros literais/`is_not_null` sem subquery.
 *
 * 4. `UPPER(status_contrato)` sempre (dados com caixa inconsistente,
 *    MAPEAMENTO §4). Percentuais como razão 0–1 (sem ×100 — fronteira de
 *    apresentação fica no front, useReportData.ts:33-34). `transacoes.valor`
 *    já vem assinado conforme `tipo` (confirmado nos 12 registros reais:
 *    CREDIT positivo, DEBIT negativo) — uso `SUM(ABS(valor))` só onde quero
 *    magnitude (barras por categoria) e `valor` cru onde o sinal importa
 *    (waterfall, extrato, série ±).
 *
 * 5. Tabelas aux (`liquid_aux.ba_bancos`, `liquid_aux.ba_pluggy_categorias`)
 *    são literais `` `${BQ_PROJECT}.dataviz_aux.*` `` — fora de qualquer Data
 *    Contract (decisão do plano/Task 10), não resolvem via binding.
 *
 * 6. `covenants.empreendimento_kpis_*`, `covenants.obra_kpis` e
 *    `covenants.contratos_por_status` foram decompostos em ids individuais
 *    por decisão do controller (ver task-11-brief.md) — listados na íntegra
 *    no report.
 *
 * 7. `shape` + `outputColumns` (campos novos de `MetricDoc`): declaram a FORMA
 *    do resultado e os nomes das colunas na ordem do SELECT. Foram derivados
 *    lendo o `template` de cada métrica, um a um — não pelo nome nem pelo
 *    `type`. São obrigatórios na prática (o teste
 *    `scripts/metrics/__tests__/covenants-v2-shapes.test.ts` falha se faltarem
 *    ou se um nome declarado não existir como `AS <alias>` no template),
 *    embora opcionais no schema para não invalidar documento antigo.
 *    Critério: 1 linha só com `value` ⇒ `scalar`; `{bucket, value}` ⇒
 *    `timeseries`; `{bucket, n1, n2…}` com medidas distintas ⇒
 *    `timeseries_multi`; `{bucket, cat1…catN}` com categorias da MESMA
 *    dimensão ⇒ `timeseries_pivot`; `{dimensao, value}` ⇒ `breakdown`;
 *    N colunas para listagem ⇒ `rows`. As 3 métricas em que o SQL não decide
 *    sozinho carregam comentário `AMBÍGUA` explicando a escolha.
 */

const PLAY = 'liquid-play';
const PP = 'liquid-play-plus';
const BQ_PROJECT = process.env.BIGQUERY_PROJECT_ID || 'YOUR_BQ_PROJECT';
const playRef = (e, a) => `${PLAY}.${e}.${a}`;
const ppRef = (e, a) => `${PP}.${e}.${a}`;

function sql({ id, label, description, type, unit = null, shape, outputColumns, percentPointColumns, template, requires }) {
  return {
    id, label, description: description ?? null, type, unit,
    shape, outputColumns,
    // Colunas já em pontos percentuais (ADR-0032) — só quando há alguma.
    ...(percentPointColumns ? { percentPointColumns } : {}),
    requires,
    recipe: { kind: 'sql', template: template.trim() },
  };
}

function agg({
  id, label, description, type = 'kpi', unit = null, shape, outputColumns,
  primaryEntity, aggregation, valueAttribute,
  timeAttribute, timeGrain, groupByAttributes = [], filters = [],
  orderBy, limit, requires,
}) {
  return {
    id, label, description: description ?? null, type, unit,
    shape, outputColumns,
    requires,
    recipe: {
      kind: 'aggregation',
      primaryEntity,
      aggregation,
      ...(valueAttribute ? { valueAttribute } : {}),
      ...(timeAttribute ? { timeAttribute } : {}),
      ...(timeGrain ? { timeGrain } : {}),
      groupByAttributes,
      filters,
      ...(orderBy ? { orderBy } : {}),
      ...(limit ? { limit } : {}),
    },
  };
}

/**
 * ─── O pin é DENTRO do período, não do banco ───
 *
 * Estas métricas são de ESTOQUE (saldo devedor, contratos ativos, índice de
 * covenant): o dataset é um retrato mensal completo da carteira, e a resposta
 * certa é a de UM mês — somar três meses contaria o mesmo contrato três vezes.
 *
 * O que estava errado era QUAL mês. O pin era `MAX(data_base_report)` sobre a
 * tabela inteira: o último mês do BANCO. Então escolher junho no filtro não
 * mexia em nada — o número continuava sendo o de julho. Agora o `MAX` é
 * calculado dentro da faixa escolhida, que é o que "último mês" quer dizer
 * para quem olha a tela: o último mês DO PERÍODO.
 *
 * Com o período inteiro (o default), `MAX` dentro da faixa é o `MAX` de tudo —
 * o número da primeira carga não muda. A diferença aparece exatamente quando
 * alguém recorta, que é quando ela deve aparecer.
 *
 * ⚠️ O modo "Acumulado" continua sem efeito AQUI, de propósito: acumular
 * estoque não é grandeza. Ele vale para as métricas de fluxo (recebimentos,
 * entradas e saídas, extrato), onde somar meses é a leitura certa.
 */
function snapshotKpi(entity, expr) {
  return `
    SELECT ${expr} AS value
    FROM {${entity}}
    WHERE {${entity}.data_base_report} = (
      SELECT MAX({${entity}.data_base_report}) FROM {${entity}}
      WHERE {filter.ate:${entity}.data_base_report}
    )
  `.trim();
}

/** Snapshot-pin genérico p/ SELECTs com mais de uma coluna de saída. */
function pinClause(entity) {
  return `{${entity}.data_base_report} = (SELECT MAX({${entity}.data_base_report}) FROM {${entity}} WHERE {filter.ate:${entity}.data_base_report})`;
}

export const metrics = [
  // ═══════════════════════════════════════════════════════════════════
  // Hero / Plano Empresário — validado: indice_recebivel=12,06 (MATCH),
  // indice_recebivel_estoque=14,64 (MATCH), certidoes_validas_pct=83,33%
  // (MATCH), tipo_recebivel/faixa_atraso_1 strings confirmados por query.
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.indice_recebivel',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Índice de Recebível',
    description: 'Recebíveis pós-chaves sobre a dívida/saldo de referência (snapshot atual).',
    type: 'kpi', unit: '%',
    template: snapshotKpi('covenants_calculo', 'AVG({covenants_calculo.indice_recebivel})'),
    requires: [ppRef('covenants_calculo', 'indice_recebivel'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.indice_recebivel_estoque',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Índice Recebível/Estoque',
    description: 'Recebíveis pós-chaves + estoque sobre a dívida/saldo de referência (snapshot atual).',
    type: 'kpi', unit: '%',
    template: snapshotKpi('covenants_calculo', 'AVG({covenants_calculo.indice_recebivel_estoque})'),
    requires: [ppRef('covenants_calculo', 'indice_recebivel_estoque'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.certidoes_validas_pct',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Percentual de Certidões Válidas',
    description: 'Razão entre certidões com status Válida e total de certidões (snapshot atual).',
    type: 'kpi', unit: '%',
    template: `
      SELECT SAFE_DIVIDE(COUNTIF({certidoes.status} = 'Válida'), COUNT({certidoes.certidao})) AS value
      FROM {certidoes}
      WHERE ${pinClause('certidoes')}
    `,
    requires: [ppRef('certidoes', 'status'), ppRef('certidoes', 'certidao'), ppRef('certidoes', 'data_base_report')],
  }),
  sql({
    id: 'covenants.certidoes_data_consulta',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Data da Última Consulta de Certidões',
    description: 'Data mais recente de consulta às certidões no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT MAX({certidoes.data_consulta}) AS value
      FROM {certidoes}
      WHERE ${pinClause('certidoes')}
    `,
    requires: [ppRef('certidoes', 'data_consulta'), ppRef('certidoes', 'data_base_report')],
  }),
  sql({
    id: 'covenants.certidoes_table',
    shape: 'rows',
    outputColumns: ['certidao_orgao', 'certidao', 'tipo', 'status'],
    label: 'Situação das Certidões',
    description: 'Certidões do snapshot atual: órgão, tipo e status.',
    type: 'table',
    template: `
      SELECT {certidoes.certidao_orgao} AS certidao_orgao,
             {certidoes.certidao} AS certidao,
             {certidoes.tipo} AS tipo,
             {certidoes.status} AS status
      FROM {certidoes}
      WHERE ${pinClause('certidoes')}
      ORDER BY {certidoes.certidao_orgao}
    `,
    requires: [
      ppRef('certidoes', 'certidao_orgao'), ppRef('certidoes', 'certidao'),
      ppRef('certidoes', 'tipo'), ppRef('certidoes', 'status'), ppRef('certidoes', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.plano_empresario_valor',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Plano Empresário — Valor Contratado',
    description: 'Valor total contratado do plano empresário (dimensão, sem snapshot).',
    type: 'kpi', unit: 'BRL',
    template: `SELECT ANY_VALUE({ficha_cadastral.plano_empresario_valor}) AS value FROM {ficha_cadastral}`,
    requires: [ppRef('ficha_cadastral', 'plano_empresario_valor')],
  }),
  sql({
    id: 'covenants.plano_empresario_contratado',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Plano Empresário — Contratado (atual)',
    description: 'Valor contratado/liberado do plano empresário até o snapshot atual.',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT ANY_VALUE({evolucao_plano_empresario.plano_empresario_contratado}) AS value
      FROM {evolucao_plano_empresario}
      WHERE ${pinClause('evolucao_plano_empresario')}
    `,
    requires: [ppRef('evolucao_plano_empresario', 'plano_empresario_contratado'), ppRef('evolucao_plano_empresario', 'data_base_report')],
  }),
  sql({
    id: 'covenants.plano_empresario_divida',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Plano Empresário — Dívida Atual',
    description: 'Saldo devedor atual do plano empresário no snapshot atual.',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT ANY_VALUE({evolucao_plano_empresario.plano_empresario_divida_atual}) AS value
      FROM {evolucao_plano_empresario}
      WHERE ${pinClause('evolucao_plano_empresario')}
    `,
    requires: [ppRef('evolucao_plano_empresario', 'plano_empresario_divida_atual'), ppRef('evolucao_plano_empresario', 'data_base_report')],
  }),
  /*
   * Uso do plano: dívida sobre o valor do plano, somados por empreendimento na
   * mesma foto. O medidor de dívida comparava o saldo de UM projeto
   * (`ANY_VALUE`) com um limite fixo de R$ 45 mi — a soma dos planos dos três
   * empreendimentos sintéticos — e mostrava folga onde a dívida já passava o
   * plano do próprio projeto. Razão de somas vale para um projeto ou vários.
   */
  sql({
    id: 'covenants.plano_empresario_uso_pct',
    shape: 'scalar',
    outputColumns: ['value'],
    percentPointColumns: ['value'],
    label: 'Plano Empresário — Dívida sobre o valor do plano',
    description: 'Saldo devedor somado dos empreendimentos sobre o valor somado dos seus planos, na foto atual (%). 100% = plano esgotado.',
    type: 'kpi', unit: '%',
    template: `
      SELECT 100 * SAFE_DIVIDE(SUM(e.{evolucao_plano_empresario.plano_empresario_divida_atual}), SUM(f.{ficha_cadastral.plano_empresario_valor})) AS value
      FROM {evolucao_plano_empresario} e
      JOIN {ficha_cadastral} f ON f.{ficha_cadastral.projeto} = e.{evolucao_plano_empresario.projeto}
      WHERE e.${pinClause('evolucao_plano_empresario')}
    `,
    requires: [
      ppRef('evolucao_plano_empresario', 'plano_empresario_divida_atual'), ppRef('evolucao_plano_empresario', 'projeto'),
      ppRef('evolucao_plano_empresario', 'data_base_report'),
      ppRef('ficha_cadastral', 'plano_empresario_valor'), ppRef('ficha_cadastral', 'projeto'),
    ],
  }),
  sql({
    id: 'covenants.plano_empresario_serie',
    shape: 'timeseries_multi',
    outputColumns: ['bucket', 'contratado', 'divida_atual'],
    label: 'Evolução do Plano Empresário',
    description: 'Série mensal: valor contratado × dívida atual do plano empresário.',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({evolucao_plano_empresario.data_base_report}, MONTH) AS bucket,
             AVG({evolucao_plano_empresario.plano_empresario_contratado}) AS contratado,
             AVG({evolucao_plano_empresario.plano_empresario_divida_atual}) AS divida_atual
      FROM {evolucao_plano_empresario}
      WHERE {filter.date_range:evolucao_plano_empresario.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      ppRef('evolucao_plano_empresario', 'data_base_report'),
      ppRef('evolucao_plano_empresario', 'plano_empresario_contratado'),
      ppRef('evolucao_plano_empresario', 'plano_empresario_divida_atual'),
    ],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Contratos / Status — validado: total=183, ativos=158, quitados=6,
  // distratados=19 (=16 DISTRATADO + 3 OUTRO) — MATCH exato c/ MAPEAMENTO
  // pág.2 §7. `contratos_por_status` NÃO existe (decisão do controller).
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.contratos_total',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Total de Contratos',
    description: 'Contagem distinta de contratos no snapshot atual, qualquer status.',
    type: 'kpi',
    template: `
      SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.contratos_ativos',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Contratos Ativos',
    description: 'Contagem distinta de contratos com status_contrato = ATIVO no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND UPPER({contratos.status_contrato}) = 'ATIVO'
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'status_contrato'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.contratos_quitados',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Contratos Quitados',
    description: 'Contagem distinta de contratos com status_contrato = QUITADO no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND UPPER({contratos.status_contrato}) = 'QUITADO'
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'status_contrato'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.contratos_distratados',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Contratos Distratados',
    description: 'Contagem distinta de contratos com status_contrato IN (DISTRATADO, OUTRO) no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND UPPER({contratos.status_contrato}) IN ('DISTRATADO', 'OUTRO')
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'status_contrato'), playRef('contratos', 'data_base_report')],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Inadimplência / Risco — validado: inadimplencia_pct=0,66% / over90_pct
  // =0,57% (MATCH exato). faixa_atraso_2 (5 valores) e rating_liquid (A-H)
  // confirmados por query real. rating_serie: soma do último mês = 158 =
  // contratos ativos (consistente).
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.inadimplencia_pct',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Inadimplência %',
    description: 'Razão entre valor em atraso e saldo devedor no snapshot atual.',
    type: 'kpi', unit: '%',
    template: `
      SELECT SAFE_DIVIDE(SUM({contratos.valor_atraso}), SUM({contratos.saldo_devedor})) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
    `,
    requires: [playRef('contratos', 'valor_atraso'), playRef('contratos', 'saldo_devedor'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.inadimplencia_serie',
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    label: 'Inadimplência % — Série',
    description: 'Série mensal da razão entre valor em atraso e saldo devedor.',
    type: 'chart', unit: '%',
    template: `
      SELECT DATE_TRUNC({contratos.data_base_report}, MONTH) AS bucket,
             SAFE_DIVIDE(SUM({contratos.valor_atraso}), SUM({contratos.saldo_devedor})) AS value
      FROM {contratos}
      WHERE {filter.date_range:contratos.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [playRef('contratos', 'valor_atraso'), playRef('contratos', 'saldo_devedor'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.over90_pct',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Over 90 %',
    description: 'Razão entre valor em atraso acima de 90 dias e saldo devedor no snapshot atual.',
    type: 'kpi', unit: '%',
    template: `
      SELECT SAFE_DIVIDE(SUM({contratos.valor_over_90}), SUM({contratos.saldo_devedor})) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
    `,
    requires: [playRef('contratos', 'valor_over_90'), playRef('contratos', 'saldo_devedor'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.faixa_atraso_table',
    shape: 'rows',
    outputColumns: ['faixa_atraso_1', 'contratos', 'saldo_devedor', 'valor_atraso', 'inadimplencia_pct'],
    label: 'Faixa de Atraso — Tabela',
    description: 'Contratos, saldo devedor, valor em atraso e inadimplência % por faixa_atraso_1 (snapshot atual).',
    type: 'table',
    template: `
      SELECT {contratos.faixa_atraso_1} AS faixa_atraso_1,
             COUNT(DISTINCT {contratos.id_contrato}) AS contratos,
             SUM({contratos.saldo_devedor}) AS saldo_devedor,
             SUM({contratos.valor_atraso}) AS valor_atraso,
             SAFE_DIVIDE(SUM({contratos.valor_atraso}), SUM({contratos.saldo_devedor})) AS inadimplencia_pct
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND {contratos.faixa_atraso_1} IS NOT NULL
      GROUP BY faixa_atraso_1
      ORDER BY faixa_atraso_1
    `,
    requires: [
      playRef('contratos', 'faixa_atraso_1'), playRef('contratos', 'id_contrato'),
      playRef('contratos', 'saldo_devedor'), playRef('contratos', 'valor_atraso'), playRef('contratos', 'data_base_report'),
    ],
  }),
  // ═══════════════════════════════════════════════════════════════════
  // FIX (Task 13 pós-review): os 3 metrics de faixa_atraso_2 + rating_serie
  // eram `kind:'aggregation'` com `groupByAttributes` — `resolveAggregationRecipe`
  // (resolve-metric.ts:301-378) NÃO pivota, produz formato LONGO
  // (`{bucket, <dimensão>, value}`, uma linha por mês×categoria), incompatível
  // com stacked-bar (que precisa de uma coluna por série). Reescritos como
  // `kind:'sql'` com pivot manual (`SUM(IF(dim=X, ..., 0))`/`COUNT(DISTINCT
  // IF(...))` por bucket), mesmo padrão de `play.faixa_atraso_serie_contratos`
  // (play-elegibilidade.mjs:125-170). Valores literais de faixa_atraso_2 e
  // rating_liquid confirmados por query real contra
  // `bq-data-wh.vila_rosa_monitor.contratos` (task-13-report.md). Aliases
  // snake_case estáveis (autorizados pelo controller): rating a–h, faixa_atraso_2
  // sem_atraso/f1a30/f31a60/f61a90/f90mais — DEVEM casar com os dataKeys dos
  // templates `covenants-v2-perfil-carteira`/`covenants-v2-inadimplencia`.
  // Nenhum filtro de date_range foi adicionado (os originais `agg()` também
  // não tinham — série sempre histórico completo, comportamento preservado).
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.faixa_atraso2_contratos_serie',
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'],
    label: 'Nº de Contratos por Faixa de Atraso — Série',
    description: 'CTD de contratos por mês, pivotado por faixa_atraso_2 (5 buckets, colunas sem_atraso/f1a30/f31a60/f61a90/f90mais), excluindo faixa_atraso_1 nula.',
    type: 'chart',
    template: `
      SELECT DATE_TRUNC({contratos.data_base_report}, MONTH) AS bucket,
             COUNT(DISTINCT IF({contratos.faixa_atraso_2} = '00. Sem atraso', {contratos.id_contrato}, NULL)) AS sem_atraso,
             COUNT(DISTINCT IF({contratos.faixa_atraso_2} = '01. 1 - 30 dias', {contratos.id_contrato}, NULL)) AS f1a30,
             COUNT(DISTINCT IF({contratos.faixa_atraso_2} = '02. 31 - 60 dias', {contratos.id_contrato}, NULL)) AS f31a60,
             COUNT(DISTINCT IF({contratos.faixa_atraso_2} = '03. 61 - 90 dias', {contratos.id_contrato}, NULL)) AS f61a90,
             COUNT(DISTINCT IF({contratos.faixa_atraso_2} = '04. Acima de 90 dias', {contratos.id_contrato}, NULL)) AS f90mais
      FROM {contratos}
      WHERE {contratos.faixa_atraso_1} IS NOT NULL
        AND {filter.date_range:contratos.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('contratos', 'id_contrato'), playRef('contratos', 'faixa_atraso_2'),
      playRef('contratos', 'data_base_report'), playRef('contratos', 'faixa_atraso_1'),
    ],
  }),
  sql({
    id: 'covenants.faixa_atraso2_valor_serie',
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'],
    label: 'Valor do Atraso por Faixa de Atraso — Série',
    description: 'SUM(valor_atraso) por mês, pivotado por faixa_atraso_2 (5 buckets, colunas sem_atraso/f1a30/f31a60/f61a90/f90mais), excluindo faixa_atraso_1 nula.',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({contratos.data_base_report}, MONTH) AS bucket,
             SUM(IF({contratos.faixa_atraso_2} = '00. Sem atraso', {contratos.valor_atraso}, 0)) AS sem_atraso,
             SUM(IF({contratos.faixa_atraso_2} = '01. 1 - 30 dias', {contratos.valor_atraso}, 0)) AS f1a30,
             SUM(IF({contratos.faixa_atraso_2} = '02. 31 - 60 dias', {contratos.valor_atraso}, 0)) AS f31a60,
             SUM(IF({contratos.faixa_atraso_2} = '03. 61 - 90 dias', {contratos.valor_atraso}, 0)) AS f61a90,
             SUM(IF({contratos.faixa_atraso_2} = '04. Acima de 90 dias', {contratos.valor_atraso}, 0)) AS f90mais
      FROM {contratos}
      WHERE {contratos.faixa_atraso_1} IS NOT NULL
        AND {filter.date_range:contratos.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('contratos', 'valor_atraso'), playRef('contratos', 'faixa_atraso_2'),
      playRef('contratos', 'data_base_report'), playRef('contratos', 'faixa_atraso_1'),
    ],
  }),
  sql({
    id: 'covenants.faixa_atraso2_saldo_serie',
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'],
    label: 'Saldo Devedor por Faixa de Atraso — Série',
    description: 'SUM(saldo_devedor) por mês, pivotado por faixa_atraso_2 (5 buckets, colunas sem_atraso/f1a30/f31a60/f61a90/f90mais), excluindo faixa_atraso_1 nula.',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({contratos.data_base_report}, MONTH) AS bucket,
             SUM(IF({contratos.faixa_atraso_2} = '00. Sem atraso', {contratos.saldo_devedor}, 0)) AS sem_atraso,
             SUM(IF({contratos.faixa_atraso_2} = '01. 1 - 30 dias', {contratos.saldo_devedor}, 0)) AS f1a30,
             SUM(IF({contratos.faixa_atraso_2} = '02. 31 - 60 dias', {contratos.saldo_devedor}, 0)) AS f31a60,
             SUM(IF({contratos.faixa_atraso_2} = '03. 61 - 90 dias', {contratos.saldo_devedor}, 0)) AS f61a90,
             SUM(IF({contratos.faixa_atraso_2} = '04. Acima de 90 dias', {contratos.saldo_devedor}, 0)) AS f90mais
      FROM {contratos}
      WHERE {contratos.faixa_atraso_1} IS NOT NULL
        AND {filter.date_range:contratos.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('contratos', 'saldo_devedor'), playRef('contratos', 'faixa_atraso_2'),
      playRef('contratos', 'data_base_report'), playRef('contratos', 'faixa_atraso_1'),
    ],
  }),
  sql({
    id: 'covenants.rating_serie',
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    label: 'Distribuição de Contratos por Rating',
    description: 'CTD de contratos por mês, pivotado por rating_liquid (A-H, colunas a-h), excluindo faixa_atraso_1 nula.',
    type: 'chart',
    template: `
      SELECT DATE_TRUNC({contratos.data_base_report}, MONTH) AS bucket,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'A', {contratos.id_contrato}, NULL)) AS a,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'B', {contratos.id_contrato}, NULL)) AS b,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'C', {contratos.id_contrato}, NULL)) AS c,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'D', {contratos.id_contrato}, NULL)) AS d,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'E', {contratos.id_contrato}, NULL)) AS e,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'F', {contratos.id_contrato}, NULL)) AS f,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'G', {contratos.id_contrato}, NULL)) AS g,
             COUNT(DISTINCT IF({contratos.rating_liquid} = 'H', {contratos.id_contrato}, NULL)) AS h
      FROM {contratos}
      WHERE {contratos.faixa_atraso_1} IS NOT NULL
        AND {filter.date_range:contratos.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('contratos', 'id_contrato'), playRef('contratos', 'rating_liquid'),
      playRef('contratos', 'data_base_report'), playRef('contratos', 'faixa_atraso_1'),
    ],
  }),
  sql({
    id: 'covenants.score_histograma',
    shape: 'breakdown',
    outputColumns: ['faixa_score', 'value'],
    label: 'Distribuição por Faixa de Score',
    description: 'CTD de contratos por faixa_score no snapshot atual, excluindo faixa_atraso_1 nula.',
    type: 'chart',
    template: `
      SELECT {contratos.faixa_score} AS faixa_score,
             COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND {contratos.faixa_atraso_1} IS NOT NULL
      GROUP BY faixa_score
      ORDER BY faixa_score
    `,
    requires: [
      playRef('contratos', 'faixa_score'), playRef('contratos', 'id_contrato'),
      playRef('contratos', 'data_base_report'), playRef('contratos', 'faixa_atraso_1'),
    ],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Recebíveis / Fluxo — validado: recebiveis_pre_pos_snapshot Pós=
  // 70.746.923,26 / Pré=15.015.218,05 (MATCH exato). recebiveis_por_inadimplencia
  // (join fluxo_caixa×contratos, sql — ver nota de decisão acima) reproduz a
  // MESMA soma exata quebrada em 12 linhas tipo×faixa (invariante
  // fluxo_contratado ≥ fluxo_esperado não se aplica aqui, é outra métrica).
  //
  // NOTA (fix pós-review): `covenants.recebiveis_pre_pos` (sem sufixo) NÃO é
  // criado/tocado por este catálogo — é uma métrica global PRÉ-EXISTENTE do
  // piloto Galli (seed-galli-metrics.mjs:412-431, removido na purga; série mensal stacked de
  // covenants_calculo), com 4 consumidores vivos confirmados
  // (dashboardTemplates/sumario-executivo-mcmv, .../sumario-executivo-sbpe,
  // 2 reports do cliente Galli). O apply original desta task a havia
  // sobrescrito por engano (merge:false, mesmo id) — restaurada via
  // scripts/hotfix-restore-recebiveis-pre-pos.mjs (ver task-11-report.md,
  // seção "Fix pós-review"). O donut de snapshot abaixo vive em id PRÓPRIO:
  // `covenants.recebiveis_pre_pos_snapshot` — este é o id que a Task 13 deve
  // referenciar no template Vila Rosa (visão executiva/covenants).
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.recebiveis_pre_pos_snapshot',
    shape: 'breakdown',
    outputColumns: ['tipo_recebivel', 'value'],
    label: 'Total de Recebíveis (Pré × Pós Chaves) — Snapshot',
    description: 'SUM(fluxo_contratado) por tipo_recebivel no snapshot atual (todas as parcelas futuras). Donut para o template Vila Rosa (Covenants — visão executiva); NÃO confundir com covenants.recebiveis_pre_pos (série mensal, métrica global do piloto Galli).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT {fluxo_caixa.tipo_recebivel} AS tipo_recebivel,
             SUM({fluxo_caixa.fluxo_contratado}) AS value
      FROM {fluxo_caixa}
      WHERE {fluxo_caixa.data_base_report} = (
        SELECT MAX({fluxo_caixa.data_base_report}) FROM {fluxo_caixa} WHERE {filter.ate:fluxo_caixa.data_base_report}
      )
      GROUP BY tipo_recebivel
    `,
    requires: [playRef('fluxo_caixa', 'tipo_recebivel'), playRef('fluxo_caixa', 'fluxo_contratado'), playRef('fluxo_caixa', 'data_base_report')],
  }),
  // FIX (Task 13 pós-review): era GROUP BY tipo_recebivel, faixa_atraso_1 sem
  // pivot — formato longo, incompatível com stacked-bar. Reescrito com pivot
  // manual (6 colunas de faixa_atraso_1, valores literais confirmados por
  // query real — ver task-13-report.md). X-axis (tipo_recebivel) vira 1
  // linha por tipo (2 linhas: Pré-chaves/Pós-chaves), 1 coluna por faixa.
  sql({
    id: 'covenants.recebiveis_por_inadimplencia',
    // AMBÍGUA: é um pivot (1 coluna por categoria de faixa_atraso_1), mas o eixo X é
    // categórico (tipo_recebivel), não temporal — não existe forma "pivot categórico".
    // `timeseries_pivot` é a escolha porque é a única que leva a stacked-bar; `breakdown`
    // mandaria para rosca, que não sabe desenhar 6 séries.
    shape: 'timeseries_pivot',
    outputColumns: ['tipo_recebivel', 'sem_atraso', 'f1a5', 'f6a30', 'f30a60', 'f60a90', 'f90mais'],
    label: 'Recebíveis por Inadimplência',
    description: 'SUM(fluxo_contratado) por tipo_recebivel, pivotado por faixa_atraso_1 (6 colunas: sem_atraso/f1a5/f6a30/f30a60/f60a90/f90mais), no snapshot atual (join fluxo_caixa × contratos).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT fc.{fluxo_caixa.tipo_recebivel} AS tipo_recebivel,
             SUM(IF(c.{contratos.faixa_atraso_1} = '00. Sem atraso', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS sem_atraso,
             SUM(IF(c.{contratos.faixa_atraso_1} = '01. 1 - 5 dias', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS f1a5,
             SUM(IF(c.{contratos.faixa_atraso_1} = '02. 6 - 30 dias', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS f6a30,
             SUM(IF(c.{contratos.faixa_atraso_1} = '03. 30 - 60 dias', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS f30a60,
             SUM(IF(c.{contratos.faixa_atraso_1} = '04. 60 - 90 dias', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS f60a90,
             SUM(IF(c.{contratos.faixa_atraso_1} = '05. Acima de 90 dias', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS f90mais
      FROM {fluxo_caixa} fc
      JOIN {contratos} c
        ON fc.{fluxo_caixa.id_contrato} = c.{contratos.id_contrato}
       AND fc.{fluxo_caixa.data_base_report} = c.{contratos.data_base_report}
      WHERE fc.{fluxo_caixa.data_base_report} = (
        SELECT MAX({fluxo_caixa.data_base_report}) FROM {fluxo_caixa} WHERE {filter.ate:fluxo_caixa.data_base_report}
      )
        AND c.{contratos.faixa_atraso_1} IS NOT NULL
      GROUP BY tipo_recebivel
      ORDER BY tipo_recebivel
    `,
    requires: [
      playRef('fluxo_caixa', 'tipo_recebivel'), playRef('fluxo_caixa', 'fluxo_contratado'),
      playRef('fluxo_caixa', 'id_contrato'), playRef('fluxo_caixa', 'data_base_report'),
      playRef('contratos', 'id_contrato'), playRef('contratos', 'faixa_atraso_1'), playRef('contratos', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.fluxo_projetado_table',
    // AMBÍGUA: o SQL é idêntico ao de `covenants.fluxo_projetado_serie`
    // ({bucket, fluxo_esperado, fluxo_contratado} = timeseries_multi). As duas métricas
    // só existem separadas porque uma é para ler mês a mês e a outra para ver a curva —
    // declarar a mesma forma nas duas tornaria esta aqui irrelevante (o gráfico ganharia
    // sempre). `rows` preserva a intenção: N colunas nomeadas para listagem.
    shape: 'rows',
    outputColumns: ['bucket', 'fluxo_esperado', 'fluxo_contratado'],
    label: 'Fluxo de Caixa Projetado — Tabela',
    description: 'SUM(fluxo_esperado) e SUM(fluxo_contratado) por mês futuro de data_base_fluxo, no snapshot atual.',
    type: 'table', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({fluxo_caixa.data_base_fluxo}, MONTH) AS bucket,
             SUM({fluxo_caixa.fluxo_esperado}) AS fluxo_esperado,
             SUM({fluxo_caixa.fluxo_contratado}) AS fluxo_contratado
      FROM {fluxo_caixa}
      WHERE {fluxo_caixa.data_base_report} = (
        SELECT MAX({fluxo_caixa.data_base_report}) FROM {fluxo_caixa} WHERE {filter.ate:fluxo_caixa.data_base_report}
      )
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('fluxo_caixa', 'data_base_fluxo'), playRef('fluxo_caixa', 'fluxo_esperado'),
      playRef('fluxo_caixa', 'fluxo_contratado'), playRef('fluxo_caixa', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.fluxo_projetado_serie',
    shape: 'timeseries_multi',
    outputColumns: ['bucket', 'fluxo_esperado', 'fluxo_contratado'],
    label: 'Fluxo de Parcela Ajustada ao Risco',
    description: 'Série mensal futura: fluxo_esperado (barra) × fluxo_contratado (linha), no snapshot atual.',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({fluxo_caixa.data_base_fluxo}, MONTH) AS bucket,
             SUM({fluxo_caixa.fluxo_esperado}) AS fluxo_esperado,
             SUM({fluxo_caixa.fluxo_contratado}) AS fluxo_contratado
      FROM {fluxo_caixa}
      WHERE {fluxo_caixa.data_base_report} = (
        SELECT MAX({fluxo_caixa.data_base_report}) FROM {fluxo_caixa} WHERE {filter.ate:fluxo_caixa.data_base_report}
      )
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('fluxo_caixa', 'data_base_fluxo'), playRef('fluxo_caixa', 'fluxo_esperado'),
      playRef('fluxo_caixa', 'fluxo_contratado'), playRef('fluxo_caixa', 'data_base_report'),
    ],
  }),
  // FIX (Task 13 pós-review): era GROUP BY bucket, faixa_atraso_1 sem pivot —
  // formato longo, incompatível com stacked-bar. Reescrito com pivot manual
  // (mesmas 6 colunas de faixa_atraso_1 de recebiveis_por_inadimplencia).
  sql({
    id: 'covenants.fluxo_por_faixa_serie',
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'sem_atraso', 'f1a5', 'f6a30', 'f30a60', 'f60a90', 'f90mais'],
    label: 'Fluxo de Caixa por Faixa de Inadimplência',
    description: 'SUM(fluxo_esperado) por mês futuro de data_base_fluxo, pivotado por faixa_atraso_1 (6 colunas: sem_atraso/f1a5/f6a30/f30a60/f60a90/f90mais), no snapshot atual (join fluxo_caixa × contratos).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC(fc.{fluxo_caixa.data_base_fluxo}, MONTH) AS bucket,
             SUM(IF(c.{contratos.faixa_atraso_1} = '00. Sem atraso', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS sem_atraso,
             SUM(IF(c.{contratos.faixa_atraso_1} = '01. 1 - 5 dias', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS f1a5,
             SUM(IF(c.{contratos.faixa_atraso_1} = '02. 6 - 30 dias', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS f6a30,
             SUM(IF(c.{contratos.faixa_atraso_1} = '03. 30 - 60 dias', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS f30a60,
             SUM(IF(c.{contratos.faixa_atraso_1} = '04. 60 - 90 dias', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS f60a90,
             SUM(IF(c.{contratos.faixa_atraso_1} = '05. Acima de 90 dias', fc.{fluxo_caixa.fluxo_esperado}, 0)) AS f90mais
      FROM {fluxo_caixa} fc
      JOIN {contratos} c
        ON fc.{fluxo_caixa.id_contrato} = c.{contratos.id_contrato}
       AND fc.{fluxo_caixa.data_base_report} = c.{contratos.data_base_report}
      WHERE fc.{fluxo_caixa.data_base_report} = (
        SELECT MAX({fluxo_caixa.data_base_report}) FROM {fluxo_caixa} WHERE {filter.ate:fluxo_caixa.data_base_report}
      )
        AND c.{contratos.faixa_atraso_1} IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      playRef('fluxo_caixa', 'data_base_fluxo'), playRef('fluxo_caixa', 'fluxo_esperado'),
      playRef('fluxo_caixa', 'id_contrato'), playRef('fluxo_caixa', 'data_base_report'),
      playRef('contratos', 'id_contrato'), playRef('contratos', 'faixa_atraso_1'), playRef('contratos', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.unidades_vendidas_acum',
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    label: 'Evolução de Vendas Acumulada',
    description: 'CTD acumulado de contratos por mês de data_emissao — histórico completo, sem filtro de período.',
    type: 'chart',
    template: `
      WITH cohorts AS (
        SELECT DISTINCT {contratos.id_contrato} AS id_contrato,
               DATE_TRUNC({contratos.data_emissao}, MONTH) AS bucket
        FROM {contratos}
      ),
      por_mes AS (
        SELECT bucket, COUNT(DISTINCT id_contrato) AS value
        FROM cohorts
        GROUP BY bucket
      )
      SELECT bucket, SUM(value) OVER (ORDER BY bucket) AS value
      FROM por_mes
      ORDER BY bucket
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'data_emissao')],
  }),
  sql({
    id: 'covenants.velocidade_venda',
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    label: 'Velocidade de Venda',
    description: 'CTD de contratos por mês de data_emissao (não acumulado) — histórico completo, sem filtro de período.',
    type: 'chart',
    template: `
      WITH cohorts AS (
        SELECT DISTINCT {contratos.id_contrato} AS id_contrato,
               DATE_TRUNC({contratos.data_emissao}, MONTH) AS bucket
        FROM {contratos}
      )
      SELECT bucket, COUNT(DISTINCT id_contrato) AS value
      FROM cohorts
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'data_emissao')],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // VUV / Estoque — replicam o recipe JÁ PATCHEADO (snapshot-pin) das
  // métricas homônimas existentes (antigo patch-covenants-snapshot-pin.mjs), para
  // não regredir o pilot Galli ao re-seedar estes MESMOS ids globais.
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.vuv3_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'VUV3 / m²',
    description: 'Valor unitário ajustado (últimas 3 vendas) por m² — média (snapshot atual).',
    type: 'kpi', unit: 'BRL/m²',
    template: snapshotKpi('covenants_calculo', 'AVG({covenants_calculo.vuv3_m2})'),
    requires: [ppRef('covenants_calculo', 'vuv3_m2'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.vuva_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'VUVA / m²',
    description: 'Valor unitário ajustado (avaliação) por m² — média (snapshot atual).',
    type: 'kpi', unit: 'BRL/m²',
    template: snapshotKpi('covenants_calculo', 'AVG({covenants_calculo.vuva_m2})'),
    requires: [ppRef('covenants_calculo', 'vuva_m2'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.vuv3_estoque',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'VUV3 Estoque',
    description: 'Valor do estoque pelo VUV3 — soma (snapshot atual).',
    type: 'kpi', unit: 'BRL',
    template: snapshotKpi('covenants_calculo', 'SUM({covenants_calculo.vuv3_estoque})'),
    requires: [ppRef('covenants_calculo', 'vuv3_estoque'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.vuva_estoque',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'VUVA Estoque',
    description: 'Valor do estoque pelo VUVA — soma (snapshot atual).',
    type: 'kpi', unit: 'BRL',
    template: snapshotKpi('covenants_calculo', 'SUM({covenants_calculo.vuva_estoque})'),
    requires: [ppRef('covenants_calculo', 'vuva_estoque'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.vuv_serie',
    shape: 'timeseries_multi',
    outputColumns: ['bucket', 'vuv3_m2', 'vuva_m2'],
    label: 'Evolução do VUV',
    description: 'Série mensal de VUV3/m² vs VUVA/m².',
    type: 'chart', unit: 'BRL/m²',
    template: `
      SELECT DATE_TRUNC({covenants_calculo.data_base_report}, MONTH) AS bucket,
             AVG({covenants_calculo.vuv3_m2}) AS vuv3_m2,
             AVG({covenants_calculo.vuva_m2}) AS vuva_m2
      FROM {covenants_calculo}
      WHERE {filter.date_range:covenants_calculo.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [ppRef('covenants_calculo', 'data_base_report'), ppRef('covenants_calculo', 'vuv3_m2'), ppRef('covenants_calculo', 'vuva_m2')],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Evolução de Obra — validado: no snapshot atual (data_base_report =
  // 2026-05-31), a medição "atual" (data_medicao <= data_base_report, mais
  // recente com realizado_acumulado não-nulo) é medicao=1 (05/05/2026):
  // previsto=24,82% (MATCH), realizado=22,84% (MATCH), desvio=-1,98%
  // (MATCH) — os 3 batem com MAPEAMENTO pág.5 EXATAMENTE. A medicao=2
  // (06/06/2026, JÁ com realizado=26,73%) é do FUTURO relativo ao
  // data_base_report atual — corresponde ao valor da pág.3 (Empreendimento,
  // capturado de um snapshot Looker posterior/diferente). Uso a medição
  // "atual" (<=data_base_report) para TODOS os KPIs de obra, incl.
  // emp_realizado_acum — reproduz 22,84%, não 26,73%. Documentado
  // conforme instrução do brief ("use o que o SQL retornar e documente").
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.obra_previsto_acum',
    shape: 'scalar',
    outputColumns: ['value'],
    percentPointColumns: ['value'],
    label: 'Previsto Acumulado (Obra)',
    description: 'Percentual previsto acumulado de evolução física da obra, na medição atual do snapshot.',
    type: 'kpi', unit: '%',
    template: `
      SELECT {evolucao_obra.previsto_acumulado} AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
        AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
        AND {evolucao_obra.realizado_acumulado} IS NOT NULL
      ORDER BY {evolucao_obra.data_medicao} DESC
      LIMIT 1
    `,
    requires: [
      ppRef('evolucao_obra', 'previsto_acumulado'), ppRef('evolucao_obra', 'realizado_acumulado'),
      ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.obra_realizado_acum',
    shape: 'scalar',
    outputColumns: ['value'],
    percentPointColumns: ['value'],
    label: 'Realizado Acumulado (Obra)',
    description: 'Percentual realizado acumulado de evolução física da obra, na medição atual do snapshot.',
    type: 'kpi', unit: '%',
    template: `
      SELECT {evolucao_obra.realizado_acumulado} AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
        AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
        AND {evolucao_obra.realizado_acumulado} IS NOT NULL
      ORDER BY {evolucao_obra.data_medicao} DESC
      LIMIT 1
    `,
    requires: [
      ppRef('evolucao_obra', 'realizado_acumulado'), ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.obra_data_medicao',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Data da Medição (Obra)',
    description: 'Data da medição física mais recente já realizada, no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT {evolucao_obra.data_medicao} AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
        AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
        AND {evolucao_obra.realizado_acumulado} IS NOT NULL
      ORDER BY {evolucao_obra.data_medicao} DESC
      LIMIT 1
    `,
    requires: [
      ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'realizado_acumulado'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.obra_desvio_acum',
    shape: 'scalar',
    outputColumns: ['value'],
    percentPointColumns: ['value'],
    label: 'Desvio Acumulado (Obra)',
    description: 'Desvio acumulado entre realizado e previsto, na medição atual do snapshot.',
    type: 'kpi', unit: '%',
    template: `
      SELECT {evolucao_obra.desvio_acumulado} AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
        AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
        AND {evolucao_obra.realizado_acumulado} IS NOT NULL
      ORDER BY {evolucao_obra.data_medicao} DESC
      LIMIT 1
    `,
    requires: [
      ppRef('evolucao_obra', 'desvio_acumulado'), ppRef('evolucao_obra', 'realizado_acumulado'),
      ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.obra_serie',
    shape: 'timeseries_multi',
    outputColumns: ['bucket', 'previsto_acumulado', 'realizado_acumulado'],
    percentPointColumns: ['previsto_acumulado', 'realizado_acumulado'],
    label: 'Evolução de Obra no Tempo',
    description: 'Série por data_medicao (curva completa do snapshot atual): previsto_acumulado × realizado_acumulado.',
    type: 'chart', unit: '%',
    template: `
      SELECT DATE_TRUNC({evolucao_obra.data_medicao}, MONTH) AS bucket,
             MAX({evolucao_obra.previsto_acumulado}) AS previsto_acumulado,
             MAX({evolucao_obra.realizado_acumulado}) AS realizado_acumulado
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [
      ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'previsto_acumulado'),
      ppRef('evolucao_obra', 'realizado_acumulado'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.obra_desvio_periodo_serie',
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    percentPointColumns: ['value'],
    label: 'Desvio no Período (Obra)',
    description: 'Série por medição (snapshot atual) do desvio no período entre realizado e previsto.',
    type: 'chart', unit: '%',
    template: `
      SELECT DATE_TRUNC({evolucao_obra.data_medicao}, MONTH) AS bucket,
             MAX({evolucao_obra.desvio_periodo}) AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'desvio_periodo'), ppRef('evolucao_obra', 'data_base_report')],
  }),
  sql({
    id: 'covenants.obra_desvio_acum_serie',
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    percentPointColumns: ['value'],
    label: 'Desvio Acumulado — Série (Obra)',
    description: 'Série por medição (snapshot atual) do desvio acumulado entre realizado e previsto.',
    type: 'chart', unit: '%',
    template: `
      SELECT DATE_TRUNC({evolucao_obra.data_medicao}, MONTH) AS bucket,
             MAX({evolucao_obra.desvio_acumulado}) AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'desvio_acumulado'), ppRef('evolucao_obra', 'data_base_report')],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Empreendimento KPIs (decomposição de `empreendimento_kpis_*` — 16 ids
  // individuais, decisão do controller). Validado: emp_total_unidades=192,
  // emp_area_total_m2=23.904,26 (Task 15: fonte trocada p/ mapa_de_vendas —
  // ver FIX abaixo), emp_vgv=115.552.000 (MATCH), emp_permutas_qtde=8/
  // emp_garantias_un=184 (MATCH, COM filtro pavimento), emp_permutas_m2=
  // 1.030,81/vgv=4.960.000 e emp_garantias_m2=22.873,45/vgv=110.592.000
  // (MATCH EXATO, SEM filtro de pavimento — confirmado por query: o filtro
  // pavimento só se aplica às contagens, não às somas de área/VGV).
  // emp_estoque=20, emp_estoque_m2=1.842,58 (covenants_calculo, mesmo
  // padrão patcheado). emp_saldo_devedor=86.333.684,03 (MATCH exato).
  // emp_unidades_vendidas=164 (=158 ativos + 6 quitados, MATCH).
  // emp_valor_vendido=100.191.767,55 (Task 15: fonte trocada p/
  // SUM(valor_imovel) sem filtro de status — ver FIX abaixo).
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.emp_total_unidades',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Total de Unidades',
    description: 'Total de unidades do projeto (dimensão, ficha_cadastral).',
    type: 'kpi',
    template: `SELECT ANY_VALUE({ficha_cadastral.projeto_total_unidades}) AS value FROM {ficha_cadastral}`,
    requires: [ppRef('ficha_cadastral', 'projeto_total_unidades')],
  }),
  // FIX (Task 15 — reconciliação c/ Looker): `ANY_VALUE(ficha_cadastral.
  // projeto_total_m2)` = 15.238,9, não 23.904,26. O Looker sourceava "Área
  // Total m2" de Mapa de Vendas (não ficha_cadastral) — `SUM(mapa_de_vendas.
  // area_total)` no snapshot atual reproduz 23.904,2628 (arredonda p/
  // 23.904,26, EXATO), confirmado por query real (task-15-report.md).
  // Consistente internamente: `emp_permutas_m2` (1.030,81) + `emp_garantias_m2`
  // (22.873,45) — ambos já sobre mapa_de_vendas — somam exatamente 23.904,26.
  sql({
    id: 'covenants.emp_area_total_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Área Total (m²)',
    description: 'Área total do projeto, em m² — SUM(area_total) de mapa_de_vendas no snapshot atual.',
    type: 'kpi', unit: 'm²',
    template: snapshotKpi('mapa_de_vendas', 'SUM({mapa_de_vendas.area_total})'),
    requires: [ppRef('mapa_de_vendas', 'area_total'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_vgv',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'VGV do Projeto',
    description: 'Valor Geral de Vendas total do projeto (dimensão, ficha_cadastral).',
    type: 'kpi', unit: 'BRL',
    template: `SELECT ANY_VALUE({ficha_cadastral.projeto_vgv}) AS value FROM {ficha_cadastral}`,
    requires: [ppRef('ficha_cadastral', 'projeto_vgv')],
  }),
  sql({
    id: 'covenants.emp_permutas_qtde',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Quantidade de Permutas',
    description: 'Contagem de unidades de permuta (mapa_de_vendas, snapshot atual, excluindo pavimentos de garagem G1/G2/Térreo).',
    type: 'kpi',
    template: `
      SELECT COUNT(*) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = TRUE
        AND UPPER({mapa_de_vendas.pavimento}) NOT IN ('G1', 'G2', 'TÉRREO')
    `,
    requires: [ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'pavimento'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_permutas_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Permuta (m²)',
    description: 'Área total (m²) das unidades de permuta (mapa_de_vendas, snapshot atual — sem filtro de pavimento).',
    type: 'kpi', unit: 'm²',
    template: `
      SELECT SUM({mapa_de_vendas.area_total}) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = TRUE
    `,
    requires: [ppRef('mapa_de_vendas', 'area_total'), ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_permutas_vgv',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Permuta (VGV)',
    description: 'Valor de avaliação total das unidades de permuta (mapa_de_vendas, snapshot atual — sem filtro de pavimento).',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT SUM({mapa_de_vendas.valor_avaliacao}) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = TRUE
    `,
    requires: [ppRef('mapa_de_vendas', 'valor_avaliacao'), ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_garantias_un',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Unidades em Garantia',
    description: 'Contagem de unidades em garantia (mapa_de_vendas, snapshot atual, excluindo pavimentos de garagem G1/G2/Térreo).',
    type: 'kpi',
    template: `
      SELECT COUNT(*) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = FALSE
        AND UPPER({mapa_de_vendas.pavimento}) NOT IN ('G1', 'G2', 'TÉRREO')
    `,
    requires: [ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'pavimento'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_garantias_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Garantias (m²)',
    description: 'Área total (m²) das unidades em garantia (mapa_de_vendas, snapshot atual — sem filtro de pavimento).',
    type: 'kpi', unit: 'm²',
    template: `
      SELECT SUM({mapa_de_vendas.area_total}) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = FALSE
    `,
    requires: [ppRef('mapa_de_vendas', 'area_total'), ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_garantias_vgv',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Garantias (VGV)',
    description: 'Valor de avaliação total das unidades em garantia (mapa_de_vendas, snapshot atual — sem filtro de pavimento).',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT SUM({mapa_de_vendas.valor_avaliacao}) AS value
      FROM {mapa_de_vendas}
      WHERE ${pinClause('mapa_de_vendas')}
        AND {mapa_de_vendas.permuta} = FALSE
    `,
    requires: [ppRef('mapa_de_vendas', 'valor_avaliacao'), ppRef('mapa_de_vendas', 'permuta'), ppRef('mapa_de_vendas', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_estoque',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Estoque (un)',
    description: 'Unidades em estoque (covenants_calculo, snapshot atual).',
    type: 'kpi',
    template: snapshotKpi('covenants_calculo', 'SUM({covenants_calculo.estoque})'),
    requires: [ppRef('covenants_calculo', 'estoque'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_estoque_m2',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Estoque (m²)',
    description: 'Área em estoque, em m² (covenants_calculo, snapshot atual).',
    type: 'kpi', unit: 'm²',
    template: snapshotKpi('covenants_calculo', 'SUM({covenants_calculo.estoque_m2})'),
    requires: [ppRef('covenants_calculo', 'estoque_m2'), ppRef('covenants_calculo', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_unidades_vendidas',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Unidades Vendidas',
    description: 'Contagem distinta de contratos ATIVO ou QUITADO no snapshot atual.',
    type: 'kpi',
    template: `
      SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND UPPER({contratos.status_contrato}) IN ('ATIVO', 'QUITADO')
    `,
    requires: [playRef('contratos', 'id_contrato'), playRef('contratos', 'status_contrato'), playRef('contratos', 'data_base_report')],
  }),
  // FIX (Task 15 — reconciliação c/ Looker): `SUM(valor_contrato)` filtrado a
  // ATIVO+QUITADO reproduzia 94.358.398,91 (não 100.191.767,55). Investigação
  // por SQL real (task-15-report.md) mostrou que `valor_contrato` só é
  // preenchido para status ATIVO (NULL nos demais) — não é o campo fonte do
  // Looker. `valor_imovel`, por outro lado, está preenchido nos 4 status
  // (ATIVO/QUITADO/DISTRATADO/OUTRO) e `SUM(valor_imovel)` SEM filtro de
  // status sobre os 183 contratos do snapshot reproduz 100.191.767,55 EXATO
  // (100191767.54999995, confirmado por query real). "Total Valor Vendido"
  // no Looker soma o valor histórico do imóvel de TODOS os contratos já
  // comercializados (incl. distratados/outro), não só os vigentes.
  sql({
    id: 'covenants.emp_valor_vendido',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Total Valor Vendido',
    description: 'SUM(valor_imovel) de todos os contratos no snapshot atual (qualquer status — inclui distratados/outro, refletindo o valor histórico comercializado).',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT SUM({contratos.valor_imovel}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
    `,
    requires: [playRef('contratos', 'valor_imovel'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_saldo_devedor',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Saldo Devedor',
    description: 'SUM(saldo_devedor) de contratos ATIVO ou QUITADO no snapshot atual.',
    type: 'kpi', unit: 'BRL',
    template: `
      SELECT SUM({contratos.saldo_devedor}) AS value
      FROM {contratos}
      WHERE ${pinClause('contratos')}
        AND UPPER({contratos.status_contrato}) IN ('ATIVO', 'QUITADO')
    `,
    requires: [playRef('contratos', 'saldo_devedor'), playRef('contratos', 'status_contrato'), playRef('contratos', 'data_base_report')],
  }),
  sql({
    id: 'covenants.emp_previsao_entrega',
    shape: 'scalar',
    outputColumns: ['value'],
    label: 'Previsão de Entrega',
    description: 'Data prevista de entrega da obra (dimensão, ficha_cadastral).',
    type: 'kpi',
    template: `SELECT ANY_VALUE({ficha_cadastral.projeto_previsao_entrega}) AS value FROM {ficha_cadastral}`,
    requires: [ppRef('ficha_cadastral', 'projeto_previsao_entrega')],
  }),
  sql({
    id: 'covenants.emp_realizado_acum',
    shape: 'scalar',
    outputColumns: ['value'],
    percentPointColumns: ['value'],
    label: 'Realizado Acumulado (Empreendimento)',
    description: 'Percentual realizado acumulado de evolução física da obra, na medição atual do snapshot (mesmo recipe de obra_realizado_acum).',
    type: 'kpi', unit: '%',
    template: `
      SELECT {evolucao_obra.realizado_acumulado} AS value
      FROM {evolucao_obra}
      WHERE ${pinClause('evolucao_obra')}
        AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
        AND {evolucao_obra.realizado_acumulado} IS NOT NULL
      ORDER BY {evolucao_obra.data_medicao} DESC
      LIMIT 1
    `,
    requires: [
      ppRef('evolucao_obra', 'realizado_acumulado'), ppRef('evolucao_obra', 'data_medicao'), ppRef('evolucao_obra', 'data_base_report'),
    ],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Mapa de Vendas — join fluxo_caixa × contratos (sql, mesmo contrato,
  // ver decisão de recipe kind no header). tipo_recebivel confirmado como
  // 'Pré-chaves'/'Pós-chaves' (com acento/hífen) por query real.
  // ═══════════════════════════════════════════════════════════════════
  sql({
    id: 'covenants.mapa_vendas_table',
    shape: 'rows',
    outputColumns: [
      'data_base_report', 'unidade', 'status_contrato', 'rating_liquid', 'score',
      'valor_imovel', 'categoria_venda', 'data_emissao', 'valor_atraso', 'restricoes',
      'recebiveis_pre_chaves', 'recebiveis_pos_chaves',
    ],
    label: 'Mapa de Vendas',
    description: 'Contratos ATIVO no snapshot atual com recebíveis pré/pós-chaves somados (join fluxo_caixa × contratos).',
    type: 'table',
    template: `
      SELECT c.{contratos.data_base_report} AS data_base_report,
             c.{contratos.unidade} AS unidade,
             c.{contratos.status_contrato} AS status_contrato,
             c.{contratos.rating_liquid} AS rating_liquid,
             c.{contratos.score} AS score,
             c.{contratos.valor_imovel} AS valor_imovel,
             c.{contratos.categoria_venda} AS categoria_venda,
             c.{contratos.data_emissao} AS data_emissao,
             c.{contratos.valor_atraso} AS valor_atraso,
             c.{contratos.restricoes} AS restricoes,
             SUM(IF(fc.{fluxo_caixa.tipo_recebivel} = 'Pré-chaves', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS recebiveis_pre_chaves,
             SUM(IF(fc.{fluxo_caixa.tipo_recebivel} = 'Pós-chaves', fc.{fluxo_caixa.fluxo_contratado}, 0)) AS recebiveis_pos_chaves
      FROM {contratos} c
      LEFT JOIN {fluxo_caixa} fc
        ON fc.{fluxo_caixa.id_contrato} = c.{contratos.id_contrato}
       AND fc.{fluxo_caixa.data_base_report} = c.{contratos.data_base_report}
      WHERE c.{contratos.data_base_report} = (
        SELECT MAX({contratos.data_base_report}) FROM {contratos} WHERE {filter.ate:contratos.data_base_report}
      )
        AND UPPER(c.{contratos.status_contrato}) = 'ATIVO'
      GROUP BY data_base_report, unidade, status_contrato, rating_liquid, score, valor_imovel, categoria_venda, data_emissao, valor_atraso, restricoes
      ORDER BY unidade
    `,
    requires: [
      playRef('contratos', 'data_base_report'), playRef('contratos', 'unidade'), playRef('contratos', 'status_contrato'),
      playRef('contratos', 'rating_liquid'), playRef('contratos', 'score'), playRef('contratos', 'valor_imovel'),
      playRef('contratos', 'categoria_venda'), playRef('contratos', 'data_emissao'), playRef('contratos', 'valor_atraso'),
      playRef('contratos', 'restricoes'), playRef('contratos', 'id_contrato'),
      playRef('fluxo_caixa', 'tipo_recebivel'), playRef('fluxo_caixa', 'fluxo_contratado'),
      playRef('fluxo_caixa', 'id_contrato'), playRef('fluxo_caixa', 'data_base_report'),
    ],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // Transações / Extrato — validado: entradas_por_categoria "Entrada"=
  // 5.400.000 (MATCH), extrato_resumido Compras=-247.584,61/Transferência
  // mesma titularidade=-5.000.000 (MATCH exato c/ MAPEAMENTO pág.2 §11).
  // valor já vem assinado por tipo — uso ABS() só para magnitude
  // (barras por categoria), valor cru onde o sinal importa.
  // ═══════════════════════════════════════════════════════════════════
  // FIX (Task 13 pós-review): adicionados tokens {filter.banco}/{filter.categoria}
  // nas 3 métricas de transacoes abaixo (não em transacoes_por_tipo_serie a
  // dimensão `tipo`, que é a própria série ±). Confirmado em resolveSqlRecipe
  // (resolve-metric.ts:413-418): `{filter.X:entity.attr}` com pageFilter
  // ausente OU `kind:'in'` com `values:[]` (nenhuma seleção no dropdown)
  // sempre expande para `1=1` — nunca quebra o SQL nem cliente sem o filtro
  // declarado. `transacoes_por_tipo_serie` não tinha WHERE nenhuma antes
  // (all-time, MAPEAMENTO §9 "ignora o filtro de período global" — preservado,
  // só os 2 tokens novos foram adicionados).
  sql({
    id: 'covenants.transacoes_por_tipo_serie',
    // `credit`/`debit` são duas categorias da MESMA dimensão (`tipo`), pivotadas —
    // por isso `timeseries_pivot` e não `timeseries_multi` (que seria para medidas
    // distintas, como esperado × contratado).
    shape: 'timeseries_pivot',
    outputColumns: ['bucket', 'credit', 'debit'],
    label: 'Entradas & Saídas por Mês',
    description: 'Série mensal ± por tipo: CREDIT positivo, DEBIT negativo (valor já assinado na fonte).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT DATE_TRUNC({transacoes.data}, MONTH) AS bucket,
             SUM(IF(UPPER({transacoes.tipo}) = 'CREDIT', {transacoes.valor}, 0)) AS credit,
             SUM(IF(UPPER({transacoes.tipo}) = 'DEBIT', {transacoes.valor}, 0)) AS debit
      FROM {transacoes}
      WHERE {filter.banco:transacoes.banco_codigo}
        AND {filter.categoria:transacoes.categoria}
      GROUP BY bucket
      ORDER BY bucket
    `,
    requires: [ppRef('transacoes', 'data'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'valor')],
  }),
  // FIX (Task 15 — reconciliação c/ Looker): os 5 metrics de `transacoes`
  // abaixo filtravam `{filter.date_range:transacoes.data}` (data REAL da
  // transação bancária). MAPEAMENTO §1 documenta que o filtro de período
  // GLOBAL do relatório Looker atua sobre `data_base_report` ("seletor de
  // intervalo sobre data_base_report (snapshot mensal)"), não sobre a data
  // real de cada lançamento. Confirmado por query real (task-15-report.md):
  // as 12 linhas de `transacoes` têm `data` espalhada em abr–mai/2026 mas
  // TODAS com `data_base_report = 2026-05-31` — filtrar por `data` com range
  // 1–31/mai/2026 exclui as 2 linhas CREDIT de abril (zerando "Entradas") e
  // reduz o Extrato a 4 de 12 linhas (soma não bate com o total Looker
  // 152.415,39); filtrar por `data_base_report` mantém as 12 linhas e
  // reproduz 152.415,39 EXATO (extrato_table) — consistente com os valores já
  // validados de entradas/saídas por categoria (que só batem somando as 12
  // linhas). `transacoes_por_tipo_serie` NÃO leva esse filtro (ignora período
  // por design, MAPEAMENTO §9).
  sql({
    id: 'covenants.entradas_por_categoria',
    shape: 'breakdown',
    outputColumns: ['categoria', 'value'],
    label: 'Entradas por Categoria',
    description: 'Somatório de créditos bancários por categoria macro Pluggy no período (filtro de período sobre data_base_report, snapshot mensal).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT COALESCE(cat.parent_description_translated, t.{transacoes.categoria}) AS categoria,
             SUM(ABS(t.{transacoes.valor})) AS value
      FROM {transacoes} t
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_pluggy_categorias\` cat
        ON t.{transacoes.categoria} = cat.description
      WHERE UPPER(t.{transacoes.tipo}) = 'CREDIT'
        AND {filter.date_range:transacoes.data_base_report}
        AND {filter.banco:transacoes.banco_codigo}
        AND {filter.categoria:transacoes.categoria}
      GROUP BY categoria
      ORDER BY value DESC
    `,
    requires: [ppRef('transacoes', 'valor'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'categoria'), ppRef('transacoes', 'data_base_report')],
  }),
  sql({
    id: 'covenants.saidas_por_categoria',
    shape: 'breakdown',
    outputColumns: ['categoria', 'value'],
    label: 'Saídas por Categoria',
    description: 'Somatório de débitos bancários por categoria macro Pluggy no período (filtro de período sobre data_base_report, snapshot mensal).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT COALESCE(cat.parent_description_translated, t.{transacoes.categoria}) AS categoria,
             SUM(ABS(t.{transacoes.valor})) AS value
      FROM {transacoes} t
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_pluggy_categorias\` cat
        ON t.{transacoes.categoria} = cat.description
      WHERE UPPER(t.{transacoes.tipo}) = 'DEBIT'
        AND {filter.date_range:transacoes.data_base_report}
        AND {filter.banco:transacoes.banco_codigo}
        AND {filter.categoria:transacoes.categoria}
      GROUP BY categoria
      ORDER BY value DESC
    `,
    requires: [ppRef('transacoes', 'valor'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'categoria'), ppRef('transacoes', 'data_base_report')],
  }),
  // FIX (Task 13 pós-review): coluna de categoria macro aliasada `AS bucket`
  // (era `AS categoria`) — `toWaterfallData` (waterfall.ts:4) lê `r.bucket`
  // literal; sem esse alias o eixo X do waterfall ficava sem rótulo. Mesmos
  // valores/agrupamento, só o nome da coluna mudou.
  sql({
    id: 'covenants.extrato_resumido',
    // AMBÍGUA: formato LONGO com duas dimensões ({bucket=categoria macro} × {tipo}) e
    // uma medida — nenhuma das 6 formas descreve isso. `breakdown` é a escolha porque a
    // leitura pretendida é composição por categoria (waterfall, que lê `bucket` literal);
    // `tipo` fica visível em `outputColumns` para quem precisar desempilhar. Cuidado: a
    // mesma categoria aparece em até 2 linhas (CREDIT/DEBIT), então rosca lê errado.
    shape: 'breakdown',
    outputColumns: ['bucket', 'tipo', 'value'],
    label: 'Extrato Resumido',
    description: 'SUM(valor) por categoria macro Pluggy (alias bucket, p/ waterfall) × tipo, com sinal (filtro de período sobre data_base_report, snapshot mensal).',
    type: 'chart', unit: 'BRL',
    template: `
      SELECT COALESCE(cat.parent_description_translated, t.{transacoes.categoria}) AS bucket,
             t.{transacoes.tipo} AS tipo,
             SUM(t.{transacoes.valor}) AS value
      FROM {transacoes} t
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_pluggy_categorias\` cat
        ON t.{transacoes.categoria} = cat.description
      WHERE {filter.date_range:transacoes.data_base_report}
      GROUP BY bucket, tipo
      ORDER BY value DESC
    `,
    requires: [ppRef('transacoes', 'valor'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'categoria'), ppRef('transacoes', 'data_base_report')],
  }),
  sql({
    id: 'covenants.recebimentos_periodo',
    // Duas dimensões (banco × conta_codigo) + medida: é listagem, não composição de um
    // total por uma dimensão só — `rows`, coerente com o `type: table`.
    shape: 'rows',
    outputColumns: ['banco', 'conta_codigo', 'value'],
    label: 'Recebimentos no Período',
    description: 'SUM(valor) de créditos por banco (nome via ba_bancos) × conta_codigo, no período (filtro de período sobre data_base_report, snapshot mensal).',
    type: 'table', unit: 'BRL',
    template: `
      SELECT b.nome_reduzido AS banco,
             t.{transacoes.conta_codigo} AS conta_codigo,
             SUM(ABS(t.{transacoes.valor})) AS value
      FROM {transacoes} t
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_bancos\` b
        ON t.{transacoes.banco_codigo} = b.numero_codigo
      WHERE UPPER(t.{transacoes.tipo}) = 'CREDIT'
        AND {filter.date_range:transacoes.data_base_report}
      GROUP BY banco, conta_codigo
      ORDER BY value DESC
    `,
    requires: [
      ppRef('transacoes', 'valor'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'banco_codigo'),
      ppRef('transacoes', 'conta_codigo'), ppRef('transacoes', 'data_base_report'),
    ],
  }),
  sql({
    id: 'covenants.extrato_table',
    shape: 'rows',
    outputColumns: [
      'data', 'banco', 'descricao', 'categoria', 'tipo', 'pagador_tipo', 'pagador',
      'recebedor_tipo', 'recebedor', 'valor',
    ],
    label: 'Extrato Detalhado',
    description: 'Lançamentos bancários com banco (nome) e categoria macro Pluggy, ordenados por data desc (filtro de período sobre data_base_report, snapshot mensal).',
    type: 'table', unit: 'BRL',
    template: `
      SELECT t.{transacoes.data} AS data,
             b.nome_reduzido AS banco,
             t.{transacoes.descricao} AS descricao,
             COALESCE(cat.parent_description_translated, t.{transacoes.categoria}) AS categoria,
             t.{transacoes.tipo} AS tipo,
             t.{transacoes.pagador_tipo} AS pagador_tipo,
             t.{transacoes.pagador} AS pagador,
             t.{transacoes.recebedor_tipo} AS recebedor_tipo,
             t.{transacoes.recebedor} AS recebedor,
             t.{transacoes.valor} AS valor
      FROM {transacoes} t
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_bancos\` b ON t.{transacoes.banco_codigo} = b.numero_codigo
      LEFT JOIN \`${BQ_PROJECT}.dataviz_aux.ba_pluggy_categorias\` cat ON t.{transacoes.categoria} = cat.description
      WHERE {filter.date_range:transacoes.data_base_report}
        AND {filter.banco:transacoes.banco_codigo}
        AND {filter.categoria:transacoes.categoria}
        AND {filter.tipo:transacoes.tipo}
      ORDER BY t.{transacoes.data} DESC
      LIMIT 10000
    `,
    requires: [
      ppRef('transacoes', 'data'), ppRef('transacoes', 'banco_codigo'), ppRef('transacoes', 'descricao'),
      ppRef('transacoes', 'categoria'), ppRef('transacoes', 'tipo'), ppRef('transacoes', 'pagador_tipo'),
      ppRef('transacoes', 'pagador'), ppRef('transacoes', 'recebedor_tipo'), ppRef('transacoes', 'recebedor'),
      ppRef('transacoes', 'valor'), ppRef('transacoes', 'data_base_report'),
    ],
  }),
];
