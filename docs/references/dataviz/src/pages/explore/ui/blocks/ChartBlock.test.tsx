import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock } from './ChartBlock';

const base = {
  id: 'c1', type: 'chart' as const, chartType: 'stacked-bar' as const,
  title: 'x', data: [{ bucket: 'Pré', a: 1, b: 2 }], dataKeys: ['a', 'b'], xAxisKey: 'bucket',
};

describe('ChartBlock layout', () => {
  it('horizontal inverte eixos (categoria no Y)', () => {
    const { container } = render(<ChartBlock block={{ ...base, layout: 'horizontal' }} />);
    // Recharts marca o BarChart com a prop layout="vertical" (nomenclatura invertida da lib)
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
    // categoria ('Pré') deve aparecer no eixo Y, não no eixo X
    expect(container.querySelector('.recharts-yAxis-tick-labels')?.textContent).toContain('Pré');
    expect(container.querySelector('.recharts-xAxis-tick-labels')?.textContent).not.toContain('Pré');
  });
  it('sem layout renderiza como hoje', () => {
    const { container } = render(<ChartBlock block={base} />);
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
    // comportamento atual: categoria no eixo X
    expect(container.querySelector('.recharts-xAxis-tick-labels')?.textContent).toContain('Pré');
  });
});
