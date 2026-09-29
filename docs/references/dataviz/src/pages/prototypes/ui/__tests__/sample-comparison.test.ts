import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { ALL_EXAMPLES } from '../sample-blocks';
import { withComparison } from '../sample-comparison';
import { COMPARISON_PREFIX } from '@/shared/hooks/useReportData';
import { supportsComparison } from '@/shared/config/agents/comparison';

/**
 * O modo comparativo da galeria fabrica o período anterior, mas entrega o
 * resultado às MESMAS funções do relatório. Se a galeria desenhasse a
 * comparação por conta própria, mostraria um comportamento que não existe em
 * produção — e a página existe para validar o que existe.
 */

describe('withComparison', () => {
  it('sobrepõe a série num gráfico', () => {
    const chart = {
      id: 'g', type: 'chart', chartType: 'line', xAxisKey: 'mes', dataKeys: ['v'],
      data: [{ mes: '2026-06', v: 10 }, { mes: '2026-07', v: 20 }],
    } as unknown as CanvasBlock;

    const output = withComparison(chart) as typeof chart & {
      data: Array<Record<string, unknown>>;
    };
    expect(output.data[0]![`${COMPARISON_PREFIX}v`]).toBeTypeOf('number');
  });

  it('dá variação ao KPI', () => {
    const kpi = { id: 'k', type: 'kpi', label: 'X', value: 'R$ 1.000' } as unknown as CanvasBlock;
    const output = withComparison(kpi) as typeof kpi & { deltaPercent?: string };
    expect(output.deltaPercent).toMatch(/%$/);
  });

  it('dá o anterior ao bloco de comparação', () => {
    const c = { id: 'c', type: 'comparison', label: 'X', current: 100 } as unknown as CanvasBlock;
    const output = withComparison(c) as typeof c & { previous?: number };
    expect(output.previous).toBeCloseTo(86, 0);
  });

  /*
   * O ponto da página: um bloco que não muda aqui é um bloco que não muda no
   * relatório. Devolver o MESMO objeto (não uma cópia) é o que garante que a
   * galeria não está desenhando um comparativo inventado por ela.
   */
  it('devolve o bloco intacto quando o tipo não aceita', () => {
    const donut = {
      id: 'd', type: 'donut', title: 'X', slices: [{ name: 'A', value: 1 }],
    } as unknown as CanvasBlock;
    expect(withComparison(donut)).toBe(donut);
  });

  it('não muta o bloco de origem', () => {
    const chart = {
      id: 'g', type: 'chart', chartType: 'line', xAxisKey: 'mes', dataKeys: ['v'],
      data: [{ mes: '2026-06', v: 10 }],
    } as unknown as CanvasBlock;
    const before = JSON.stringify(chart);
    withComparison(chart);
    expect(JSON.stringify(chart)).toBe(before);
  });

  /**
   * A galeria inteira precisa atravessar o modo sem quebrar — é o que a página
   * faz ao ligar o interruptor, bloco por bloco.
   */
  it('todo exemplo da galeria atravessa o modo, e só os do contrato mudam', () => {
    for (const { block } of ALL_EXAMPLES) {
      const output = withComparison(block);
      expect(output, `${block.type} quebrou no modo comparativo`).toBeTruthy();
      if (!supportsComparison(block.type)) {
        expect(output, `${block.type} não deveria mudar`).toBe(block);
      }
    }
  });
});
