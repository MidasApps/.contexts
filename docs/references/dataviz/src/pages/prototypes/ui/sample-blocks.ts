import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * O catálogo vivo de blocos — um de cada tipo, com métrica REAL.
 *
 * Os `metricId` daqui são os do catálogo de produção (`scripts/metrics/
 * covenants-v2.mjs`), e os limites dos covenants são os dos templates reais
 * (`covenants-v2-visao-executiva.template.mjs`). A página que consome isto
 * chama o mesmo `useReportData` do relatório, então o número que aparece é o
 * que o BigQuery devolve — não um valor escrito aqui.
 *
 * Por que um arquivo de dados e não JSX: assim a galeria não pode divergir do
 * relatório. Ela monta um `blockMap` igual ao de um relatório de verdade e o
 * entrega ao mesmo renderizador; se um bloco desenhar errado aqui, desenha
 * errado lá.
 */

export interface BlockExample {
  block: CanvasBlock;
  /** O que este bloco responde — vira o subtítulo do exemplo. */
  question: string;
  /**
   * `false` quando o catálogo não tem métrica da forma que o bloco consome.
   * A galeria marca esses casos, para ninguém confundir dado ilustrativo com
   * dado de produção.
   */
  realData: boolean;
  /**
   * Quando `realData` é falso: por que este exemplo é ilustrativo. Frase
   * inteira, porque os motivos são diferentes — pode faltar a FORMA de métrica
   * (nenhum SQL a emite) ou faltar dado com a cara certa (a forma existe, mas
   * nenhuma métrica devolve categorias suficientes para o bloco fazer sentido).
   */
  whyIllustrative?: string;
}

