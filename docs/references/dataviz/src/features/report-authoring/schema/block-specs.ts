import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * Contrato de bloco — a régua única de layout do canvas.
 *
 * Antes deste arquivo, três componentes mediam a mesma linha com réguas
 * diferentes: o renderer dividia por 6 (`grid grid-cols-6` em `ReportPage.tsx` e
 * `CanvasPanel.tsx`), o `canvas-store` por 3 (`SLOTS_POR_LINHA = 3`), e as tools
 * de autoria travavam `colSpan` em 3 dizendo ao modelo que "1 = 1/3". O
 * resultado é que tudo que a IA criava nascia com metade da largura que ela
 * acreditava ter pedido — um KPI de `colSpan: 1` ocupa 1/6 da tela, não 1/3.
 *
 * Quem consome este módulo: `canvas-store` (encaixe de linha), as tools de
 * autoria (limites e defaults do Zod), o prompt do supervisor (gerado, não
 * escrito à mão) e a validação de `apply-tool-result`. Mudar largura de bloco é
 * mudar aqui — em nenhum outro lugar.
 */

/** Colunas do grid. Casa com `grid-cols-6` de `ReportPage.tsx` e `CanvasPanel.tsx`. */
export const GRID_COLUMNS = 6;

/**
 * Forma do resultado de uma métrica — o que determina qual bloco sabe exibi-la.
 *
 * Não é inferível do catálogo atual: as 64 métricas de produção são
 * `recipe.kind: 'sql'`, e para essas o resolver devolve `outputColumns: []`.
 * Por isso a forma é declarada no documento da métrica (`MetricDoc.shape`).
 */
export type MetricShape =
  | 'scalar'            // 1 linha, 1 coluna `value`
  | 'timeseries'        // { bucket, value }
  | 'timeseries_multi'  // { bucket, serie1, serie2, … }
  | 'timeseries_pivot'  // { bucket, categoria1, …, categoriaN } — para stacked-bar
  | 'breakdown'         // { dimensao, value }
  | 'rows'              // N colunas nomeadas, N linhas
  | 'targets'           // { label, value, target, [warn] } — valor contra a própria meta
  | 'points'            // { x, y, [size], [group] } — uma linha por observação
  | 'matrix'            // { row, col, value } — célula de uma grade
  | 'funnel'            // { etapa, value } — NA ORDEM do fluxo, do topo à base
  | 'flow'              // { origem, destino, value } — migração entre estados
  | 'distribution';     // { grupo, min, q1, mediana, q3, max } — quartis por grupo

export type BlockType = CanvasBlock['type'];

/** Largura em colunas do grid de 6. */
export interface WidthRange {
  /** Abaixo disto o bloco fica ilegível — a tool recusa. */
  min: number;
  /** O que a IA usa quando não há motivo para outra coisa. */
  recommended: number;
  /** Acima disto é desperdício de tela — a tool recusa. */
  max: number;
}

/**
 * O degrau de altura do bloco — parte do contrato, não da folha de estilo.
 *
 * A linha do relatório é um grid que estica todos os itens até a altura do
 * mais alto, então altura decide o que combina com o quê: um bloco de
 * `conjunto` ao lado de três `indicador` faz os três crescerem e mostrarem
 * vazio. Mora aqui, e não no componente, porque é informação que o modelo
 * precisa ANTES de montar a linha. Os pixels de cada degrau vivem em
 * `block-shell`, que os lê daqui.
 */
export type HeightFamily = 'indicador' | 'conjunto' | 'grafico';

/** Uma rota de fuga: quando este bloco não serve, qual serve. */
export interface Alternative {
  /** A condição, na voz do modelo: "acima de 6 categorias". */
  when: string;
  use: BlockType;
}

/** Variante de desenho do mesmo bloco (`display`), e quando escolher cada uma. */
export interface DisplayVariant {
  field: string;
  value: string;
  when: string;
}

