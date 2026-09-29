import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { toWaterfallData } from './waterfall';
import { ChartBlock } from './ChartBlock';

describe('toWaterfallData', () => {
  it('empilha base invisível acumulada', () => {
    const rows = [
      { bucket: 'Entrada', value: 5_400_000 },
      { bucket: 'Compras', value: -247_600 },
      { bucket: 'Transferência', value: -5_000_000 },
    ];
    expect(toWaterfallData(rows)).toEqual([
      { bucket: 'Entrada', base: 0, delta: 5_400_000, value: 5_400_000 },
      { bucket: 'Compras', base: 5_152_400, delta: 247_600, value: -247_600 },
      { bucket: 'Transferência', base: 152_400, delta: 5_000_000, value: -5_000_000 },
    ]);
  });
});

describe('ChartBlock waterfall', () => {
  const block = {
    id: 'w1', type: 'chart' as const, chartType: 'waterfall' as const,
    title: 'Extrato Resumido',
    data: [
      { bucket: 'Entrada', value: 5_400_000 },
      { bucket: 'Compras', value: -247_600 },
      { bucket: 'Transferência', value: -5_000_000 },
    ],
    dataKeys: ['value'],
    xAxisKey: 'bucket',
  };

  it('renderiza barras flutuantes (base invisível + delta colorido)', () => {
    const { container } = render(<ChartBlock block={block} />);
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
    // categorias no eixo X
    const xLabels = container.querySelector('.recharts-xAxis-tick-labels')?.textContent;
    expect(xLabels).toContain('Entrada');
    expect(xLabels).toContain('Compras');
    expect(xLabels).toContain('Transferência');
    // duas séries empilhadas: base (invisível) + delta (colorida)
    const barSeries = container.querySelectorAll('.recharts-bar');
    expect(barSeries.length).toBe(2);
    // série delta (2ª) tem uma Cell colorida por bucket, uma por linha de dado
    const deltaRects = barSeries[1].querySelectorAll('.recharts-bar-rectangle path');
    expect(deltaRects.length).toBe(3);
    const fills = Array.from(deltaRects).map((el) => el.getAttribute('fill'));
    // Entrada (positivo) e Compras/Transferência (negativo) usam cores distintas
    expect(new Set(fills).size).toBe(2);
  });

  /*
   * A queda NAO usa o vermelho de acao.
   *
   * `destructive` e o token do "Excluir" e do erro de formulario. Num
   * waterfall de caixa, saida nao e falha — e saida, e a DIRECAO da barra ja
   * diz isso. O vermelho ali so gritava.
   *
   * Medido: o grafite quente da marca fica a 0,283 do laranja em OKLab,
   * enquanto o vermelho estava a 0,237. A barra ficou mais facil de separar,
   * nao menos.
   */
  it('a queda usa o token de dado negativo, nao o vermelho de acao', () => {
    const { container } = render(<ChartBlock block={block} />);
    expect(container.innerHTML).not.toMatch(/fill-destructive/);
    expect(container.innerHTML).toMatch(/fill-negativo/);
  });
});
