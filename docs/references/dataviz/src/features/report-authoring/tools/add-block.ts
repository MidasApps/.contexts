import { tool } from 'ai';
import { z } from 'zod';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { rejectUnknownMetric, type MetricCatalog } from './metric-guard';
import {
  widthField, metricField, pageField, positionField, seriesProjectionField, projectionField,
  resolveWidth, sparklineDataField, sparklineMetricField, replaceField,
} from './common-fields';
import type { WidthContext } from '../schema/block-specs';
import type { TurnLog } from '../schema/turn-log';

/**
 * Tools de autoria de bloco — uma por tipo.
 *
 * Uma tool por tipo, e não uma só com `discriminatedUnion`, porque o Gemini
 * segue mal união discriminada; schema achatado ele obedece.
 *
 * **Bloco aponta para métrica; não carrega número.** Elas nasceram na era do
 * canvas, quando a IA consultava o BigQuery e colava o valor formatado dentro do
 * bloco (`value: "R$ 1.200.000,00"`, dez pontos de sparkline no payload). Com a
 * camada semântica (ADR-0015) quem busca dado é o app — `useReportData` junta os
 * `metricId` da página e chama `/api/metrics/batch`, refazendo a busca quando o
 * filtro de período muda. Um valor literal não tem como acompanhar esse filtro:
 * é número congelado no documento. Por isso `value`, `data` e `rows` saíram do
 * schema — o bloco declara QUAL métrica mostra, e o pipeline preenche.
 *
 * **Largura vem do contrato de bloco**, nunca de número escrito aqui. As tools
 * declaravam `.min(1).max(3)` com o texto "1=1/3, 2=2/3, 3=full" enquanto o grid
 * real é de 6 colunas: tudo que a IA criava nascia com metade da largura que ela
 * acreditava ter pedido, e nenhuma tabela chegava ao 6 que a produção usa.
 */

/** Dependências que todas as tools de criação compartilham. */
export interface CreateDeps {
  catalog?: MetricCatalog;
  /** Diz ao modelo em que linha o bloco caiu e quanto sobrou nela. */
  turnLog?: TurnLog;
}

/**
 * Monta a resposta da tool.
 *
 * O resultado era o eco do próprio input: o modelo aprendia o `id` sorteado e
 * mais nada — não sabia se o bloco entrou, em que linha caiu, nem quanto restou
 * da linha. Como o empacotamento é determinístico, dá para contar isso aqui.
 */
function addResponse(args: {
  block: CanvasBlock;
  pageIndex: number | undefined;
  aviso?: string | undefined;
  registro?: TurnLog | undefined;
}) {
  /*
   * `substituiBlockId` chega DENTRO do bloco porque cada tool espalha o resto
   * dos campos (`...campos`) na construção — e ele não é conteúdo de bloco, é
   * instrução de onde pôr. Extrair aqui, num lugar só, evita repetir a
   * desestruturação nas doze tools de criação.
   */
  const {
    substituiBlockId: replaceBlockId, posicao: placement, ...blockFields
  } = args.block as CanvasBlock & { substituiBlockId?: string; posicao?: 'topo' | 'fim' };
  const block = blockFields as CanvasBlock;
  const layoutPosition = args.registro?.register(block);
  return {
    action: 'add_block',
    pageIndex: args.pageIndex ?? 0,
    block,
    ...(replaceBlockId ? { substituiBlockId: replaceBlockId } : {}),
    // O aplicador insere a linha neste índice; 0 é o topo da página.
    ...(placement === 'topo' ? { position: 0 } : {}),
    ...(args.aviso ? { aviso: args.aviso } : {}),
    ...(layoutPosition ? { layout: layoutPosition } : {}),
  };
}

