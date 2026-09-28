import { describe, it, expect } from 'vitest';
import type {
  CanvasBlock, ChartBlock, GaugeBlock, ScatterBlock, SingleKpiBlock, TableBlock,
} from '@/shared/config/agents/types';
import { applyMetricRowsToBlock } from '@/shared/hooks/useReportData';
import { normalizePercentScale, percentColumnsOf } from '@/shared/lib/metrics/percent-scale';

/**
 * A escala do percentual resolvida entre métrica e bloco (ADR-0032/0033).
 *
 * KPI e tabela multiplicam `percent` por 100 e querem fração; gauge, progresso,
 * gráfico e os demais formatam como vem e querem pontos. A métrica declara as
 * colunas em pontos; o resto é fração. Os dois bugs que isto fecha:
 * "8.227,22%" num KPI sobre métrica em pontos, e "0,82%" num gauge sobre
 * métrica em fração.
 */

function block(props: Record<string, unknown>): CanvasBlock {
  return props as unknown as CanvasBlock;
}

/** O caminho do `useReportData`: normaliza, depois aplica. */
function apply(b: CanvasBlock, rows: Array<Record<string, unknown>>, points?: string[]) {
  applyMetricRowsToBlock(b, normalizePercentScale(b, rows, points));
  return b;
}

describe('blocos que querem fração (KPI e tabela)', () => {
  it('KPI sobre métrica em pontos não multiplica de novo', () => {
    const b = apply(block({ id: 'k', type: 'kpi', metricId: 'm', label: 'Atingimento', format: 'percent' }), [{ value: 82.2722 }], ['value']);
    expect((b as SingleKpiBlock).value).toBe('82,27%');
  });

  it('KPI sobre métrica em fração continua como antes', () => {
    const b = apply(block({ id: 'k', type: 'kpi', metricId: 'm', label: 'Margem', format: 'percent' }), [{ value: 0.0211 }]);
    expect((b as SingleKpiBlock).value).toBe('2,11%');
  });

  it('formato não percentual ignora a declaração', () => {
    const b = apply(
      block({ id: 'k', type: 'kpi', metricId: 'm', label: 'Realizado', format: 'number', decimals: 2, suffix: '%' }),
      [{ value: 85.84 }], ['value'],
    );
    expect((b as SingleKpiBlock).value).toBe('85,84%');
  });

  it('tabela: só a coluna percent declarada em pontos desce para fração', () => {
    const b = apply(block({
      id: 't', type: 'table', metricId: 'm', rows: [],
      columns: [
        { header: 'Unidade', accessorKey: 'unidade' },
        { header: 'Atingimento', accessorKey: 'atingimento', format: 'percent' },
        { header: 'Conversão', accessorKey: 'conversao', format: 'percent' },
        { header: 'Nota', accessorKey: 'nota', format: 'number' },
      ],
    }), [{ unidade: 'Centro', atingimento: 82.5, conversao: 0.0126, nota: 40 }], ['atingimento', 'nota']);
    expect((b as TableBlock).rows).toEqual([{ unidade: 'Centro', atingimento: 0.825, conversao: 0.0126, nota: 40 }]);
  });
});

describe('blocos que querem pontos (gauge, gráfico e os demais)', () => {
  it('gauge sobre métrica em fração sobe para pontos', () => {
    const b = apply(block({ id: 'g', type: 'gauge', metricId: 'm', label: 'Inadimplência', value: 0, threshold: 5, format: 'percent' }), [{ value: 0.045 }]);
    expect((b as GaugeBlock).value).toBeCloseTo(4.5);
  });

  it('gauge sobre métrica em pontos fica como está', () => {
    const b = apply(block({ id: 'g', type: 'gauge', metricId: 'm', label: 'Uso', value: 0, threshold: 100, format: 'percent' }), [{ value: 87.1 }], ['value']);
    expect((b as GaugeBlock).value).toBe(87.1);
  });

  it('gauge fora de percent não é tocado', () => {
    const b = apply(block({ id: 'g', type: 'gauge', metricId: 'm', label: 'Dívida', value: 0, threshold: 10, format: 'currency' }), [{ value: 0.5 }]);
    expect((b as GaugeBlock).value).toBe(0.5);
  });

  it('gráfico: cada eixo segue o próprio formato, e value vira dataKeys[0]', () => {
    const b = apply(block({
      id: 'c', type: 'chart', chartType: 'composed', metricId: 'm', data: [],
      dataKeys: ['taxa', 'vendas'], rightAxisKeys: ['vendas'], xAxisKey: 'mes',
      format: 'percent', rightFormat: 'number',
    }), [{ bucket: '2026-08-01', value: 0.25, vendas: 78 }]);
    expect((b as ChartBlock).data).toEqual([{ mes: '2026-08-01', taxa: 25, vendas: 78 }]);
  });

  it('dispersão converte só o eixo em percent', () => {
    const b = apply(block({
      id: 's', type: 'scatter', metricId: 'm', points: [], xFormat: 'currency', yFormat: 'percent',
    }), [{ x: 1000, y: 0.031 }]);
    expect((b as ScatterBlock).points).toMatchObject([{ x: 1000, y: 3.1 }]);
  });

  it('o período comparativo sai na mesma régua do atual', () => {
    const b = block({ id: 'g', type: 'gauge', metricId: 'm', label: 'x', value: 0, threshold: 5, format: 'percent' });
    const current = normalizePercentScale(b, [{ value: 0.05 }]);
    const previous = normalizePercentScale(b, [{ value: 0.04 }]);
    expect([current[0]?.value, previous[0]?.value]).toEqual([5, 4]);
  });
});

describe('quais colunas cada bloco formata em percent', () => {
  it('rosca e treemap: só value', () => {
    expect(percentColumnsOf(block({ id: 'd', type: 'donut', format: 'percent', slices: [] }), [{ fonte: 'a', value: 1 }])).toEqual(['value']);
  });

  it('sem formato percent, nenhuma coluna', () => {
    expect(percentColumnsOf(block({ id: 'd', type: 'donut', format: 'currency', slices: [] }), [{ fonte: 'a', value: 1 }])).toEqual([]);
  });

  it('linhas sem nada a converter voltam as mesmas', () => {
    const rows = [{ value: 3 }];
    expect(normalizePercentScale(block({ id: 'k', type: 'kpi', format: 'number' }), rows)).toBe(rows);
  });
});
