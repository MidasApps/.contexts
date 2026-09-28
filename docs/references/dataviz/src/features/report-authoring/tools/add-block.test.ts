import { describe, it, expect } from 'vitest';
import {
  createAddTargetsBlockTool, createAddProgressBlockTool, createAddComparisonBlockTool,
  createAddSparkRowsBlockTool, createAddScatterBlockTool, createAddHeatmapBlockTool,
  createAddChartBlockTool, createAddDonutBlockTool, createAddKpiBlockTool,
} from './add-block';
import { widthOf } from '../schema/block-specs';

/**
 * As tools de criação dos blocos novos.
 *
 * O que importa aqui não é o eco do input: é que cada uma respeite as duas
 * recusas que existem para valer — métrica fora do catálogo e largura fora da
 * faixa do contrato. Bloco criado com métrica inventada nunca carrega, e bloco
 * fora da faixa nasce ilegível; nos dois casos o modelo anunciaria sucesso.
 */

type Executor = { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };

/**
 * O `execute` do `tool()` do AI SDK pede um segundo argumento (o contexto da
 * chamada) que as tools daqui ignoram. Chamar com um só é deliberado; o casto
 * passa por `unknown` porque as assinaturas de fato não se sobrepõem.
 */
function asExecutor(t: unknown): Executor {
  return t as Executor;
}

const CATALOG = ['covenants.indices', 'covenants.saldo'] as const;

/** As seis tools novas, com o mínimo que cada schema exige. */
const CREATORS: Array<{ nome: string; create: () => unknown; args: Record<string, unknown> }> = [
  { nome: 'targets', create: () => createAddTargetsBlockTool({ catalog: CATALOG }), args: {} },
  { nome: 'progress', create: () => createAddProgressBlockTool({ catalog: CATALOG }), args: { label: 'L', target: 100 } },
  { nome: 'comparison', create: () => createAddComparisonBlockTool({ catalog: CATALOG }), args: { label: 'L' } },
  { nome: 'sparkrows', create: () => createAddSparkRowsBlockTool({ catalog: CATALOG }), args: {} },
  { nome: 'scatter', create: () => createAddScatterBlockTool({ catalog: CATALOG }), args: {} },
  { nome: 'heatmap', create: () => createAddHeatmapBlockTool({ catalog: CATALOG }), args: {} },
];

describe('tools de criação dos blocos novos', () => {
  for (const { nome: name, create, args } of CREATORS) {
    describe(name, () => {
      it('recusa métrica fora do catálogo do cliente', async () => {
        const tool = asExecutor(create());
        const r = await tool.execute({ ...args, metricId: 'covenants.inventada' });
        expect(r.error).toBe('METRIC_NOT_FOUND');
        // A recusa não pode vir acompanhada de bloco: o modelo leria como sucesso.
        expect(r.action).toBeUndefined();
        expect(r.block).toBeUndefined();
      });

      it('sem colSpan, nasce com a largura recomendada do contrato', async () => {
        const tool = asExecutor(create());
        const r = await tool.execute({ ...args, metricId: CATALOG[0] });
        const block = r.block as { type: string; colSpan: number; metricId: string };
        expect(r.action).toBe('add_block');
        expect(block.type).toBe(name);
        expect(block.metricId).toBe(CATALOG[0]);
        expect(block.colSpan).toBe(widthOf(name as never).recommended);
      });

      it('largura fora da faixa é ajustada E explicada', async () => {
        const tool = asExecutor(create());
        const range = widthOf(name as never);
        const r = await tool.execute({ ...args, metricId: CATALOG[0], colSpan: 1 });
        const block = r.block as { colSpan: number };
        expect(block.colSpan).toBe(range.min);
        // Ajustar em silêncio ensinaria o modelo errado — ele repetiria o
        // mesmo pedido no bloco seguinte.
        if (range.min > 1) expect(r.aviso).toMatch(/Largura ajustada de 1 para/);
      });
    });
  }

  it('targets em lista cabe em largura menor que em bullet', async () => {
    const tool = asExecutor(createAddTargetsBlockTool({ catalog: CATALOG }));
    const asList = await tool.execute({ metricId: CATALOG[0], display: 'list', colSpan: 2 });
    expect((asList.block as { colSpan: number }).colSpan).toBe(2);

    const asBullet = await tool.execute({ metricId: CATALOG[0], colSpan: 2 });
    expect((asBullet.block as { colSpan: number }).colSpan).toBe(3);
    expect(asBullet.aviso).toBeDefined();
  });
});

