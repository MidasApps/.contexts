import { describe, it, expect } from 'vitest';
import type { ChartBlock } from '@/shared/config/agents/types';
import {
  mergeComparisonSeries,
  COMPARISON_PREFIX,
  COMPARISON_LABEL,
} from '../useReportData';

/**
 * A sobreposição de dois períodos num gráfico.
 *
 * O alinhamento é por POSIÇÃO, não por data: mai–jul contra jan–mar não tem um
 * único ponto de eixo em comum, e casar por data desenharia duas curvas em
 * trechos distintos do eixo — lado a lado, que é o oposto de comparar. O que
 * se compara é o percurso: 1º mês contra 1º mês.
 */

function chart(over: Partial<ChartBlock> = {}): ChartBlock {
  return {
    id: 'c', type: 'chart', metricId: 'm', chartType: 'line',
    xAxisKey: 'mes', dataKeys: ['saldo'],
    data: [
      { mes: '2026-05', saldo: 10 },
      { mes: '2026-06', saldo: 20 },
      { mes: '2026-07', saldo: 30 },
    ],
    ...over,
  } as ChartBlock;
}

const comparisonRows = [
  { mes: '2026-01', saldo: 7 },
  { mes: '2026-02', saldo: 8 },
  { mes: '2026-03', saldo: 9 },
];

describe('mergeComparisonSeries', () => {
  it('acrescenta a série de lá sem tocar na daqui', () => {
    const b = chart();
    mergeComparisonSeries(b, comparisonRows);
    expect(b.data![0]).toMatchObject({ mes: '2026-05', saldo: 10, [`${COMPARISON_PREFIX}saldo`]: 7 });
    expect(b.data![2]).toMatchObject({ saldo: 30, [`${COMPARISON_PREFIX}saldo`]: 9 });
  });

  /** Sem o mês de lá, o tooltip mostraria dois números sob o mesmo rótulo. */
  it('guarda o rótulo real do ponto comparativo', () => {
    const b = chart();
    mergeComparisonSeries(b, comparisonRows);
    expect(b.data![0]![COMPARISON_LABEL]).toBe('2026-01');
    expect(b.data![1]![COMPARISON_LABEL]).toBe('2026-02');
  });

  it('alinha por posição, não por data — os eixos não têm mês em comum', () => {
    const b = chart();
    mergeComparisonSeries(b, comparisonRows);
    // O 1º ponto de cá recebeu o 1º de lá, apesar de meses completamente
    // diferentes: é o percurso que se compara.
    expect(b.data!.map((l) => l[`${COMPARISON_PREFIX}saldo`])).toEqual([7, 8, 9]);
  });

  /*
   * Períodos de tamanhos diferentes sobram ou faltam nas pontas. O ponto sem
   * par fica SEM valor comparativo, e a linha se interrompe ali — inventar
   * continuidade seria desenhar um dado que não existe.
   */
  it('período comparativo mais curto deixa as pontas sem par', () => {
    const b = chart();
    mergeComparisonSeries(b, comparisonRows.slice(0, 2));
    expect(b.data![1]).toHaveProperty(`${COMPARISON_PREFIX}saldo`);
    expect(b.data![2]).not.toHaveProperty(`${COMPARISON_PREFIX}saldo`);
  });

  it('período comparativo mais longo é truncado pelo atual', () => {
    const b = chart();
    mergeComparisonSeries(b, [...comparisonRows, { mes: '2026-04', saldo: 99 }]);
    expect(b.data).toHaveLength(3);
    expect(JSON.stringify(b.data)).not.toContain('99');
  });

  it('mescla TODAS as séries declaradas, não só a primeira', () => {
    const b = chart({
      dataKeys: ['credito', 'debito'],
      data: [{ mes: '2026-05', credito: 1, debito: 2 }],
    });
    mergeComparisonSeries(b, [{ mes: '2026-01', credito: 10, debito: 20 }]);
    expect(b.data![0]).toMatchObject({
      [`${COMPARISON_PREFIX}credito`]: 10,
      [`${COMPARISON_PREFIX}debito`]: 20,
    });
  });

  /** Convenção do resolver: `bucket` é o eixo e `value` é a primeira série. */
  it('traduz as chaves do resolver como a série principal', () => {
    const b = chart({ data: [{ mes: '2026-05', saldo: 10 }] });
    mergeComparisonSeries(b, [{ bucket: '2026-01', value: 5 }]);
    expect(b.data![0]![`${COMPARISON_PREFIX}saldo`]).toBe(5);
    expect(b.data![0]![COMPARISON_LABEL]).toBe('2026-01');
  });

  it('sem linhas comparativas o bloco fica intacto', () => {
    const b = chart();
    const before = JSON.stringify(b.data);
    mergeComparisonSeries(b, []);
    expect(JSON.stringify(b.data)).toBe(before);
  });

  it('gráfico ainda sem dado não é inventado a partir do comparativo', () => {
    const b = chart({ data: [] });
    mergeComparisonSeries(b, comparisonRows);
    expect(b.data).toEqual([]);
  });
});

/**
 * A cobertura por TIPO de gráfico.
 *
 * O empilhado e o `composed` ficaram de fora da primeira versão — o primeiro
 * por decisão (uma fita fantasma somada à pilha quebra o total), o segundo por
 * descuido, e ele é justamente a combinação que o produto mais usa. Os dois
 * têm tratamento próprio agora, e este teste garante que o DADO chega para
 * ambos: quem desenha é o `ChartBlock`, mas sem a mescla não há o que desenhar.
 */
describe('cobertura por tipo de gráfico', () => {
  it.each(['line', 'area', 'bar', 'stacked-bar', 'composed'])(
    '%s recebe a série comparativa',
    (chartType) => {
      const b = chart({ chartType } as Partial<ChartBlock>);
      mergeComparisonSeries(b, comparisonRows);
      expect(b.data![0]![`${COMPARISON_PREFIX}saldo`]).toBe(7);
    },
  );
});
