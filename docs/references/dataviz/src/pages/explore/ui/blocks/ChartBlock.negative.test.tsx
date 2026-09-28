import { it, expect, describe } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock } from './ChartBlock';

describe('ChartBlock negative values', () => {
  it('bar chart renderiza séries com valores negativos sem lançar', () => {
    const { container } = render(<ChartBlock block={{
      id: 'n1', type: 'chart', chartType: 'bar', title: 'E&S',
      data: [{ bucket: 'mai. 2026', credit: 5_400_000, debit: -5_247_584.61 }],
      dataKeys: ['credit', 'debit'], xAxisKey: 'bucket',
    }} />);
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
  });

  it('com valores negativos, renderiza linha de referência em y=0', () => {
    const { container } = render(<ChartBlock block={{
      id: 'n2', type: 'chart', chartType: 'bar', title: 'E&S',
      data: [{ bucket: 'mai. 2026', credit: 5_400_000, debit: -5_247_584.61 }],
      dataKeys: ['credit', 'debit'], xAxisKey: 'bucket',
    }} />);
    // Recharts renderiza ReferenceLine como .recharts-reference-line
    const referenceLine = container.querySelector('.recharts-reference-line');
    expect(referenceLine).toBeTruthy();
  });

  it('sem valores negativos, NÃO renderiza linha de referência', () => {
    const { container } = render(<ChartBlock block={{
      id: 'n3', type: 'chart', chartType: 'bar', title: 'Positivos Only',
      data: [{ bucket: 'mai. 2026', credit: 5_400_000, debit: 247_584.61 }],
      dataKeys: ['credit', 'debit'], xAxisKey: 'bucket',
    }} />);
    const referenceLine = container.querySelector('.recharts-reference-line');
    expect(referenceLine).toBeFalsy();
  });

  it('com layout horizontal + valores negativos, renderiza linha de referência', () => {
    const { container } = render(<ChartBlock block={{
      id: 'n4', type: 'chart', chartType: 'bar', title: 'E&S Horizontal',
      layout: 'horizontal',
      data: [{ bucket: 'mai. 2026', credit: 5_400_000, debit: -5_247_584.61 }],
      dataKeys: ['credit', 'debit'], xAxisKey: 'bucket',
    }} />);
    const referenceLine = container.querySelector('.recharts-reference-line');
    expect(referenceLine).toBeTruthy();
    // Em layout horizontal, Recharts renderiza o BarChart com layout="vertical"
    // e a ReferenceLine deve ser no eixo X (valores), não Y (categorias)
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
  });
});