describe('extensões das tools existentes', () => {
  /**
   * O eixo duplo existe para comparar grandezas diferentes; apertar o gráfico
   * anula o motivo de ter o segundo eixo, então o contrato sobe a largura
   * mínima e a tool obedece a ele — não a um número escrito na tool.
   */
  it('chart com eixo direito sobe a largura mínima para 4', async () => {
    const tool = asExecutor(createAddChartBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({
      metricId: CATALOG[0], chartType: 'composed', xAxisKey: 'mes',
      dataKeys: ['saldo', 'taxa'], rightAxisKeys: ['taxa'], colSpan: 3,
    });
    expect((r.block as { colSpan: number }).colSpan).toBe(4);
    expect(r.aviso).toBeDefined();
  });

  it('chart aceita histogram', async () => {
    const tool = asExecutor(createAddChartBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({
      metricId: CATALOG[0], chartType: 'histogram', xAxisKey: 'faixa', dataKeys: ['contratos'],
    });
    expect((r.block as { chartType: string }).chartType).toBe('histogram');
  });

  /**
   * Projeção não vem do banco. Sem este campo o assistente calculava o
   * esgotamento do estoque, escrevia os números num texto ao lado, e o
   * gráfico continuava parando no último mês real — que foi exatamente o que
   * aconteceu em produção.
   */
  it('chart carrega a série projetada pelo assistente até o bloco', async () => {
    const tool = asExecutor(createAddChartBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({
      metricId: CATALOG[0], chartType: 'line', xAxisKey: 'mes',
      dataKeys: ['realizado', 'projetado'], dashedKeys: ['projetado'],
      ignorePeriodFilter: true,
      projectedData: [
        { mes: '2026-06', projetado: 188 },
        { mes: '2027-06', projetado: 208 },
      ],
    });
    const block = r.block as { projectedData?: Array<Record<string, unknown>>; ignorePeriodFilter?: boolean };
    expect(block.projectedData).toHaveLength(2);
    expect(block.projectedData?.[1]).toMatchObject({ mes: '2027-06', projetado: 208 });
    expect(block.ignorePeriodFilter).toBe(true);
  });

  it('chart sem projeção não ganha o campo', async () => {
    const tool = asExecutor(createAddChartBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({
      metricId: CATALOG[0], chartType: 'line', xAxisKey: 'mes', dataKeys: ['v'],
    });
    expect((r.block as { projectedData?: unknown }).projectedData).toBeUndefined();
  });

  /*
   * "Ponha como primeiro indicador" era um pedido que o assistente aceitava,
   * respondia que tinha feito, e o bloco aparecia no rodapé: as tools só
   * sabiam acrescentar no fim.
   */
  it('posicao "topo" manda o bloco para o índice 0 da página', async () => {
    const tool = asExecutor(createAddKpiBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({ metricId: CATALOG[0], label: 'Unidades em Estoque', posicao: 'topo' });
    expect(r.position).toBe(0);
    // A instrução não pode virar campo do bloco gravado.
    expect((r.block as Record<string, unknown>).posicao).toBeUndefined();
  });

  it('sem posicao, nada é dito — o aplicador acrescenta no fim', async () => {
    const tool = asExecutor(createAddKpiBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({ metricId: CATALOG[0], label: 'Saldo' });
    expect(r.position).toBeUndefined();
  });

  /*
   * O card sempre soube desenhar a curva; faltava a tool expor o campo. Sem
   * ele o assistente concluía que "a engenharia precisa converter a métrica
   * para timeseries" — a arquitetura é outra: número de uma métrica, curva de
   * outra.
   */
  it('kpi aceita a métrica de série da sparkline', async () => {
    const tool = asExecutor(createAddKpiBlockTool({ catalog: [...CATALOG, 'covenants.serie'] }));
    const r = await tool.execute({
      metricId: CATALOG[0], label: 'Unidades em Estoque', sparklineMetricId: 'covenants.serie',
    });
    expect((r.block as { sparklineMetricId?: string }).sparklineMetricId).toBe('covenants.serie');
  });

  it('recusa métrica de sparkline que não existe no catálogo', async () => {
    const tool = asExecutor(createAddKpiBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({
      metricId: CATALOG[0], label: 'Estoque', sparklineMetricId: 'covenants.inventada',
    });
    expect(r.ok).toBe(false);
    expect(r.block).toBeUndefined();
  });

  it('donut em barra de linha única aceita 2 colunas', async () => {
    const tool = asExecutor(createAddDonutBlockTool({ catalog: CATALOG }));
    const r = await tool.execute({ metricId: CATALOG[0], display: 'bar', colSpan: 2 });
    const block = r.block as { colSpan: number; display: string };
    expect(block.display).toBe('bar');
    expect(block.colSpan).toBe(2);
  });
});