export interface BlockSpec {
  type: BlockType;
  /** Nome humano, usado no prompt e nas mensagens de erro. */
  label: string;
  /** Quando usar este bloco. Vai para o prompt do modelo. */
  purpose: string;
  /** Formas de métrica que este bloco sabe renderizar. Vazio = não consome métrica. */
  accepts: readonly MetricShape[];
  /**
   * As colunas que a métrica precisa devolver, com o nome exato.
   *
   * É a informação que mais faltava ao modelo: `aceita: ['points']` diz a
   * FORMA, não os nomes. Um `scatter` apontando para métrica que devolve
   * `ltv`/`atraso` em vez de `x`/`y` monta sem erro e renderiza vazio — o
   * pipeline procura as chaves e não acha. Vazio = o bloco não lê colunas
   * nomeadas (texto, ou consome a primeira coluna que houver).
   */
  expectedColumns: readonly string[];
  span: WidthRange;
  /** Degrau de altura — governa com que blocos ele divide linha. */
  heightFamily?: HeightFamily;
  /** Campos obrigatórios além de `id`, `type` e `colSpan`. */
  requiredFields: readonly string[];
  /** A IA pode criar este bloco? `kpis` é legado. */
  authorable: boolean;
  /** Por que a largura mínima é essa — citado na recusa, para o modelo aprender. */
  widthRationale: string;
  /**
   * Quando NÃO usar.
   *
   * Um catálogo que só diz para que serve cada bloco deixa o modelo escolher
   * pelo primeiro que encaixa na forma. O erro caro é sempre um bloco que
   * ACEITA a métrica e mesmo assim é o formato errado para ela — uma
   * `timeseries` num KPI mostra o primeiro mês como se fosse o valor de hoje.
   */
  whenNotToUse: string;
  /** Para onde ir quando este não serve. */
  alternatives?: readonly Alternative[];
  /** Variantes de `display`, quando existem. */
  variants?: readonly DisplayVariant[];
}

/**
 * Os números de `span` saem de medição, não de gosto. A referência é o pior caso
 * realista — viewport de 1440 com a sidebar de chat aberta (ela abre sozinha ao
 * entrar em edição), o que dá 880px úteis: 1 coluna ≈ 133px, 2 ≈ 282px,
 * 3 ≈ 431px, 6 ≈ 880px.
 */
