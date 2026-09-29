import { tool } from 'ai';
import { z } from 'zod';
import type { CanvasPageContext } from '@/shared/config/agents/types';
import { rejectUnknownMetric, type MetricCatalog } from './metric-guard';
import {
  widthField, seriesProjectionField, projectionField, sparklineDataField, sparklineMetricField,
} from './common-fields';

/** Retrato `blockId → type` dos blocos que existiam quando a requisição chegou. */
export type BlockTypeIndex = Readonly<Record<string, string>>;

export function buildBlockTypeIndex(pages: CanvasPageContext[]): BlockTypeIndex {
  const index: Record<string, string> = {};
  for (const page of pages) {
    for (const block of page.blocks) index[block.id] = block.type;
  }
  return index;
}

/**
 * Recusa aplicar um update a um bloco de outro tipo.
 *
 * As tools `update_*_block` carregam o `type` no payload, e a aplicação no
 * cliente é um merge raso: `update_chart_block` num KPI produzia um "chart"
 * com os campos do KPI e sem série — bloco que não existe no domínio. O store
 * passou a recusar esse merge, mas em silêncio, e o modelo seguia anunciando
 * "Prontinho! O gráfico foi alterado" sobre um no-op.
 *
 * Devolver o erro AQUI o entrega a quem pode consertar e contar a verdade no
 * mesmo turno: o próprio modelo.
 *
 * Bloco fora do índice passa: pode ter nascido neste turno (`add_*_block`),
 * já que o índice é o retrato de quando a requisição chegou.
 */
function rejectIncompatibleType(
  index: BlockTypeIndex | undefined,
  blockId: string,
  expectedType: string,
) {
  const actualType = index?.[blockId];
  if (!actualType || actualType === expectedType) return null;
  return {
    ok: false as const,
    error: 'BLOCK_TYPE_MISMATCH' as const,
    blockId,
    actualType,
    expectedType,
    message:
      `O bloco "${blockId}" é do tipo "${actualType}", não "${expectedType}" — `
      + `nada foi alterado. Um update parcial não converte bloco de tipo: use `
      + `update_${actualType}_block para editá-lo como está, ou remove_block + `
      + `add_${expectedType}_block para trocá-lo de tipo. Se o usuário pediu algo `
      + `que este bloco não é, diga isso a ele em vez de anunciar uma mudança.`,
  };
}

/**
 * Monta o payload de update descartando campo ausente.
 *
 * O merge no cliente é raso: mandar `undefined` apagaria o valor que já existe.
 */
function buildUpdates(type: string, fields: Record<string, unknown>) {
  const updates: Record<string, unknown> = { type };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) updates[k] = v;
  }
  return updates;
}

/**
 * Fábrica das tools de update.
 *
 * Todas seguem a mesma sequência: recusa por tipo, recusa por métrica
 * desconhecida, monta o merge. A recusa por métrica faltava aqui — só os
 * `add_*` chamavam o guard, então trocar a métrica de um bloco existente por um
 * id inventado passava batido e só aparecia como 404 do batch, depois de salvar.
 */
function createUpdateTool(args: {
  type: string;
  description: string;
  fields: z.ZodRawShape;
  blockTypes?: BlockTypeIndex;
  catalog?: MetricCatalog;
}) {
  const { type, description, fields, blockTypes, catalog } = args;
  return tool({
    description,
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco a atualizar'),
      ...fields,
    }),
    execute: async (input) => {
      const { blockId, ...rest } = input as { blockId: string } & Record<string, unknown>;
      const typeRefusal = rejectIncompatibleType(blockTypes, blockId, type);
      if (typeRefusal) return typeRefusal;

      const metricId = rest['metricId'];
      if (typeof metricId === 'string') {
        const metricRefusal = rejectUnknownMetric(catalog, metricId);
        if (metricRefusal) return metricRefusal;
      }

      return { action: 'update_block', blockId, updates: buildUpdates(type, rest) };
    },
  });
}

const optionalMetric = (target: string) => z.string().optional()
  .describe(`Nova métrica que alimenta ${target} ("dominio.slug"), apenas do catálogo do cliente`);

export function createUpdateTextBlockTool(blockTypes?: BlockTypeIndex) {
  return createUpdateTool({
    type: 'text',
    description: 'Atualiza o conteúdo de um bloco de texto existente.',
    blockTypes,
    fields: {
      content: z.string().describe('Novo conteúdo em markdown'),
      colSpan: widthField('text'),
    },
  });
}

export function createUpdateKpiBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'kpi',
    description: 'Atualiza um bloco KPI. O valor vem da métrica e acompanha o filtro de período — para trocar o número, troque a métrica.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o bloco'),
      label: z.string().optional().describe('Rótulo do KPI'),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      suffix: z.string().optional(),
      description: z.string().optional().describe('Descrição breve'),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim'),
      alertThreshold: z.number().optional().describe('Alerta visual quando o valor bruto passa deste limite'),
      sparklineMetricId: sparklineMetricField,
      sparklineData: sparklineDataField,
      colSpan: widthField('kpi'),
    },
  });
}

