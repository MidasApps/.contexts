/* @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import type { CanvasPage } from '@/shared/config/agents/types';
import { SelectedBlocksChip } from '../SelectedBlocksChip';

const PAGE: CanvasPage = {
  id: 'p1',
  title: 'Carteira',
  blockMap: {
    k1: { id: 'k1', type: 'kpi', label: 'Saldo devedor' },
    c1: { id: 'c1', type: 'chart', title: 'Inadimplência por safra' },
    x9: { id: 'x9', type: 'kpi' },
  } as unknown as CanvasPage['blockMap'],
  layout: [{ id: 'r1', blockIds: ['k1', 'c1', 'x9'] }] as unknown as CanvasPage['layout'],
};

function seed(selectedBlockIds: string[]) {
  useCanvasStore.setState({ pages: [PAGE], activePage: 0, selectedBlockIds });
}

describe('<SelectedBlocksChip>', () => {
  beforeEach(() => {
    useCanvasStore.setState({ pages: [], activePage: 0, selectedBlockIds: [] });
  });

  it('não ocupa espaço quando não há bloco selecionado', () => {
    seed([]);
    const { container } = render(<SelectedBlocksChip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nomeia o bloco em foco em vez de mostrar o id', () => {
    seed(['c1']);
    render(<SelectedBlocksChip />);
    expect(screen.getByText(/Inadimplência por safra/)).toBeInTheDocument();
  });

  it('usa o label quando o bloco não tem título', () => {
    seed(['k1']);
    render(<SelectedBlocksChip />);
    expect(screen.getByText(/Saldo devedor/)).toBeInTheDocument();
  });

  it('cai para o id quando o bloco não tem nome nenhum', () => {
    seed(['x9']);
    render(<SelectedBlocksChip />);
    expect(screen.getByText(/x9/)).toBeInTheDocument();
  });

  it('conta os blocos quando há mais de um', () => {
    seed(['k1', 'c1']);
    render(<SelectedBlocksChip />);
    expect(screen.getByText(/Editando 2 blocos/)).toBeInTheDocument();
  });

  /* Quando a IA responde citando ids, quem está no chat precisa conseguir
     casar o que leu com o que selecionou. */
  it('guarda os ids no title, para casar com o que a IA responde', () => {
    seed(['k1', 'c1']);
    render(<SelectedBlocksChip />);
    expect(screen.getByTestId('escopo-da-selecao')).toHaveAttribute('title', expect.stringContaining('k1'));
  });

  it('limpar devolve a conversa à página inteira', () => {
    seed(['k1', 'c1']);
    render(<SelectedBlocksChip />);
    fireEvent.click(screen.getByRole('button', { name: /limpar seleção/i }));
    expect(useCanvasStore.getState().selectedBlockIds).toEqual([]);
  });
});
