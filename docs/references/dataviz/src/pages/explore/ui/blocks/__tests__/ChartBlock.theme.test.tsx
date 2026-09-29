/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock } from '../ChartBlock';
import { CHART_INK_CLASS } from '@/shared/config/chart-theme';
import type { ChartBlock as ChartBlockType } from '@/shared/config/agents/types';

/**
 * O defeito que estes testes trancam: a tipografia do gráfico era branca fixa
 * (`rgba(255,255,255,…)`) nos eixos, na grade, nas linhas de referência e na
 * linha de zero. O app tem tema claro; ali virava branco sobre branco.
 *
 * A cor do SVG agora é `currentColor`, herdada do wrapper marcado com
 * `CHART_INK_CLASS` — é assim que ela acompanha o `data-theme` sem hook.
 */
const base: ChartBlockType = {
  id: 'c1',
  type: 'chart',
  chartType: 'bar',
  title: 'Fluxo',
  data: [{ bucket: 'jan', valor: 10 }, { bucket: 'fev', valor: -4 }],
  dataKeys: ['valor'],
  xAxisKey: 'bucket',
};

describe('<ChartBlock> cor por tema', () => {
  it('o wrapper define a tinta que o currentColor do SVG herda', () => {
    const { container } = render(<ChartBlock block={base} />);
    expect(container.firstElementChild?.className).toContain(CHART_INK_CLASS);
  });

  it('não pinta branco cravado em eixo, grade, zero ou linha de referência', () => {
    const { container } = render(
      <ChartBlock
        block={{ ...base, referenceLines: [{ y: 5, label: 'meta' }] }}
      />,
    );
    // A linha de zero só existe porque há valor negativo em `base`.
    expect(container.querySelectorAll('.recharts-reference-line').length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/rgba\(255\s*,\s*255\s*,\s*255/);
    expect(container.innerHTML).not.toMatch(/#fff/i);
  });

  it('cor explícita da linha de referência continua valendo', () => {
    const { container } = render(
      <ChartBlock block={{ ...base, referenceLines: [{ y: 5, color: '#F27C7C' }] }} />,
    );
    expect(container.innerHTML).toContain('#F27C7C');
  });

  it('rótulo de eixo sai com fill herdado do tema', () => {
    const { container } = render(<ChartBlock block={base} />);
    const tick = container.querySelector('.recharts-cartesian-axis-tick-value');
    expect(tick?.getAttribute('fill')).toBe('currentColor');
  });
});