export function createAddTextBlockTool(deps: CreateDeps = {}) {
  return tool({
    description: 'Adiciona um bloco de texto (markdown) a uma página. Use para título de seção, nota ou explicação — não para número.',
    inputSchema: z.object({
      pageIndex: pageField,
      content: z.string().describe('Conteúdo em markdown'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('text'),
    }),
    execute: async ({ pageIndex, content, colSpan }) => {
      const width = resolveWidth('text', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'text', content, colSpan: width.colSpan,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Adds a single KPI indicator as an independent block */
export function createAddKpiBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona UM indicador KPI como bloco independente, ligado a uma métrica do catálogo. '
      + 'Use para métrica de forma `scalar` — um número único e atual. '
      + 'O valor é buscado pelo app e acompanha o filtro de período — não passe número.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      label: z.string().describe('Rótulo do KPI (ex: "Saldo Devedor Total")'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Como formatar o valor que vier da métrica. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais em number/percent'),
      suffix: z.string().optional().describe('Sufixo do valor (ex: "x")'),
      description: z.string().optional().describe('Descrição breve para o tooltip (i)'),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim (inadimplência, PDD). Default: true'),
      alertThreshold: z.number().optional().describe('Acende alerta visual quando o valor bruto passa deste limite (ex: inadimplência > 0.05)'),
      sparklineMetricId: sparklineMetricField,
      sparklineData: sparklineDataField,
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('kpi'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      // A série da sparkline é métrica como qualquer outra: id inventado aqui
      // desenharia um card com curva vazia e nenhum erro visível.
      if (fields.sparklineMetricId) {
        const curveRefusal = rejectUnknownMetric(deps.catalog, fields.sparklineMetricId);
        if (curveRefusal) return curveRefusal;
      }
      const width = resolveWidth('kpi', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'kpi', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/**
 * Indicador com limite contratual.
 *
 * O bloco existe e renderiza desde sempre, mas não tinha tool: a IA não
 * alcançava justamente o formato certo para covenant, que é o assunto do
 * produto. `value` nasce em 0 como nos templates — quem preenche é o pipeline, e
 * `awaitingFirstData` segura a cor até o dado chegar (0 num covenant de mínimo
 * 1,20x seria pintado de rompimento).
 */
export function createAddGaugeBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um indicador com limite: número único comparado a um mínimo aceitável, com cor '
      + 'condicional (verde acima do limite, âmbar na faixa de atenção, vermelho abaixo). '
      + 'Use para covenant, índice de cobertura, percentual de obra — onde existe limite a respeitar. '
      + 'Métrica de forma `scalar`.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      label: z.string().describe('Rótulo do indicador (ex: "Índice de Cobertura")'),
      threshold: z.number().describe('Limite mínimo aceitável. Igual ou acima disso = verde. Com format percent, em PONTOS: 5 = 5% (o valor da métrica chega em pontos, seja qual for a escala dela).'),
      warnThreshold: z.number().optional().describe('Limite de atenção: entre threshold e este valor pinta âmbar. Com format percent, em PONTOS: 5 = 5% (o valor da métrica chega em pontos, seja qual for a escala dela).'),
      description: z.string().optional().describe('Linha secundária explicando o limite'),
      suffix: z.string().optional().describe('Sufixo do valor (ex: "x", "%")'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais. Default: 2'),
      reverseScale: z.boolean().optional().describe('true quando quanto MAIOR pior. Default: false'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação do valor. Default: number'),
      display: z.enum(['meter', 'arc']).optional()
        .describe(
          '"meter" (default) é uma faixa horizontal sob o número: cabe em 2 colunas e o bloco '
          + 'pesa como um KPI, com quem divide linha. "arc" é o semicírculo com o número dentro — '
          + 'lê-se de relance e destaca mais, mas exige 3 colunas e ocupa a altura de uma '
          + 'composição. Use "arc" quando o covenant é o assunto da linha; "meter" quando é um '
          + 'número entre outros.',
        ),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('gauge'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const ctx: WidthContext = fields.display !== undefined ? { display: fields.display } : {};
      const width = resolveWidth('gauge', colSpan, ctx);
      const block = {
        id: crypto.randomUUID(), type: 'gauge', colSpan: width.colSpan, metricId, value: 0, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/**
 * Rosca de composição.
 *
 * Também existia sem tool — e é o bloco certo para métrica de forma `breakdown`,
 * que a IA vinha jogando em gráfico de barra ou, pior, em KPI.
 */
export function createAddDonutBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona uma rosca de composição: mostra como um total se reparte em poucas categorias '
      + '(até ~6). Métrica de forma `breakdown`. Acima de 6 categorias prefira '
      + 'add_chart_block com chartType "bar" e layout "horizontal".',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título da rosca'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      centerLabel: z.string().optional().describe('Rótulo do centro. Default: "Total"'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação do valor central e dos cards. Default: number'),
      showLegendCards: z.boolean().optional().describe('Cards laterais com valor e % por fatia. Default: true. Com false o bloco cabe em 2 colunas.'),
      display: z.enum(['donut', 'bar']).optional()
        .describe(
          'Como desenhar. "donut" (default) é a rosca com total no centro. "bar" é uma barra 100% '
          + 'de linha única com legenda embaixo — mesma informação em ~1/3 da altura. Use "bar" '
          + 'quando a composição é contexto de outro bloco e não o assunto da linha.',
        ),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('donut'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const ctx: WidthContext = {
        ...(fields.showLegendCards !== undefined ? { showLegendCards: fields.showLegendCards } : {}),
        ...(fields.display !== undefined ? { display: fields.display } : {}),
      };
      const width = resolveWidth('donut', colSpan, ctx);
      const block = {
        id: crypto.randomUUID(), type: 'donut', colSpan: width.colSpan, metricId, slices: [], ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

export function createAddChartBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um bloco de gráfico ligado a uma métrica do catálogo. As séries são buscadas pelo app '
      + 'e acompanham o filtro de período — não passe dados. Para projeção, use `projecao: true`, '
      + 'senão a curva do futuro é cortada pelo filtro.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      chartType: z.enum(['bar', 'line', 'area', 'composed', 'stacked-bar', 'waterfall', 'histogram', 'pareto'])
        .describe(
          'line=série no tempo, area=volume no tempo, bar=comparação entre categorias, '
          + 'stacked-bar=composição no tempo (forma `timeseries_pivot`), '
          + 'composed=barras + linhas, waterfall=variações que somam a um total, '
          + 'histogram=distribuição por faixa (barras encostadas; a métrica entrega as faixas já agrupadas), '
          + 'pareto=barras ordenadas do maior ao menor mais a curva do acumulado, para responder '
          + 'quais poucos concentram a maior parte (a ordenação é do desenho, não do SQL).',
        ),
      title: z.string().optional().describe('Título do gráfico'),
      subtitle: z.string().optional().describe('Linha de apoio abaixo do título'),
      xAxisKey: z.string().describe('Nome do campo do eixo X (ex: "mes"). O resolver entrega a coluna como `bucket` e ela é renomeada para este nome.'),
      dataKeys: z.array(z.string()).describe('Nomes das séries do eixo Y (ex: ["saldo"]). A primeira recebe a coluna `value` do resolver. Em métrica pivotada, use os nomes reais das colunas.'),
      layout: z.enum(['vertical', 'horizontal']).optional()
        .describe('Só em bar/stacked-bar. "horizontal" põe a categoria no eixo Y — bom para nome de categoria longo, e exige largura 4 ou mais.'),
      stackOffset: z.enum(['none', 'expand']).optional()
        .describe('Só em stacked-bar. "expand" normaliza para 100% (proporção por categoria).'),
      rightAxisKeys: z.array(z.string()).optional()
        .describe(
          'Séries que vão para um SEGUNDO eixo Y, à direita. Subconjunto de dataKeys. '
          + 'Use quando as séries têm unidades ou ordens de grandeza diferentes — saldo em R$ '
          + 'com taxa em %: num eixo só a linha percentual desenha colada no zero e não se lê. '
          + 'NÃO use para séries comparáveis: dois eixos distorcem a comparação. Exige largura 4+.',
        ),
      legendaInterativa: z.boolean().optional()
        .describe(
          'Clicar num item da legenda esconde a série. Use a partir de ~4 séries, onde isolar '
          + 'uma é a diferença entre legível e ilegível. Esconde SÉRIE, não período — o filtro '
          + 'de período é global e continua sendo o único dono do recorte no tempo.',
        ),
      leftAxisLabel: z.string().optional().describe('Rótulo do eixo esquerdo (ex: "R$")'),
      rightAxisLabel: z.string().optional().describe('Rótulo do eixo direito (ex: "%")'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('chart'),
      ignorePeriodFilter: projectionField,
      projectedData: seriesProjectionField,
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const ctx: WidthContext = { chartType: fields.chartType };
      if (fields.layout !== undefined) ctx.layout = fields.layout;
      if (fields.rightAxisKeys?.length) ctx.rightAxis = true;
      const width = resolveWidth('chart', colSpan, ctx);
      const block = {
        id: crypto.randomUUID(), type: 'chart', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/**
 * Vários indicadores contra as próprias metas.
 *
 * O gauge resolve UM covenant; a partir de dois ele deixa de servir, porque
 * mínimos diferentes não se comparam em valor absoluto e três gauges já fecham
 * a linha. Aqui a régua é a distância da meta, comum a todos.
 */
export function createAddTargetsBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um bloco com VÁRIOS indicadores, cada um comparado à sua própria meta. '
      + 'Métrica de forma `targets` (colunas `label`, `value`, `target` e opcionalmente `warn`). '
      + 'Use para o conjunto de covenants, limites de concentração ou metas de repasse. '
      + 'Para UM indicador com limite, use add_gauge_block.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco (ex: "Covenants — posição atual")'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      display: z.enum(['bullet', 'list']).optional()
        .describe(
          '"bullet" (default) desenha barras com faixas e a marca da meta — mostra QUANTO falta. '
          + '"list" é uma lista compacta com semáforo: cabe mais itens na mesma altura, '
          + 'mas não mostra a distância. Use "list" acima de ~5 indicadores.',
        ),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação dos valores. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      suffix: z.string().optional().describe('Sufixo dos valores (ex: "x")'),
      reverseScale: z.boolean().optional()
        .describe('true quando MAIOR é pior para todos os itens (ex: limites de concentração). Default: false'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('targets'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const ctx: WidthContext = fields.display !== undefined ? { display: fields.display } : {};
      const width = resolveWidth('targets', colSpan, ctx);
      const block = {
        id: crypto.randomUUID(), type: 'targets', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Realizado contra o previsto — a pergunta "quanto falta", que o KPI não responde. */
export function createAddProgressBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um indicador de realizado vs. meta, com barra de progresso e percentual atingido. '
      + 'Métrica de forma `scalar` — o realizado vem dela. A META é informada por você aqui: '
      + 'ela vem do contrato ou do orçamento, não da consulta. Sem uma meta conhecida, '
      + 'use add_kpi_block.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      label: z.string().describe('Rótulo do indicador (ex: "Repasses no mês")'),
      target: z.number().describe('A meta. Configuração do bloco — não vem da métrica. Com format percent, em PONTOS: 5 = 5% (o valor da métrica chega em pontos, seja qual for a escala dela).'),
      targetLabel: z.string().optional().describe('Como chamar a meta na linha de apoio. Default: "previstos"'),
      description: z.string().optional().describe('Linha secundária'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      suffix: z.string().optional().describe('Sufixo do valor'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('progress'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('progress', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'progress', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** O número de agora ao lado do de antes — comparação como conteúdo, não tooltip. */
export function createAddComparisonBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona uma comparação entre o período atual e o anterior, com a diferença entre eles. '
      + 'Métrica de forma `timeseries` — o app usa os DOIS ÚLTIMOS pontos da série, então '
      + '"anterior" é o período imediatamente anterior no grão da métrica.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      label: z.string().describe('Rótulo do indicador comparado'),
      currentLabel: z.string().optional().describe('Rótulo da coluna atual. Default: "Atual"'),
      previousLabel: z.string().optional().describe('Rótulo da coluna anterior. Default: "Anterior"'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      suffix: z.string().optional().describe('Sufixo dos valores'),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim (inadimplência, PDD). Default: true'),
      deltaAsPoints: z.boolean().optional()
        .describe(
          'true para exibir a diferença em pontos percentuais em vez de variação relativa. '
          + 'Use SEMPRE que a métrica já for um percentual: de 5,24% para 4,81% a variação '
          + 'relativa é −8,2%, número correto e que ninguém no mercado usa; em p.p. é −0,43.',
        ),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('comparison'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('comparison', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'comparison', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Várias séries com histórico, uma por linha. */
export function createAddSparkRowsBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um bloco com VÁRIAS métricas em linhas, cada uma com mini-gráfico de tendência e '
      + 'valor atual. Métrica de forma `timeseries_multi` — cada coluna que não é o bucket vira '
      + 'uma linha. Use para acompanhamento de conjunto; para destacar UM indicador, use add_kpi_block.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação dos valores. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim — pinta a tendência ao contrário. Default: true'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('sparkrows'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('sparkrows', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'sparkrows', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Dispersão — concentração de risco observação a observação. */
export function createAddScatterBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um gráfico de dispersão: uma observação por ponto, para ver agrupamento e outliers '
      + '(LTV × atraso, ticket × prazo). Métrica de forma `points` (colunas `x`, `y`, e '
      + 'opcionalmente `size` e `group`). NÃO use para série no tempo — para isso é '
      + 'add_chart_block com chartType "line".',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do gráfico'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      xLabel: z.string().optional().describe('Nome da grandeza do eixo X (ex: "LTV")'),
      yLabel: z.string().optional().describe('Nome da grandeza do eixo Y (ex: "Dias de atraso")'),
      xFormat: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação do eixo X'),
      yFormat: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação do eixo Y'),
      xReference: z.object({
        value: z.number().describe('Posição da linha no eixo X'),
        label: z.string().optional().describe('Rótulo da linha'),
      }).optional().describe('Linha vertical de corte — é ela que transforma a nuvem em decisão (ex: LTV de 80%)'),
      yReference: z.object({
        value: z.number().describe('Posição da linha no eixo Y'),
        label: z.string().optional().describe('Rótulo da linha'),
      }).optional().describe('Linha horizontal de corte (ex: 90 dias de atraso)'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('scatter'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('scatter', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'scatter', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Matriz de intensidade — a leitura de safra. */
export function createAddHeatmapBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona uma matriz de intensidade: grade linha × coluna pintada pelo valor. '
      + 'Métrica de forma `matrix` (colunas `row`, `col`, `value`). O caso clássico é a análise '
      + 'de safra — originação nas linhas, meses decorridos nas colunas, inadimplência no valor. '
      + 'Célula ausente fica vazia, e não zero.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      rowLabel: z.string().optional().describe('Nome do eixo das linhas (ex: "Safra")'),
      colLabel: z.string().optional().describe('Nome do eixo das colunas (ex: "Meses decorridos")'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação dos valores. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      highIsBad: z.boolean().optional()
        .describe('true (default) pinta valor alto em vermelho — certo para inadimplência. false pinta em verde, para métrica em que alto é bom.'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('heatmap'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('heatmap', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'heatmap', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Um fluxo com perda em cada etapa — a esteira de repasse. */
export function createAddFunnelBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um funil: um fluxo com perda em cada etapa, mostrando ONDE a perda é maior. '
      + 'Métrica de forma `funnel` (colunas `etapa` e `value`), com as etapas NA ORDEM do fluxo — '
      + 'a ordem vem do SQL, e um funil reordenado por valor deixa de ser funil. '
      + 'Se as etapas não formam sequência, use add_chart_block com chartType "bar".',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do funil (ex: "Esteira de repasse")'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação. Default: number'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('funnel'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('funnel', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'funnel', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Migração entre estados, entre dois períodos. */
export function createAddSankeyBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona uma matriz de migração: quem saiu de um estado e foi para outro entre dois '
      + 'períodos — quem estava em 1–30 dias de atraso e foi para 31–60. Antecipa a '
      + 'inadimplência, que o estoque só mostra depois de consumada. Métrica de forma `flow` '
      + '(colunas `origem`, `destino`, `value`). Exige DOIS momentos: para a composição de um '
      + 'instante use add_donut_block.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      ordem: z.array(z.string()).optional()
        .describe(
          'Os estados na ordem de GRAVIDADE, do melhor ao pior (ex: ["Sem atraso","1-30","31-60"]). '
          + 'É o que permite dizer se uma migração foi piora ou melhora — sem isso o bloco só '
          + 'desenha fitas sem sentido.',
        ),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação dos valores'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('sankey'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('sankey', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'sankey', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** A dispersão dentro de cada grupo, não a média dele. */
export function createAddBoxplotBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um gráfico de dispersão por grupo (boxplot): mediana, quartis e extremos de cada '
      + 'grupo. Uma carteira com LTV médio de 68% pode ser homogênea ou ter metade acima de 85%, '
      + 'e a média não distingue. Métrica de forma `distribution` (colunas `grupo`, `min`, `q1`, '
      + '`mediana`, `q3`, `max`), com os quartis JÁ calculados no SQL. Para UM grupo só use '
      + 'add_chart_block com chartType "histogram".',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação'),
      decimals: z.number().min(0).max(4).optional().describe('Casas decimais'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('boxplot'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('boxplot', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'boxplot', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

/** Peso por área — a rosca quando há categorias demais. */
export function createAddTreemapBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um treemap: concentração por área, para MUITAS categorias de tamanhos muito '
      + 'desiguais. Métrica de forma `breakdown`, a mesma da rosca. Use apenas acima de ~8 '
      + 'categorias — abaixo disso add_donut_block diz o mesmo com menos aparato, e com duas ou '
      + 'três o treemap vira um retângulo gigante que não informa nada.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título do bloco'),
      subtitle: z.string().optional().describe('Linha de apoio'),
      format: z.enum(['currency', 'percent', 'number']).optional().describe('Formatação'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('treemap'),
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('treemap', colSpan, {});
      const block = {
        id: crypto.randomUUID(), type: 'treemap', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}

export function createAddTableBlockTool(deps: CreateDeps = {}) {
  return tool({
    description:
      'Adiciona um bloco de tabela ligado a uma métrica do catálogo. As linhas são buscadas pelo app '
      + 'e acompanham o filtro de período — não passe linhas. Para projeção, use `projecao: true`.',
    inputSchema: z.object({
      pageIndex: pageField,
      metricId: metricField,
      title: z.string().optional().describe('Título da tabela'),
      columns: z.array(z.object({
        header: z.string().describe('Rótulo da coluna (ex: "ID Contrato")'),
        accessorKey: z.string().describe('Nome do campo como a métrica o devolve (ex: "id_contrato")'),
        format: z.enum(['currency', 'percent', 'number', 'date', 'status-badge']).optional()
          .describe('status-badge pinta o valor como etiqueta de situação (Válida/Vencida/Pendente)'),
      })).describe('Definição das colunas'),
      footerAggregations: z.record(z.string(), z.string()).optional()
        .describe('Linha de total no rodapé: mapeia accessorKey para "sum", "avg", "count" ou um texto fixo (ex: { faixa: "Total geral", valor: "sum" })'),
      substituiBlockId: replaceField,
      posicao: positionField,
      colSpan: widthField('table'),
      ignorePeriodFilter: projectionField,
    }),
    execute: async ({ pageIndex, colSpan, metricId, ...fields }) => {
      const recusa = rejectUnknownMetric(deps.catalog, metricId);
      if (recusa) return recusa;
      const width = resolveWidth('table', colSpan, { columns: fields.columns.length });
      const block = {
        id: crypto.randomUUID(), type: 'table', colSpan: width.colSpan, metricId, ...fields,
      } as CanvasBlock;
      return addResponse({ block, pageIndex, aviso: width.widthWarning, registro: deps.turnLog });
    },
  });
}