export function createUpdateGaugeBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'gauge',
    description: 'Atualiza um indicador com limite — o limite, a faixa de atenção e a apresentação.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o indicador'),
      label: z.string().optional().describe('Rótulo do indicador'),
      threshold: z.number().optional().describe('Limite mínimo aceitável. Com format percent, em PONTOS: 5 = 5% (o valor da métrica chega em pontos, seja qual for a escala dela).'),
      warnThreshold: z.number().optional().describe('Limite de atenção (faixa âmbar). Com format percent, em PONTOS: 5 = 5%.'),
      description: z.string().optional(),
      suffix: z.string().optional(),
      decimals: z.number().min(0).max(4).optional(),
      reverseScale: z.boolean().optional().describe('true quando quanto MAIOR pior'),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      display: z.enum(['meter', 'arc']).optional()
        .describe('"meter" = faixa horizontal, cabe em 2 colunas; "arc" = semicírculo, exige 3 e destaca mais'),
      colSpan: widthField('gauge'),
    },
  });
}

export function createUpdateDonutBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'donut',
    description: 'Atualiza uma rosca de composição.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('a rosca'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      centerLabel: z.string().optional().describe('Rótulo do centro'),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      showLegendCards: z.boolean().optional().describe('Cards laterais por fatia'),
      display: z.enum(['donut', 'bar']).optional()
        .describe('"donut" = rosca com total no centro; "bar" = barra 100% de linha única, ~1/3 da altura'),
      colSpan: widthField('donut'),
    },
  });
}

export function createUpdateTargetsBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'targets',
    description: 'Atualiza um bloco de indicadores com meta — apresentação, formatação e métrica.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o bloco'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      display: z.enum(['bullet', 'list']).optional()
        .describe('"bullet" mostra a distância até a meta; "list" cabe mais itens sem mostrá-la'),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      suffix: z.string().optional(),
      reverseScale: z.boolean().optional().describe('true quando MAIOR é pior para todos os itens'),
      colSpan: widthField('targets'),
    },
  });
}

export function createUpdateProgressBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'progress',
    description: 'Atualiza um indicador de realizado vs. meta. A meta é configuração — para mudá-la, informe `target`.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o indicador'),
      label: z.string().optional(),
      target: z.number().optional().describe('Nova meta. Com format percent, em PONTOS: 5 = 5% (o valor da métrica chega em pontos, seja qual for a escala dela).'),
      targetLabel: z.string().optional().describe('Como chamar a meta na linha de apoio'),
      description: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      suffix: z.string().optional(),
      colSpan: widthField('progress'),
    },
  });
}

export function createUpdateComparisonBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'comparison',
    description: 'Atualiza uma comparação entre período atual e anterior.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('a comparação'),
      label: z.string().optional(),
      currentLabel: z.string().optional(),
      previousLabel: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      suffix: z.string().optional(),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim'),
      deltaAsPoints: z.boolean().optional().describe('true para diferença em p.p. — use quando a métrica já é percentual'),
      colSpan: widthField('comparison'),
    },
  });
}

export function createUpdateSparkRowsBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'sparkrows',
    description: 'Atualiza um bloco de tendência por métrica.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o bloco'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      positiveIsGood: z.boolean().optional().describe('false quando subir é ruim'),
      colSpan: widthField('sparkrows'),
    },
  });
}

export function createUpdateScatterBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'scatter',
    description: 'Atualiza um gráfico de dispersão — rótulos dos eixos, formatação e linhas de corte.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o gráfico'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      xLabel: z.string().optional(),
      yLabel: z.string().optional(),
      xFormat: z.enum(['currency', 'percent', 'number']).optional(),
      yFormat: z.enum(['currency', 'percent', 'number']).optional(),
      xReference: z.object({
        value: z.number(),
        label: z.string().optional(),
      }).optional().describe('Linha vertical de corte'),
      yReference: z.object({
        value: z.number(),
        label: z.string().optional(),
      }).optional().describe('Linha horizontal de corte'),
      colSpan: widthField('scatter'),
    },
  });
}

export function createUpdateHeatmapBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'heatmap',
    description: 'Atualiza uma matriz de intensidade — rótulos dos eixos, formatação e sentido da cor.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('a matriz'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      rowLabel: z.string().optional(),
      colLabel: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      highIsBad: z.boolean().optional().describe('true pinta valor alto em vermelho; false, em verde'),
      colSpan: widthField('heatmap'),
    },
  });
}