const SPECS: Record<BlockType, BlockSpec> = {
  text: {
    type: 'text',
    label: 'Texto',
    purpose: 'Título de seção, nota ou explicação em markdown.',
    accepts: [],
    expectedColumns: [],
    span: { min: 1, recommended: 6, max: 6 },
    requiredFields: ['content'],
    authorable: true,
    widthRationale: 'Sem restrição estrutural, mas a 1/6 sobram ~15 caracteres por linha.',
    whenNotToUse:
      'Nunca para número. Valor escrito em markdown é número congelado: não acompanha o '
      + 'filtro de período e envelhece em silêncio dentro do documento.',
    alternatives: [{ when: 'o que você quer mostrar é um número', use: 'kpi' }],
  },

  kpi: {
    type: 'kpi',
    label: 'Indicador (KPI)',
    purpose: 'Um número único e atual: saldo, contagem, percentual. Acompanha o filtro de período.',
    accepts: ['scalar'],
    expectedColumns: ['value'],
    span: { min: 2, recommended: 2, max: 3 },
    heightFamily: 'indicador',
    requiredFields: ['label'],
    authorable: true,
    widthRationale:
      'O valor é renderizado a 30px bold; "R$ 1.234,56 mi" mede ~240px. '
      + 'A 1/6 sobram 93px de conteúdo e o número quebra em três linhas.',
    whenNotToUse:
      'Com métrica de série (`timeseries`): o KPI exibiria o PRIMEIRO ponto como se fosse o '
      + 'valor de hoje — número errado, mostrado com confiança. Também não use quando existe '
      + 'limite contratado a respeitar: sem o limite ao lado, o número não responde "está bem?".',
    alternatives: [
      { when: 'existe um limite ou mínimo contratado', use: 'gauge' },
      { when: 'existe uma meta a atingir', use: 'progress' },
      { when: 'a métrica é uma série no tempo', use: 'comparison' },
    ],
  },

  gauge: {
    type: 'gauge',
    label: 'Indicador com limite',
    purpose:
      'UM número comparado a um limite contratual, com faixas coloridas, marca do limite e a '
      + 'folga até ele. Use para covenant, índice de cobertura, percentual de obra.',
    accepts: ['scalar'],
    expectedColumns: ['value'],
    span: { min: 2, recommended: 2, max: 3 },
    heightFamily: 'indicador',
    requiredFields: ['label', 'threshold'],
    authorable: true,
    widthRationale:
      'O valor (30px) e o medidor dividem o card; a 1/6 o número quebra e a faixa vira um risco.',
    whenNotToUse:
      'Sem um limite conhecido — sem `threshold` o bloco não tem o que comparar e vira um KPI '
      + 'com enfeite. E a partir de DOIS indicadores com limite ele deixa de servir: cada um '
      + 'come 2/6, três fecham a linha, e mínimos diferentes não se comparam entre si.',
    alternatives: [
      { when: 'não há limite contratado', use: 'kpi' },
      { when: 'são dois ou mais indicadores com limite', use: 'targets' },
    ],
    variants: [
      { field: 'display', value: 'meter', when: 'padrão — faixa horizontal, cabe em 2/6 e pesa como um KPI' },
      { field: 'display', value: 'arc', when: 'o covenant é o assunto da linha; exige 3/6 e ocupa a altura de uma composição' },
    ],
  },

  progress: {
    type: 'progress',
    label: 'Realizado vs. meta',
    purpose:
      'Um número contra o previsto, com barra de progresso e percentual atingido. '
      + 'Responde "quanto falta", que o KPI não responde.',
    accepts: ['scalar'],
    expectedColumns: ['value'],
    span: { min: 2, recommended: 2, max: 3 },
    heightFamily: 'indicador',
    requiredFields: ['label', 'target'],
    authorable: true,
    widthRationale:
      'Mesma geometria do KPI — o valor a 30px pede ~240px — mais uma barra que ocupa a largura toda.',
    whenNotToUse:
      'Sem uma meta conhecida. A meta é CONFIGURAÇÃO que você informa (vem do contrato, do '
      + 'orçamento), não sai da consulta — inventar um alvo para preencher o campo produz um '
      + 'percentual que não significa nada.',
    alternatives: [
      { when: 'não há meta', use: 'kpi' },
      { when: 'a meta é um limite a respeitar, não um alvo a atingir', use: 'gauge' },
    ],
  },

  comparison: {
    type: 'comparison',
    label: 'Atual vs. anterior',
    purpose:
      'O número de agora ao lado do anterior, com a diferença entre eles. O app usa os DOIS '
      + 'ÚLTIMOS pontos da série, então "anterior" é o período imediatamente anterior no grão da métrica.',
    accepts: ['timeseries'],
    expectedColumns: ['bucket', 'value'],
    span: { min: 3, recommended: 3, max: 4 },
    heightFamily: 'indicador',
    requiredFields: ['label'],
    authorable: true,
    widthRationale:
      'São DOIS valores lado a lado. A 2/6 sobram 121px por coluna e "R$ 48,2 mi" a 24px mede '
      + '~130px: o número quebra em duas linhas e as colunas desalinham.',
    whenNotToUse:
      'Quando a evolução inteira importa, e não só o último salto — duas barras escondem o que '
      + 'aconteceu no meio. E quando a métrica já é percentual, não esqueça `deltaAsPoints`: '
      + 'sem ele a variação de 5,24% para 4,81% sai como −8,2%, correto e que ninguém usa.',
    alternatives: [{ when: 'a trajetória inteira importa', use: 'chart' }],
  },

  targets: {
    type: 'targets',
    label: 'Indicadores com meta',
    purpose:
      'VÁRIOS indicadores comparados cada um à sua própria meta, na mesma régua (percentual da '
      + 'meta). Métrica de forma `targets`. Use para o conjunto de covenants, limites de '
      + 'concentração ou metas de repasse.',
    accepts: ['targets'],
    expectedColumns: ['label', 'value', 'target', 'warn'],
    span: { min: 3, recommended: 4, max: 6 },
    heightFamily: 'conjunto',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'A barra de cada item precisa de ~200px para a marca da meta não colidir com as faixas, '
      + 'e o rótulo mais o valor comem ~180px acima dela.',
    whenNotToUse:
      'Para UM indicador só — uma barra sozinha com eixo em % da meta é mais aparato que '
      + 'informação. E quando os itens não têm meta: sem `target` por linha não há régua comum, '
      + 'que é a única razão deste bloco existir.',
    alternatives: [{ when: 'é um indicador só', use: 'gauge' }],
    variants: [
      { field: 'display', value: 'bullet', when: 'padrão — barras com faixas; mostra QUANTO falta para a meta' },
      { field: 'display', value: 'list', when: 'acima de ~5 indicadores; cabe mais itens, sem mostrar a distância' },
    ],
  },

  sparkrows: {
    type: 'sparkrows',
    label: 'Tendência por métrica',
    purpose:
      'Várias séries com histórico, uma por linha, cada uma com curva e valor atual. Métrica de '
      + 'forma `timeseries_multi` — cada coluna que não é o bucket vira uma linha do bloco.',
    accepts: ['timeseries_multi'],
    expectedColumns: ['bucket', '<uma coluna por série>'],
    span: { min: 3, recommended: 3, max: 6 },
    heightFamily: 'conjunto',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'A curva ocupa a linha inteira abaixo do rótulo; abaixo de 3 colunas ela fica curta demais '
      + 'para a forma da série se distinguir de um risco reto.',
    whenNotToUse:
      'Para destacar UM indicador — aqui o número perde peso de propósito, em troca da '
      + 'tendência. E com séries de dois ou três pontos: uma curva de dois pontos é uma reta, '
      + 'que mostra direção e nunca forma.',
    alternatives: [
      { when: 'é um indicador só e o número importa', use: 'kpi' },
      { when: 'a série tem poucos pontos', use: 'comparison' },
    ],
  },

  donut: {
    type: 'donut',
    label: 'Composição',
    purpose:
      'Como um total se reparte em poucas categorias (até ~6). Métrica de forma `breakdown`, '
      + 'com exatamente DUAS colunas — a dimensão e o valor.',
    accepts: ['breakdown'],
    expectedColumns: ['<dimensão>', 'value'],
    span: { min: 2, recommended: 3, max: 4 },
    heightFamily: 'conjunto',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'A rosca e os cards laterais somam ~326px. A 2/6 sobram 66px para os cards.',
    whenNotToUse:
      'Com três ou mais colunas na métrica: a mesma categoria se repete em linhas diferentes e a '
      + 'rosca SOMA ERRADO. Acima de ~6 categorias as fatias ficam indistinguíveis. E quando a '
      + 'composição muda no tempo, uma foto de um instante esconde justamente o que interessa.',
    alternatives: [
      { when: 'acima de 6 categorias', use: 'chart' },
      { when: 'a composição muda ao longo do tempo', use: 'chart' },
    ],
    variants: [
      { field: 'display', value: 'donut', when: 'padrão — rosca com total no centro' },
      { field: 'display', value: 'bar', when: 'a composição é contexto de outro bloco; barra 100% em ~1/3 da altura' },
    ],
  },

  chart: {
    type: 'chart',
    label: 'Gráfico',
    purpose:
      'Série ao longo do tempo ou comparação entre categorias. line/area = temporal, '
      + 'bar = categorias, stacked-bar = composição no tempo, composed = barras + linhas, '
      + 'waterfall = variações que somam a um total, histogram = distribuição por faixa.',
    accepts: ['timeseries', 'timeseries_multi', 'timeseries_pivot', 'breakdown'],
    expectedColumns: ['bucket', 'value'],
    span: { min: 2, recommended: 3, max: 6 },
    heightFamily: 'grafico',
    requiredFields: ['chartType', 'xAxisKey', 'dataKeys'],
    authorable: true,
    widthRationale:
      'A altura de plotagem parte de 340px e o eixo Y reserva ~60px. A 1/6 sobram 33px de área '
      + 'útil, e o bloco fica 3,6× mais alto que largo.',
    whenNotToUse:
      'Com métrica `scalar`: um número só vira um ponto solto, sem eixo que o explique. Para '
      + 'séries com unidades diferentes (R$ com %), NÃO deixe no eixo único — declare '
      + '`rightAxisKeys`, senão a série percentual desenha colada no zero e não se lê.',
    alternatives: [
      { when: 'a métrica é um número único', use: 'kpi' },
      { when: 'cada linha é uma observação (x, y)', use: 'scatter' },
    ],
  },

  scatter: {
    type: 'scatter',
    label: 'Dispersão',
    purpose:
      'Uma observação por ponto, para ver agrupamento e outliers — LTV × atraso, ticket × prazo. '
      + 'Métrica de forma `points`. As linhas de corte (`xReference`) são o que transforma a '
      + 'nuvem em decisão.',
    accepts: ['points'],
    expectedColumns: ['x', 'y', 'size', 'group'],
    span: { min: 3, recommended: 3, max: 6 },
    heightFamily: 'grafico',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'A área de plotagem é quadrada por natureza — eixos comparáveis. A 2/6 ela fica com 242px '
      + 'de largura para 300px de altura, e a nuvem achata na horizontal.',
    whenNotToUse:
      'Para série no tempo — o eixo X aqui é uma grandeza, não uma data. E com poucas dezenas de '
      + 'pontos: sem massa não há nuvem, e uma tabela diz mais.',
    alternatives: [
      { when: 'o eixo X é tempo', use: 'chart' },
      { when: 'são poucas observações', use: 'table' },
    ],
  },

  heatmap: {
    type: 'heatmap',
    label: 'Matriz de intensidade',
    purpose:
      'Grade linha × coluna pintada pela intensidade do valor. Métrica de forma `matrix`. O caso '
      + 'clássico é a análise de safra: originação nas linhas, meses decorridos nas colunas, '
      + 'inadimplência no valor. Célula ausente fica vazia, e não zero.',
    accepts: ['matrix'],
    expectedColumns: ['row', 'col', 'value'],
    span: { min: 3, recommended: 4, max: 6 },
    heightFamily: 'conjunto',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'O eixo de linhas reserva 56px fixos e cada coluna precisa de ~46px para o rótulo caber sem '
      + 'girar. Com 5 colunas isso já soma 286px.',
    whenNotToUse:
      'Com uma dimensão só — sem as duas, a grade tem uma faixa e vira um gráfico de barras pior. '
      + 'E quando o valor exato importa mais que o padrão: intensidade se lê por ordenação, não '
      + 'por leitura de número.',
    alternatives: [
      { when: 'há uma dimensão só', use: 'chart' },
      { when: 'o número exato de cada célula importa', use: 'table' },
    ],
  },

  table: {
    type: 'table',
    label: 'Tabela',
    purpose: 'Detalhe linha a linha, quando o usuário precisa ver os registros e não o agregado.',
    accepts: ['rows'],
    expectedColumns: ['<uma por accessorKey declarada em columns>'],
    span: { min: 3, recommended: 6, max: 6 },
    requiredFields: ['columns'],
    authorable: true,
    widthRationale:
      'As células não quebram texto (`whitespace-nowrap`): apertar não reflui, gera scroll '
      + 'horizontal dentro do card. O cabeçalho ainda carrega ~230px de controles fixos.',
    whenNotToUse:
      'Como resumo de página. Tabela é o destino de quem já sabe o que procura; abrir um '
      + 'relatório com ela obriga o leitor a agregar de cabeça o que um indicador diria de uma vez.',
    alternatives: [
      { when: 'o que importa é o agregado', use: 'kpi' },
      { when: 'o que importa é a distribuição', use: 'chart' },
    ],
  },

  funnel: {
    type: 'funnel',
    label: 'Funil',
    purpose:
      'Um fluxo com perda em cada etapa — a esteira de repasse é o caso: elegíveis → aprovados '
      + 'pelo banco → repassados → liquidados. Mostra ONDE a perda é maior, que quatro KPIs '
      + 'soltos não mostram. Métrica de forma `funnel`, com as etapas NA ORDEM do fluxo.',
    accepts: ['funnel'],
    expectedColumns: ['etapa', 'value'],
    span: { min: 3, recommended: 3, max: 6 },
    heightFamily: 'grafico',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'Cada etapa carrega o rótulo à direita do trapézio, e "Aprovados pelo banco" mede ~150px. '
      + 'A 2/6 sobram 92px para o desenho, e o funil vira uma faixa.',
    whenNotToUse:
      'Quando as etapas não são um FLUXO — se um item não sai do anterior, o afunilamento é '
      + 'uma mentira visual e uma barra diz melhor. E quando a ordem vem do valor e não do '
      + 'processo: funil reordenado por tamanho deixa de ser funil.',
    alternatives: [
      { when: 'as categorias não têm sequência', use: 'chart' },
      { when: 'a composição de um total importa mais que a perda', use: 'donut' },
    ],
  },

  sankey: {
    type: 'sankey',
    label: 'Matriz de migração',
    purpose:
      'Quem saiu de um estado e foi para outro entre dois períodos — quem estava em 1–30 dias '
      + 'de atraso e foi para 31–60. ANTECIPA a inadimplência: o estoque só mostra o resultado '
      + 'depois de consumado. Métrica de forma `flow`.',
    accepts: ['flow'],
    expectedColumns: ['origem', 'destino', 'value'],
    span: { min: 4, recommended: 6, max: 6 },
    heightFamily: 'grafico',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'São duas colunas de rótulos, uma em cada ponta, somando ~190px, e as fitas precisam de '
      + 'travessia para o cruzamento se ler. A 3/6 sobram 240px de fita.',
    whenNotToUse:
      'Para composição de um instante — sem DOIS momentos não há migração, e o desenho vira uma '
      + 'rosca torta. E com mais de ~6 estados de cada lado: acima disso as fitas se cruzam '
      + 'tanto que a leitura se perde.',
    alternatives: [
      { when: 'é a composição de um instante', use: 'donut' },
      { when: 'a evolução por faixa ao longo do tempo basta', use: 'chart' },
    ],
  },

  boxplot: {
    type: 'boxplot',
    label: 'Dispersão por grupo',
    purpose:
      'Como os valores se espalham DENTRO de cada grupo — mediana, quartis e extremos por safra. '
      + 'Uma carteira com LTV médio de 68% pode ser homogênea ou ter metade acima de 85%, e a '
      + 'média não distingue. Métrica de forma `distribution`, com os quartis já calculados no SQL.',
    accepts: ['distribution'],
    expectedColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'],
    span: { min: 3, recommended: 4, max: 6 },
    heightFamily: 'grafico',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'Cada caixa precisa de ~48px para os bigodes não colidirem com a vizinha, e o eixo de '
      + 'valores reserva ~60px. Com quatro grupos isso já soma 252px.',
    whenNotToUse:
      'Para um grupo só — aí o histograma mostra a forma inteira da distribuição, e não cinco '
      + 'números dela. E quando o público não lê quartil: a caixa é densa, e uma leitura errada '
      + 'dela é pior que a média que ela veio substituir.',
    alternatives: [
      { when: 'é um grupo só', use: 'chart' },
      { when: 'o que importa é a soma por grupo', use: 'chart' },
    ],
  },

  treemap: {
    type: 'treemap',
    label: 'Peso por área',
    purpose:
      'Concentração quando há MUITAS categorias de tamanhos muito desiguais: acima de ~8 as '
      + 'fatias de uma rosca ficam indistinguíveis e a área continua legível. '
      + 'Métrica de forma `breakdown`, a mesma da rosca.',
    accepts: ['breakdown'],
    expectedColumns: ['<dimensão>', 'value'],
    span: { min: 3, recommended: 4, max: 6 },
    heightFamily: 'conjunto',
    requiredFields: [],
    authorable: true,
    widthRationale:
      'O rótulo só cabe em bloco acima de ~88px de largura; abaixo disso a área vira mancha sem '
      + 'nome e só o tooltip informa.',
    whenNotToUse:
      'Com poucas categorias — até ~8 a rosca diz o mesmo com menos aparato, e com duas ou três '
      + 'o treemap desenha um retângulo gigante que não informa nada. E quando o valor exato '
      + 'importa: área se compara mal a olho, muito pior que ângulo ou comprimento.',
    alternatives: [
      { when: 'são até ~8 categorias', use: 'donut' },
      { when: 'o valor exato de cada categoria importa', use: 'table' },
    ],
  },

  // ── Não-autoráveis ────────────────────────────────────────────────────────

  kpis: {
    type: 'kpis',
    label: 'Grupo de KPIs (legado)',
    purpose: 'Legado sem produtor. `flattenKpiBlocks` o explode em blocos `kpi` avulsos na carga.',
    accepts: [],
    expectedColumns: [],
    span: { min: 6, recommended: 6, max: 6 },
    requiredFields: ['items'],
    authorable: false,
    widthRationale: 'Desenha uma grade própria de até 3 colunas dentro da célula.',
    whenNotToUse: 'Sempre — é legado. Crie blocos `kpi` avulsos.',
    alternatives: [{ when: 'em qualquer caso', use: 'kpi' }],
  },
};

