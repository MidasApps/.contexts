/* @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { SelectionBar } from '../SelectionBar';

describe('<SelectionBar>', () => {
  beforeEach(() => {
    useCanvasStore.setState({ pages: [], activePage: 0, selectedBlockIds: [] });
  });

  it('some quando não há seleção', () => {
    const { container } = render(<SelectionBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('conta os blocos selecionados', () => {
    useCanvasStore.setState({ selectedBlockIds: ['a', 'b'] });
    render(<SelectionBar />);
    expect(screen.getByText(/blocos selecionados/)).toBeInTheDocument();
  });

  it('limpa a seleção', () => {
    useCanvasStore.setState({ selectedBlockIds: ['a'] });
    render(<SelectionBar />);
    fireEvent.click(screen.getByRole('button', { name: /limpar seleção/i }));
    expect(useCanvasStore.getState().selectedBlockIds).toEqual([]);
  });

  /*
   * O que a seleção significa PARA A CONVERSA passou a ser dito ao lado do
   * campo de mensagem (`SelectedBlocksChip`). Repetir a frase aqui seria a
   * mesma informação em dois lugares, e um deles longe de onde ela importa.
   */
  it('não repete o aviso que agora vive no chat', () => {
    useCanvasStore.setState({ selectedBlockIds: ['a'] });
    render(<SelectionBar />);
    expect(screen.queryByText(/a IA ajustará/i)).not.toBeInTheDocument();
  });
});