export function createUpdateChartBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'chart',
    description: 'Atualiza um bloco de gráfico existente — dados, tipo e apresentação. Todos os campos exceto blockId são opcionais: informe apenas o que deseja alterar, o resto é preservado.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      chartType: z.enum(['bar', 'line', 'area', 'composed', 'stacked-bar', 'waterfall', 'histogram', 'pareto']).optional().describe('Novo tipo de gráfico'),
      title: z.string().optional().describe('Novo título'),
      subtitle: z.string().optional().describe('Linha de apoio sob o título'),
      xAxisKey: z.string().optional().describe('Novo campo para o eixo X'),
      dataKeys: z.array(z.string()).optional().describe('Novos campos para o eixo Y'),
      metricId: optionalMetric('o gráfico'),
      colors: z.array(z.string()).optional()
        .describe('Cor de cada série, na ordem de dataKeys (hex, ex.: ["#6ECB8A","#F27C7C"]). Omita para usar a paleta padrão — só informe quando a cor carrega significado (ex.: vermelho para inadimplência).'),
      dashedKeys: z.array(z.string()).optional()
        .describe('Subconjunto de dataKeys desenhado tracejado (line, area, composed). Use para separar projeção de realizado, ou meta de valor efetivo.'),
      referenceLines: z.array(z.object({
        y: z.number().describe('Valor no eixo Y onde a linha é traçada'),
        label: z.string().optional().describe('Rótulo exibido à direita da linha'),
        color: z.string().optional().describe('Cor em hex'),
        dashed: z.boolean().optional().describe('Tracejada (default) ou contínua'),
      })).optional()
        .describe('Linhas horizontais de referência: mínimo de covenant, meta, limite regulatório.'),
      layout: z.enum(['vertical', 'horizontal']).optional()
        .describe('Orientação das barras — só afeta bar e stacked-bar. "horizontal" põe a categoria no eixo Y: use com rótulos longos ou mais de ~8 categorias, e exige largura 4 ou mais. Default "vertical".'),
      stackOffset: z.enum(['none', 'expand']).optional()
        .describe('Só stacked-bar: "expand" normaliza para 100% (proporção por categoria, eixo em %). Use quando a composição importa mais que o valor absoluto.'),
      rightAxisKeys: z.array(z.string()).optional()
        .describe('Séries que vão para um segundo eixo Y, à direita. Subconjunto de dataKeys. Use quando as unidades diferem (R$ com %) — num eixo só a série percentual fica colada no zero. Exige largura 4+.'),
      leftAxisLabel: z.string().optional().describe('Rótulo do eixo esquerdo (ex: "R$")'),
      rightAxisLabel: z.string().optional().describe('Rótulo do eixo direito (ex: "%")'),
      legendaInterativa: z.boolean().optional()
        .describe('Clicar na legenda esconde a série. Vale a partir de ~4 séries. Esconde SÉRIE, não período — o recorte no tempo é do filtro global.'),
      ignorePeriodFilter: projectionField,
      projectedData: seriesProjectionField,
      colSpan: widthField('chart'),
    },
  });
}

export function createUpdateFunnelBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'funnel',
    description: 'Atualiza um funil — título, formatação e largura. A ORDEM das etapas vem do SQL da métrica e não se muda por aqui: um funil reordenado deixa de ser funil.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o funil'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      colSpan: widthField('funnel'),
    },
  });
}

export function createUpdateSankeyBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'sankey',
    description: 'Atualiza uma matriz de migração — título, formatação e a ordem de gravidade dos estados.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('a matriz de migração'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      ordem: z.array(z.string()).optional()
        .describe('Os estados na ordem de GRAVIDADE, do melhor ao pior. É o que decide se uma migração é piora ou melhora — trocar esta ordem inverte as cores do bloco inteiro.'),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      colSpan: widthField('sankey'),
    },
  });
}

export function createUpdateBoxplotBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'boxplot',
    description: 'Atualiza um gráfico de dispersão por grupo — título, formatação e largura. Os quartis vêm calculados da métrica.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o boxplot'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      decimals: z.number().min(0).max(4).optional(),
      colSpan: widthField('boxplot'),
    },
  });
}

export function createUpdateTreemapBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'treemap',
    description: 'Atualiza um treemap — título, formatação e largura. Se a métrica passou a devolver poucas categorias, troque o bloco por uma rosca em vez de ajustar este.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      metricId: optionalMetric('o treemap'),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      format: z.enum(['currency', 'percent', 'number']).optional(),
      colSpan: widthField('treemap'),
    },
  });
}

export function createUpdateTableBlockTool(blockTypes?: BlockTypeIndex, catalog?: MetricCatalog) {
  return createUpdateTool({
    type: 'table',
    description: 'Atualiza um bloco de tabela existente. Todos os campos exceto blockId são opcionais.',
    blockTypes,
    ...(catalog ? { catalog } : {}),
    fields: {
      title: z.string().optional().describe('Novo título'),
      columns: z.array(z.object({
        header: z.string().describe('Rótulo da coluna'),
        accessorKey: z.string().describe('Nome do campo nos dados'),
        format: z.enum(['currency', 'percent', 'number', 'date', 'status-badge']).optional(),
      })).optional().describe('Novas definições de colunas'),
      footerAggregations: z.record(z.string(), z.string()).optional()
        .describe('Linha de total no rodapé: accessorKey → "sum", "avg", "count" ou texto fixo'),
      metricId: optionalMetric('a tabela'),
      ignorePeriodFilter: projectionField,
      colSpan: widthField('table'),
    },
  });
}