/**
 * Opções que mudam a largura necessária dentro de um mesmo tipo.
 *
 * Um gráfico de barra horizontal e um de linha são ambos `chart`, mas o
 * horizontal reserva 120px fixos só para o eixo de categoria.
 */
export interface WidthContext {
  chartType?: string;
  /** `'horizontal'` põe a categoria no eixo Y e reserva 120px fixos. */
  layout?: 'vertical' | 'horizontal';
  /** Donut sem cards laterais dispensa a faixa de 150px à direita. */
  showLegendCards?: boolean;
  /** Número de colunas da tabela. */
  columns?: number;
  /**
   * Variante de desenho do bloco — `donut`/`bar` no donut, `bullet`/`list` nos
   * targets. Muda a geometria, logo muda a largura mínima.
   */
  display?: string;
  /** Séries no eixo Y direito: reserva mais ~60px de eixo. */
  rightAxis?: boolean;
}

/** O spec bruto do tipo, sem ajuste por configuração. */
export function blockSpec(type: BlockType): BlockSpec {
  return SPECS[type];
}

/** Todos os specs que a IA pode criar. */
export function authorableSpecs(): BlockSpec[] {
  return Object.values(SPECS).filter((s) => s.authorable);
}

/**
 * A faixa de largura válida para este bloco NESTA configuração.
 *
 * O spec dá o caso geral; aqui entram as exceções que dependem de campo do
 * próprio bloco e que, ignoradas, produzem o bloco ilegível mesmo dentro da
 * faixa "válida" do tipo.
 */