/** Blocos alimentados pelo pipeline real (`metricId` → `/api/metrics/batch`). */
export const WITH_REAL_METRIC: BlockExample[] = [
  {
    question: 'Qual é o número, agora?',
    realData: true,
    block: {
      id: 'ex-kpi', type: 'kpi', colSpan: 2,
      label: 'Certidões válidas',
      metricId: 'covenants.certidoes_validas_pct',
      format: 'percent', decimals: 1,
    },
  },
  {
    question: 'Está dentro do limite contratado, e com quanta folga?',
    realData: true,
    block: {
      id: 'ex-gauge', type: 'gauge', colSpan: 2,
      label: 'Índice Recebível',
      // `value: 0` como nos templates: o tipo o exige mesmo sendo dado do
      // resolver, e `awaitingFirstData` segura a cor até o número chegar.
      value: 0,
      metricId: 'covenants.indice_recebivel',
      threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
      description: 'Mínimo contratado do Inter',
    },
  },
  {
    question: 'O número com a série por trás — o KPI completo',
    realData: true,
    block: {
      id: 'ex-kpi-sparkline', type: 'kpi', colSpan: 2,
      label: 'Inadimplência',
      metricId: 'covenants.inadimplencia_pct',
      // A segunda métrica é a que desenha a sparkline e calcula a variação
      // contra o período anterior — `applySparklineRowsToKpi`. Sem ela o card
      // é só rótulo e número, e é por isso que ele parecia vazio.
      sparklineMetricId: 'covenants.inadimplencia_serie',
      format: 'percent', decimals: 2,
      positiveIsGood: false,
      iconName: 'TrendingDown',
    },
  },
  {
    question: 'O mesmo KPI quando o valor passa do limite de alerta',
    realData: true,
    block: {
      id: 'ex-kpi-alerta', type: 'kpi', colSpan: 2,
      label: 'Inadimplência 90+',
      metricId: 'covenants.over90_pct',
      sparklineMetricId: 'covenants.inadimplencia_serie',
      format: 'percent', decimals: 2,
      positiveIsGood: false,
      // Mesmo limite que o template de produção usa.
      alertThreshold: 3,
      iconName: 'AlertTriangle',
    },
  },
  {
    question: 'O mesmo covenant, quando ele é o assunto da linha',
    realData: true,
    block: {
      id: 'ex-gauge-arc', type: 'gauge', colSpan: 3, display: 'arc',
      label: 'Índice Recebível',
      value: 0,
      metricId: 'covenants.indice_recebivel',
      threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
    },
  },
  {
    question: 'Quanto falta para a meta?',
    realData: true,
    block: {
      id: 'ex-progress', type: 'progress', colSpan: 2,
      label: 'Certidões regularizadas',
      metricId: 'covenants.certidoes_validas_pct',
      target: 100, targetLabel: 'da carteira', format: 'percent', decimals: 1,
    },
  },
  {
    question: 'Como está contra o período anterior?',
    realData: true,
    block: {
      id: 'ex-comparison', type: 'comparison', colSpan: 3,
      label: 'Inadimplência',
      metricId: 'covenants.inadimplencia_serie',
      format: 'percent', decimals: 2,
      positiveIsGood: false, deltaAsPoints: true,
    },
  },
  {
    question: 'Várias métricas, como cada uma vem se comportando?',
    realData: true,
    block: {
      id: 'ex-sparkrows', type: 'sparkrows', colSpan: 3,
      title: 'Plano empresário',
      subtitle: 'contratado × dívida atual',
      metricId: 'covenants.plano_empresario_serie',
      format: 'currency',
    },
  },
  {
    question: 'Como o total se reparte?',
    realData: true,
    block: {
      id: 'ex-donut', type: 'donut', colSpan: 3, slices: [],
      title: 'Recebíveis pré e pós-chaves',
      metricId: 'covenants.recebiveis_pre_pos_snapshot',
      format: 'currency', centerLabel: 'Total',
    },
  },
  {
    question: 'A mesma composição, quando ela é contexto e não o assunto',
    realData: true,
    block: {
      id: 'ex-donut-bar', type: 'donut', colSpan: 3, display: 'bar', slices: [],
      title: 'Composição em faixa',
      metricId: 'covenants.recebiveis_pre_pos_snapshot',
      format: 'currency',
    },
  },
  {
    question: 'Como a série evoluiu?',
    realData: true,
    block: {
      id: 'ex-chart-line', type: 'chart', colSpan: 3, chartType: 'line',
      title: 'Inadimplência no tempo',
      metricId: 'covenants.inadimplencia_serie',
      xAxisKey: 'mes', dataKeys: ['inadimplencia'],
      // SEM `format: 'percent'` de propósito: esta métrica devolve FRAÇÃO
      // (0,0122), enquanto as `_pct` do mesmo catálogo devolvem pontos (0,73).
      // Declarar percentual aqui exibiria "0,01%" para 1,22% — errado por
      // 100×. A régua é do SQL; o bloco não tem como saber qual convenção veio.
    },
  },
  {
    question: 'Como a composição evoluiu?',
    realData: true,
    block: {
      id: 'ex-chart-stacked', type: 'chart', colSpan: 6, chartType: 'stacked-bar',
      title: 'Contratos por faixa de atraso',
      subtitle: 'composição mês a mês',
      metricId: 'covenants.faixa_atraso2_contratos_serie',
      xAxisKey: 'mes',
      dataKeys: ['sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'],
      // Contagem: sem esta declaração o tooltip exibia "112,00" contratos.
      format: 'number', decimals: 0,
      legendaInterativa: true,
    },
  },
  {
    question: 'Duas grandezas com unidades diferentes, no mesmo gráfico',
    realData: true,
    block: {
      id: 'ex-chart-duplo', type: 'chart', colSpan: 6, chartType: 'composed',
      title: 'Plano empresário — eixo duplo',
      subtitle: 'contratado em R$ (esquerda) × dívida atual (direita)',
      metricId: 'covenants.plano_empresario_serie',
      xAxisKey: 'mes',
      dataKeys: ['contratado', 'divida_atual'],
      rightAxisKeys: ['divida_atual'],
      leftAxisLabel: 'R$', rightAxisLabel: 'R$',
      format: 'currency', rightFormat: 'currency',
    },
  },
  {
    question: 'Como os valores se distribuem por faixa?',
    realData: true,
    block: {
      id: 'ex-chart-hist', type: 'chart', colSpan: 3, chartType: 'histogram',
      title: 'Distribuição de score',
      metricId: 'covenants.score_histograma',
      xAxisKey: 'faixa_score', dataKeys: ['contratos'],
      format: 'number', decimals: 0,
    },
  },
  {
    question: 'Comparação entre categorias',
    realData: true,
    block: {
      id: 'ex-chart-bar', type: 'chart', colSpan: 3, chartType: 'bar',
      title: 'Entradas por categoria',
      metricId: 'covenants.entradas_por_categoria',
      xAxisKey: 'categoria', dataKeys: ['value'],
      format: 'currency',
    },
  },
  {
    question: 'Muitas categorias, ou nomes longos demais para o eixo X',
    realData: true,
    block: {
      id: 'ex-chart-horizontal', type: 'chart', colSpan: 6, chartType: 'bar',
      title: 'Saídas por categoria — barra horizontal',
      subtitle: 'categoria no eixo Y; o contrato exige 4 colunas ou mais',
      metricId: 'covenants.saidas_por_categoria',
      xAxisKey: 'categoria', dataKeys: ['value'], layout: 'horizontal',
      format: 'currency',
    },
  },
  {
    question: 'Volume acumulado ao longo do tempo',
    realData: true,
    block: {
      id: 'ex-chart-area', type: 'chart', colSpan: 3, chartType: 'area',
      title: 'Unidades vendidas (acumulado)',
      format: 'number', decimals: 0,
      metricId: 'covenants.unidades_vendidas_acum',
      xAxisKey: 'mes', dataKeys: ['unidades'],
    },
  },
  {
    question: 'Variações que somam a um total',
    realData: true,
    block: {
      id: 'ex-chart-waterfall', type: 'chart', colSpan: 3, chartType: 'waterfall',
      title: 'Extrato resumido',
      format: 'currency',
      metricId: 'covenants.extrato_resumido',
      xAxisKey: 'bucket', dataKeys: ['value'],
    },
  },
  {
    question: 'A composição importa mais que o valor absoluto',
    realData: true,
    block: {
      id: 'ex-chart-expand', type: 'chart', colSpan: 6, chartType: 'stacked-bar',
      title: 'Contratos por faixa de atraso — 100%',
      subtitle: 'stackOffset "expand": o eixo vira proporção',
      metricId: 'covenants.faixa_atraso2_contratos_serie',
      xAxisKey: 'mes',
      dataKeys: ['sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'],
      stackOffset: 'expand',
    },
  },
  {
    question: 'A composição sem os cards laterais, em 2/6',
    realData: true,
    block: {
      id: 'ex-donut-sem-cards', type: 'donut', colSpan: 2, slices: [],
      title: 'Recebíveis',
      metricId: 'covenants.recebiveis_pre_pos_snapshot',
      format: 'currency', showLegendCards: false,
    },
  },
  {
    question: 'Um limite que é TETO, não piso',
    realData: true,
    block: {
      id: 'ex-gauge-invertido', type: 'gauge', colSpan: 2,
      label: 'Inadimplência 90+',
      value: 0,
      metricId: 'covenants.over90_pct',
      threshold: 0.03, warnThreshold: 0.02,
      format: 'percent', decimals: 2,
      // Aqui quanto MAIOR pior: as faixas invertem e o rótulo vira "Máx.".
      reverseScale: true,
    },
  },
  {
    question: 'Situação por linha, com etiqueta de status',
    realData: true,
    block: {
      id: 'ex-table-status', type: 'table', colSpan: 4,
      title: 'Certidões',
      metricId: 'covenants.certidoes_table',
      columns: [
        { header: 'Órgão', accessorKey: 'certidao_orgao' },
        { header: 'Certidão', accessorKey: 'certidao' },
        { header: 'Tipo', accessorKey: 'tipo' },
        { header: 'Situação', accessorKey: 'status', format: 'status-badge' },
      ],
    },
  },
  {
    question: 'Título de seção ou nota explicativa',
    realData: true,
    block: {
      id: 'ex-text', type: 'text', colSpan: 6,
      content: '### Seção\nTexto de apoio em **markdown** — nunca para número.',
    },
  },
  {
    question: 'Preciso ver registro a registro',
    realData: true,
    block: {
      id: 'ex-table', type: 'table', colSpan: 6,
      title: 'Faixas de atraso',
      metricId: 'covenants.faixa_atraso_table',
      columns: [
        { header: 'Faixa', accessorKey: 'faixa_atraso_1' },
        { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
        { header: 'Saldo devedor', accessorKey: 'saldo_devedor', format: 'currency' },
        { header: 'Valor em atraso', accessorKey: 'valor_atraso', format: 'currency' },
        { header: 'Inadimplência', accessorKey: 'inadimplencia_pct', format: 'percent' },
      ],
      footerAggregations: {
        faixa_atraso_1: 'Total geral', contratos: 'sum',
        saldo_devedor: 'sum', valor_atraso: 'sum',
      },
    },
  },
];

/**
 * Blocos SEM métrica no catálogo — desenhados com valores ilustrativos.
 *
 * `targets`, `points`, `matrix`, `funnel`, `flow` e `distribution` são formas
 * que nenhuma das 64 métricas emite. Os blocos estão implementados e testados;
 * falta o SQL que os alimenta. Aqui eles aparecem com números plausíveis para
 * que a proporção e o desenho possam ser julgados — e marcados, para que
 * ninguém os leia como carteira real.
 */
export const WITHOUT_METRIC_YET: BlockExample[] = [
  {
    question: 'Vários indicadores, cada um contra a sua própria meta',
    realData: false, whyIllustrative: 'sem métrica de forma `targets`',
    block: {
      id: 'ex-targets', type: 'targets', colSpan: 4, display: 'bullet',
      title: 'Covenants — posição atual',
      suffix: 'x', decimals: 2,
      items: [
        { label: 'Índice Recebível', value: 1.38, target: 1.2, warn: 1.5 },
        { label: 'Pós-chaves + Estoque', value: 1.22, target: 1.2, warn: 1.5 },
        { label: 'Índice de obra', value: 0.94, target: 1.2, warn: 1.5 },
      ],
    },
  },
  {
    question: 'A mesma leitura, quando são muitos indicadores',
    realData: false, whyIllustrative: 'sem métrica de forma `targets`',
    block: {
      id: 'ex-targets-list', type: 'targets', colSpan: 2, display: 'list',
      title: 'Enquadramento',
      suffix: 'x', decimals: 2,
      items: [
        { label: 'Índice Recebível', value: 1.38, target: 1.2 },
        { label: 'Pós-chaves + Estoque', value: 1.22, target: 1.2 },
        { label: 'Índice de obra', value: 0.94, target: 1.2 },
        { label: 'Liquidez de curto prazo', value: 2.1, target: 1.5 },
      ],
    },
  },
  {
    question: 'Onde a carteira se acumula, e o que escapou?',
    realData: false, whyIllustrative: 'sem métrica de forma `points`',
    block: {
      id: 'ex-scatter', type: 'scatter', colSpan: 3,
      title: 'LTV × dias de atraso',
      subtitle: 'uma observação por contrato',
      xLabel: 'LTV', yLabel: 'Dias de atraso',
      xFormat: 'percent', yFormat: 'number',
      xReference: { value: 80, label: 'LTV 80%' },
      // Ponto percentual, não fração: `formatPercent` não multiplica por 100 —
      // as métricas `_pct` já devolvem 4,81 para 4,81%.
      points: [
        { x: 52, y: 0 }, { x: 58, y: 4 }, { x: 61, y: 0 }, { x: 63, y: 12 },
        { x: 66, y: 3 }, { x: 68, y: 21 }, { x: 70, y: 8 }, { x: 71, y: 0 },
        { x: 73, y: 34 }, { x: 74, y: 15 }, { x: 76, y: 46 }, { x: 77, y: 9 },
        { x: 79, y: 62 }, { x: 81, y: 88 }, { x: 83, y: 51 }, { x: 85, y: 121 },
        { x: 87, y: 96 }, { x: 90, y: 154 }, { x: 93, y: 187 }, { x: 96, y: 143 },
      ],
    },
  },
  {
    question: 'A inadimplência piora por safra nova ou só por envelhecimento?',
    realData: false, whyIllustrative: 'sem métrica de forma `matrix`',
    block: {
      id: 'ex-heatmap', type: 'heatmap', colSpan: 3,
      title: 'Inadimplência por safra',
      subtitle: 'safra de originação × meses decorridos',
      rowLabel: 'Safra', colLabel: 'Meses', format: 'percent', decimals: 1,
      cells: [
        { row: '2022', col: '3m', value: 0.8 }, { row: '2022', col: '6m', value: 1.7 },
        { row: '2022', col: '12m', value: 3.1 }, { row: '2022', col: '18m', value: 4.6 },
        { row: '2023', col: '3m', value: 1.1 }, { row: '2023', col: '6m', value: 2.2 },
        { row: '2023', col: '12m', value: 3.8 }, { row: '2023', col: '18m', value: 5.7 },
        { row: '2024', col: '3m', value: 1.4 }, { row: '2024', col: '6m', value: 2.9 },
        { row: '2024', col: '12m', value: 4.9 },
        { row: '2025', col: '3m', value: 1.9 }, { row: '2025', col: '6m', value: 3.6 },
        { row: '2026', col: '3m', value: 1.2 },
      ],
    },
  },
  /*
   * Pareto e treemap consomem `breakdown`, forma que EXISTE no catálogo — o que
   * falta é dado com a cara certa. As quatro métricas `breakdown` de hoje
   * devolvem 2 ou 3 categorias, e as duas quase todo o valor numa só: desenhar
   * o treemap com elas produz um retângulo laranja ocupando o card inteiro, que
   * é exatamente o anti-padrão que o contrato manda evitar. Um exemplo que
   * demonstra o anti-padrão não deixa julgar o bloco.
   */
  {
    question: 'Quais poucos concentram a maior parte?',
    realData: false,
    whyIllustrative: 'nenhuma métrica `breakdown` com categorias suficientes',
    block: {
      id: 'ex-chart-pareto', type: 'chart', colSpan: 4, chartType: 'pareto',
      title: 'Atraso por empreendimento',
      subtitle: 'ordenado, com a curva do acumulado',
      xAxisKey: 'empreendimento', dataKeys: ['valor'],
      format: 'currency',
      data: [
        { empreendimento: 'Res. Aurora', valor: 1840000 },
        { empreendimento: 'Vila Bela', valor: 1120000 },
        { empreendimento: 'Parque Sul', valor: 860000 },
        { empreendimento: 'Jd. Horizonte', valor: 540000 },
        { empreendimento: 'Alto da Serra', valor: 410000 },
        { empreendimento: 'Recanto', valor: 260000 },
        { empreendimento: 'Mirante', valor: 180000 },
        { empreendimento: 'Portal', valor: 90000 },
      ],
    },
  },
  {
    question: 'Onde o valor se concentra, quando há categorias demais para uma rosca',
    realData: false,
    whyIllustrative: 'nenhuma métrica `breakdown` com categorias suficientes',
    block: {
      id: 'ex-treemap', type: 'treemap', colSpan: 4,
      title: 'Saldo devedor por empreendimento',
      format: 'currency',
      fatias: [
        { name: 'Res. Aurora', value: 18400000 },
        { name: 'Vila Bela', value: 14200000 },
        { name: 'Parque Sul', value: 11800000 },
        { name: 'Jd. Horizonte', value: 8600000 },
        { name: 'Alto da Serra', value: 6400000 },
        { name: 'Recanto', value: 4900000 },
        { name: 'Mirante', value: 3200000 },
        { name: 'Portal', value: 2100000 },
        { name: 'Belvedere', value: 1400000 },
        { name: 'Colina', value: 900000 },
      ],
    },
  },
  {
    question: 'Onde a esteira de repasse perde mais contratos?',
    realData: false, whyIllustrative: 'sem métrica de forma `funnel`',
    block: {
      id: 'ex-funnel', type: 'funnel', colSpan: 3,
      title: 'Esteira de repasse',
      subtitle: 'contratos por etapa',
      format: 'number',
      etapas: [
        { etapa: 'Elegíveis', value: 1840 },
        { etapa: 'Enviados ao banco', value: 1312 },
        { etapa: 'Aprovados', value: 944 },
        { etapa: 'Repassados', value: 812 },
        { etapa: 'Liquidados', value: 738 },
      ],
    },
  },
  {
    question: 'Quem piorou de faixa de atraso entre um mês e outro?',
    realData: false, whyIllustrative: 'sem métrica de forma `flow`',
    block: {
      id: 'ex-sankey', type: 'sankey', colSpan: 6,
      title: 'Migração entre faixas de atraso',
      subtitle: 'de maio para junho',
      format: 'number',
      ordem: ['Sem atraso', '1-30', '31-60', '61-90', '90+'],
      fluxos: [
        { origem: 'Sem atraso', destino: 'Sem atraso', value: 2840 },
        { origem: 'Sem atraso', destino: '1-30', value: 186 },
        { origem: '1-30', destino: 'Sem atraso', value: 122 },
        { origem: '1-30', destino: '1-30', value: 94 },
        { origem: '1-30', destino: '31-60', value: 78 },
        { origem: '31-60', destino: '1-30', value: 31 },
        { origem: '31-60', destino: '31-60', value: 42 },
        { origem: '31-60', destino: '61-90', value: 54 },
        { origem: '61-90', destino: '31-60', value: 12 },
        { origem: '61-90', destino: '90+', value: 47 },
        { origem: '90+', destino: '90+', value: 138 },
      ],
    },
  },
  {
    question: 'A carteira é homogênea ou tem metade dela num extremo?',
    realData: false, whyIllustrative: 'sem métrica de forma `distribution`',
    block: {
      id: 'ex-boxplot', type: 'boxplot', colSpan: 4,
      title: 'LTV por safra',
      subtitle: 'mediana, quartis e extremos',
      format: 'percent', decimals: 0,
      grupos: [
        { grupo: '2022', min: 31, q1: 48, mediana: 56, q3: 64, max: 79 },
        { grupo: '2023', min: 34, q1: 52, mediana: 61, q3: 70, max: 84 },
        { grupo: '2024', min: 38, q1: 57, mediana: 68, q3: 78, max: 91 },
        { grupo: '2025', min: 41, q1: 63, mediana: 74, q3: 83, max: 95 },
      ],
    },
  },
];

export const ALL_EXAMPLES: BlockExample[] = [
  ...WITH_REAL_METRIC,
  ...WITHOUT_METRIC_YET,
];

/**
 * Arranjos de coluna — onde a altura de um bloco é imposta pelo vizinho.
 *
 * O grid estica todos os itens da linha até a altura do mais alto. Uma tabela
 * de 4/6 com 20 linhas, ou uma coluna de 2/6 com três blocos empilhados,
 * IMPÕEM a sua altura ao resto da linha. É o caso real do produto, e é o único
 * em que se vê se a área de plotagem cresce junto ou se o card ganha um vazio.
 *
 * As larguras respeitam o contrato: só entram em coluna de 2/6 os blocos cujo
 * `widthOf` aceita 2.
 */
export const LAYOUT_SCENARIOS: Array<{
  title: string;
  proves: string;
  columns: Array<{ span: number; ids: string[] }>;
}> = [
  {
    title: 'Tabela em 4/6 + coluna de 2/6 com três blocos empilhados',
    proves:
      'O caso que você descreveu. Aqui quem dita a altura costuma ser a COLUNA: três '
      + 'blocos de piso 172px somam 516px, mais que a tabela. Quando isso acontece, '
      + 'distribuir não tem o que distribuir — cada bloco já está no piso — e o que se '
      + 'julga é se a tabela preenche, sem faixa branca embaixo das linhas.',
    columns: [
      { span: 4, ids: ['ex-table'] },
      { span: 2, ids: ['ex-kpi', 'ex-gauge', 'ex-progress'] },
    ],
  },
  {
    title: 'Tabela em 4/6 + coluna de 2/6 com DOIS blocos',
    proves:
      'O mesmo arranjo com um bloco a menos, e agora a tabela é a mais alta. É aqui '
      + 'que o controle de empilhamento se vê: em "distribuir" os dois cards crescem '
      + 'e as bordas alinham com a tabela; em "natural" eles ficam no piso e sobra '
      + 'uma faixa vazia embaixo.',
    columns: [
      { span: 4, ids: ['ex-table'] },
      { span: 2, ids: ['ex-kpi', 'ex-gauge'] },
    ],
  },
  {
    title: 'Coluna de 2/6 com dois blocos + gráfico em 4/6',
    proves:
      'Aqui quem dita é o gráfico. Os dois blocos da esquerda precisam ocupar a '
      + 'altura dele sem parecerem esticados nem sobrando.',
    columns: [
      { span: 2, ids: ['ex-kpi', 'ex-progress'] },
      { span: 4, ids: ['ex-chart-line'] },
    ],
  },
  {
    title: 'Matriz de safra em 3/6 + coluna de 3/6 com dois blocos',
    proves:
      'A matriz é o caso mais sensível: as células têm de crescer com o espaço, '
      + 'em vez de ficarem quadradinhos pequenos no canto.',
    columns: [
      { span: 3, ids: ['ex-heatmap'] },
      { span: 3, ids: ['ex-comparison', 'ex-sparkrows'] },
    ],
  },
  {
    title: 'Dispersão em 4/6 + coluna de 2/6 com dois indicadores',
    proves:
      'Plotagem quadrada ao lado de blocos baixos — se a dispersão não crescer, '
      + 'a nuvem de pontos achata e o corte de LTV perde sentido.',
    columns: [
      { span: 4, ids: ['ex-scatter'] },
      { span: 2, ids: ['ex-gauge', 'ex-donut-bar'] },
    ],
  },
  {
    title: 'Três colunas de 2/6, cada uma com dois blocos',
    proves:
      'Sem nenhum bloco alto para ditar a altura, as três colunas se equilibram '
      + 'entre si. É o arranjo mais denso que o grid de 6 permite.',
    columns: [
      { span: 2, ids: ['ex-kpi', 'ex-gauge'] },
      { span: 2, ids: ['ex-progress', 'ex-donut-bar'] },
      { span: 2, ids: ['ex-targets-list', 'ex-kpi'] },
    ],
  },
];

/**
 * Uma linha do relatório de verdade, para julgar PROPORÇÃO.
 *
 * Bloco isolado não revela o defeito que importa: o grid estica todos os itens
 * da linha até a altura do mais alto. Um gauge 60px mais alto que o KPI ao lado
 * não fica mais alto — ele abre um vazio embaixo do número do vizinho. Só se vê
 * com os três lado a lado.
 */
export const PROPORTION_ROWS: Array<{ title: string; ids: string[] }> = [
  {
    title: 'Um número — três blocos de 2/6 fecham a linha',
    ids: ['ex-kpi', 'ex-gauge', 'ex-progress'],
  },
  {
    title: 'KPI com e sem sparkline, lado a lado — a diferença de peso visual',
    ids: ['ex-kpi-sparkline', 'ex-kpi-alerta', 'ex-kpi'],
  },
  {
    title: 'Conjunto — 3/6 + 3/6',
    ids: ['ex-donut', 'ex-sparkrows'],
  },
  {
    title: 'O gauge nas duas variantes — a faixa cabe com os KPIs, o arco não',
    ids: ['ex-gauge-arc', 'ex-gauge', 'ex-kpi'],
  },
  {
    title: 'Faixa compacta ao lado de um conjunto — a exceção sem piso',
    ids: ['ex-donut-bar', 'ex-comparison'],
  },
  {
    title: 'Plotagem cartesiana — 3/6 + 3/6',
    ids: ['ex-chart-line', 'ex-chart-hist'],
  },
];
