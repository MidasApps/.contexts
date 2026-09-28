/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DonutBlock } from '../DonutBlock';
import type { DonutBlock as DonutBlockType } from '@/shared/config/agents/types';

/** Rosca com duas fatias — a forma do "Total de Recebíveis" do Vila Rosa. */
function block(extra: Partial<DonutBlockType> = {}): DonutBlockType {
  return {
    id: 'd', type: 'donut', title: 'Total de Recebíveis', format: 'currency',
    slices: [
      { name: 'Pós-chaves', value: 18_410_000 },
      { name: 'Pré-chaves', value: 4_080_000 },
    ],
    ...extra,
  } as DonutBlockType;
}

describe('<DonutBlock> — o total no centro da rosca', () => {
  /*
   * O total fica numa camada `absolute inset-0` sobre o gráfico, e vem DEPOIS
   * dele no DOM. Sem contexto de empilhamento próprio, essa ordem o punha na
   * frente do tooltip do Recharts: passar o mouse numa fatia mostrava a caixa
   * do tooltip com "R$ 22,5 mi" atravessado por cima dela.
   *
   * O total é pano de fundo — quem responde "quanto vale esta fatia" é o
   * tooltip, e ele é a camada de cima.
   */
  it('a camada do total fica atrás do tooltip', () => {
    const { container } = render(<DonutBlock block={block()} />);
    const center = container.querySelector('[data-centro-da-rosca]');
    expect(center, 'a camada do total precisa ser identificável').not.toBeNull();
    expect(center).toHaveClass('z-0');
  });

  it('não intercepta o mouse — a fatia embaixo continua clicável', () => {
    const { container } = render(<DonutBlock block={block()} />);
    expect(container.querySelector('[data-centro-da-rosca]')).toHaveClass('pointer-events-none');
  });

  it('mostra o rótulo e o total', () => {
    const { getByText } = render(<DonutBlock block={block()} />);
    expect(getByText('Total')).toBeInTheDocument();
    expect(getByText(/R\$ 22,5 mi/)).toBeInTheDocument();
  });

  it('respeita o rótulo declarado no bloco', () => {
    const { getByText } = render(<DonutBlock block={block({ centerLabel: 'Carteira' })} />);
    expect(getByText('Carteira')).toBeInTheDocument();
  });
});

/**
 * Expandir o bloco abre o `ChartWidget`, que clona o filho com `height="100%"`
 * para que ele ocupe a coluna inteira do diálogo. A rosca não aceitava a prop:
 * a coluna crescia e ela ficava do tamanho mínimo, encolhida a um canto com os
 * cards de legenda espremidos ao lado.
 */
describe('<DonutBlock> — altura no diálogo expandido', () => {
  it('aceita a altura que o diálogo passa', () => {
    const { container } = render(<DonutBlock block={block()} height="100%" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe('100%');
  });

  it('sem altura declarada, continua acompanhando o card', () => {
    const { container } = render(<DonutBlock block={block()} />);
    expect(container.firstElementChild).toHaveClass('h-full');
  });
});