export function widthOf(type: BlockType, ctx: WidthContext = {}): WidthRange {
  const base = SPECS[type].span;

  if (type === 'chart') {
    // Dois eixos de valor comem ~120px antes da área de plotagem — e um gráfico
    // de eixo duplo existe para comparar séries, o que exige espaço horizontal.
    if (ctx.rightAxis) return { min: 4, recommended: 6, max: 6 };
    // Eixo de categoria fixo em 120px: a 3/6 sobrariam 271px de barra.
    if (ctx.layout === 'horizontal') return { min: 4, recommended: 6, max: 6 };
    /*
     * Pareto tem barras ordenadas MAIS a curva acumulada num segundo eixo, e
     * rótulos de categoria inclinados embaixo. É o composto com mais coisa na
     * mesma caixa.
     */
    if (ctx.chartType === 'pareto') return { min: 4, recommended: 6, max: 6 };
    // Empilhado e composto carregam legenda sempre visível e mais séries.
    if (ctx.chartType === 'stacked-bar' || ctx.chartType === 'composed') {
      return { min: 3, recommended: 6, max: 6 };
    }
    return base;
  }

  if (type === 'donut') {
    // Barra de linha única: sem rosca de 160px nem cards laterais, o bloco é
    // uma faixa horizontal — cabe em 2 e ganha pouco acima de 3.
    if (ctx.display === 'bar') return { min: 2, recommended: 3, max: 6 };
    if (ctx.showLegendCards === false) return { min: 2, recommended: 2, max: 3 };
    return base;
  }

  // Lista compacta não desenha barra: só semáforo, nome e valor.
  if (type === 'targets' && ctx.display === 'list') {
    return { min: 2, recommended: 3, max: 6 };
  }

  /*
   * O arco do gauge não cabe em 2/6. O semicírculo precisa de ~216px de largura
   * para o número caber no vão interno a 30px; a 2/6 sobram 242px e o arco sai
   * espremido, com o valor atravessando o traço. A faixa horizontal (default)
   * diz a mesma coisa em 14px de altura e cabe.
   */
  if (type === 'gauge' && ctx.display === 'arc') {
    return { min: 3, recommended: 3, max: 4 };
  }

  if (type === 'table') {
    // ~100px por coluna `nowrap`; a partir de 4 colunas nada abaixo de 6 serve.
    if ((ctx.columns ?? 0) >= 4) return { min: 6, recommended: 6, max: 6 };
    return base;
  }

  return base;
}

