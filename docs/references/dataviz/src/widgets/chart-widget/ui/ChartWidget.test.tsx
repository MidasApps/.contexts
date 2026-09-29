/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartWidget } from './ChartWidget';
import { DonutBlock } from '@/pages/explore/ui/blocks/DonutBlock';
import type { DonutBlock as DonutBlockType } from '@/shared/config/agents/types';

// O chat do modal não é o objeto deste teste.
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => <div>CHAT</div> }));

/**
 * O defeito que estes testes trancam: a área de conteúdo tinha `height` FIXO
 * (240px para donut, 340px para gráfico). O donut não cabe nesse teto — a
 * rosca ocupa 160px e cada card lateral ~76px empilhado, então a partir de 4
 * fatias o conteúdo vazava por cima do card seguinte.
 *
 * A altura passou a ser espaço reservado (`minHeight`), não teto.
 */
function contentArea(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[role="img"]');
  if (!el) throw new Error('área de conteúdo não renderizada');
  return el;
}

const donut = (n: number): DonutBlockType => ({
  id: 'd1',
  type: 'donut',
  slices: Array.from({ length: n }, (_, i) => ({ name: `Faixa ${i}`, value: 10 + i })),
  format: 'currency',
});

describe('<ChartWidget> altura do conteúdo', () => {
  it('reserva a altura como mínimo, não como teto', () => {
    const { container } = render(
      <ChartWidget title="Recebíveis" height={240}>
        <div>conteúdo</div>
      </ChartWidget>,
    );
    const area = contentArea(container);
    expect(area.style.minHeight).toBe('240px');
    // `height` fixo é justamente o que recortava o donut.
    expect(area.style.height).toBe('');
  });

  it('donut com 6 fatias não é recortado pela caixa', () => {
    const { container } = render(
      <ChartWidget title="Recebíveis" height={240}>
        <DonutBlock block={donut(6)} />
      </ChartWidget>,
    );
    const area = contentArea(container);
    expect(area.style.height).toBe('');
    expect(area.style.overflow).not.toBe('hidden');
    // as 6 fatias continuam listadas — nenhuma some para "caber"
    expect(screen.getByText('Faixa 5')).toBeInTheDocument();
  });
});
