/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { GaugeBlock } from '../GaugeBlock';
import type { GaugeBlock as GaugeBlockType } from '@/shared/config/agents/types';

// O happy-dom não mede o DOM: sem isto o ChartSizer nunca entrega largura e o
// arco não chega a ser desenhado.
vi.mock('@/widgets/chart-widget/ui/ChartSizer', () => ({
  ChartSizer: ({ children }: { children: (w: number, h: number) => ReactNode }) => children(240, 140),
}));

/**
 * O arco é um `<Pie>` que lê cada fatia pela chave do `dataKey` — uma STRING.
 * Quando a chave das fatias mudou de nome e o `dataKey` ficou para trás, o
 * gauge seguiu compilando e passando nos testes, só que sem arco nenhum.
 */
describe('GaugeBlock — arco', () => {
  it('desenha as fatias das faixas e do valor', () => {
    const block = {
      id: 'g', type: 'gauge', label: 'Índice', value: 1.5, threshold: 1.2, suffix: 'x', display: 'arc',
    } as GaugeBlockType;
    const { container } = render(<GaugeBlock block={block} loading={false} />);
    expect(container.querySelectorAll('.recharts-pie-sector').length).toBeGreaterThan(0);
  });
});