/**
 * Ajusta uma largura pedida para dentro da faixa válida.
 *
 * Usado nas tools (antes de devolver o bloco) e em `apply-tool-result` (antes de
 * aplicar), porque bloco também chega de template e de import.
 */
export function normalizeWidth(
  type: BlockType,
  requested: number | undefined,
  ctx: WidthContext = {},
): number {
  const { min, recommended, max } = widthOf(type, ctx);
  if (requested === undefined) return recommended;
  return Math.min(Math.max(Math.round(requested), min), max);
}

/** Quantos blocos deste tipo cabem numa linha, na largura recomendada. */
export function perRow(type: BlockType, ctx: WidthContext = {}): number {
  return Math.floor(GRID_COLUMNS / widthOf(type, ctx).recommended);
}

/** Este bloco sabe renderizar uma métrica desta forma? */
export function acceptsShape(type: BlockType, shape: MetricShape): boolean {
  return SPECS[type].accepts.includes(shape);
}

/**
 * Blocos que servem para uma forma de métrica, do mais adequado ao menos.
 *
 * A ordem é a recomendação: para `breakdown`, a rosca vem antes do gráfico de
 * barra porque composição de um total lê melhor em rosca até ~6 categorias.
 */
const PREFERENCE: Record<MetricShape, readonly BlockType[]> = {
  scalar: ['kpi', 'gauge', 'progress'],
  timeseries: ['chart', 'comparison'],
  timeseries_multi: ['chart', 'sparkrows'],
  timeseries_pivot: ['chart'],
  breakdown: ['donut', 'chart'],
  rows: ['table'],
  targets: ['targets'],
  points: ['scatter'],
  matrix: ['heatmap'],
  funnel: ['funnel'],
  flow: ['sankey'],
  distribution: ['boxplot'],
};

export function blocksForShape(shape: MetricShape): readonly BlockType[] {
  return PREFERENCE[shape];
}

/** O bloco de primeira escolha para uma forma. */
export function preferredBlock(shape: MetricShape): BlockType {
  const [first] = PREFERENCE[shape];
  // O mapa é exaustivo sobre MetricShape e nenhuma entrada é vazia.
  return first ?? 'text';
}

/**
 * Regra de encaixe: o bloco entra na linha corrente ou abre a próxima.
 *
 * Mora aqui, e não no store, porque dois lugares precisam da MESMA regra — o
 * store, ao aplicar, e o registro do turno, ao dizer ao modelo onde o bloco
 * caiu. Duas implementações da mesma regra é como o `addBlock` e o `moveBlock`
 * chegaram a discordar sobre o que cabe numa linha.
 */
export function fitsInRow(used: number, width: number): boolean {
  return used + width <= GRID_COLUMNS;
}

/** Extrai do próprio bloco as opções que mudam sua largura mínima. */
export function widthContextOf(block: CanvasBlock): WidthContext {
  const ctx: WidthContext = {};
  if (block.type === 'chart') {
    ctx.chartType = block.chartType;
    if (block.layout !== undefined) ctx.layout = block.layout;
    if (block.rightAxisKeys?.length) ctx.rightAxis = true;
  }
  if (block.type === 'donut') {
    if (block.showLegendCards !== undefined) ctx.showLegendCards = block.showLegendCards;
    if (block.display !== undefined) ctx.display = block.display;
  }
  if (block.type === 'targets' && block.display !== undefined) {
    ctx.display = block.display;
  }
  if (block.type === 'gauge' && block.display !== undefined) {
    ctx.display = block.display;
  }
  if (block.type === 'table') {
    ctx.columns = block.columns.length;
  }
  return ctx;
}

/**
 * Largura efetiva do bloco no grid de 6.
 *
 * Ponto de entrada único para "quanto este bloco ocupa": o que ele declarou,
 * ajustado à faixa do tipo, ou o recomendado quando não declarou nada. O store
 * usa para encaixar linha e `apply-tool-result` para normalizar o que chega.
 */
export function blockWidth(block: CanvasBlock): number {
  return normalizeWidth(block.type, block.colSpan, widthContextOf(block));
}
