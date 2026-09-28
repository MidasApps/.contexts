/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import type { CanvasPage } from '@/shared/config/agents/types';

vi.mock('@/widgets/global-filters', () => ({
  GlobalFilters: () => <div data-testid="global-filters" />,
}));

vi.mock('../BlockPalette', () => ({
  BlockPalette: () => <div data-testid="block-palette" />,
}));

vi.mock('../CanvasBlockRenderer', () => ({
  CanvasBlockRenderer: () => <div data-testid="block" />,
}));

vi.mock('../SelectionBar', () => ({
  SelectionBar: () => null,
}));

vi.mock('../DeleteConfirmModal', () => ({
  DeleteConfirmModal: () => null,
}));

vi.mock('../BlockInspector', () => ({
  BlockInspector: () => null,
}));

import { CanvasPanel } from '../CanvasPanel';

const PAGE_WITH_BLOCK: CanvasPage = {
  id: 'p1',
  title: 'Página 1',
  blockMap: {
    k1: { id: 'k1', type: 'kpi', label: 'Saldo', value: 'R$ 1' },
  },
  layout: [{ id: 'row1', blockIds: ['k1'] }],
};

const EMPTY_PAGE: CanvasPage = {
  id: 'p1',
  title: 'Página vazia',
  blockMap: {},
  layout: [],
};

describe('CanvasPanel — showFilters', () => {
  beforeEach(() => {
    useCanvasStore.setState({ pages: [], activePage: 0, selectedBlockIds: [] });
  });

  it('por padrão (showFilters implícito), mostra o GlobalFilters quando há blocos', () => {
    useCanvasStore.setState({ pages: [PAGE_WITH_BLOCK], activePage: 0 });
    render(<CanvasPanel />);
    expect(screen.getByTestId('global-filters')).toBeInTheDocument();
  });

  it('showFilters={false} esconde o GlobalFilters quando há blocos (evita duplicar cliente/filtros com o header global)', () => {
    useCanvasStore.setState({ pages: [PAGE_WITH_BLOCK], activePage: 0 });
    render(<CanvasPanel showFilters={false} />);
    expect(screen.queryByTestId('global-filters')).not.toBeInTheDocument();
  });

  it('showFilters={false} também esconde o GlobalFilters no estado vazio (relatório novo em edição)', () => {
    useCanvasStore.setState({ pages: [EMPTY_PAGE], activePage: 0 });
    render(<CanvasPanel showFilters={false} />);
    expect(screen.queryByTestId('global-filters')).not.toBeInTheDocument();
  });

  it('authoring continua mostrando o BlockPalette independente de showFilters (TemplateEditorPage inalterado)', () => {
    useCanvasStore.setState({ pages: [PAGE_WITH_BLOCK], activePage: 0 });
    render(<CanvasPanel authoring />);
    expect(screen.getByTestId('block-palette')).toBeInTheDocument();
    expect(screen.queryByTestId('global-filters')).not.toBeInTheDocument();
  });
});

/**
 * `authoring` acumulava duas decisões: "é o editor de templates do admin" e
 * "dá para editar o conteúdo do bloco". O relatório precisava só da segunda —
 * herdar a primeira traria a paleta de blocos no lugar dos filtros.
 */
describe('CanvasPanel — editBlocks', () => {
  beforeEach(() => {
    useCanvasStore.setState({ pages: [PAGE_WITH_BLOCK], activePage: 0, selectedBlockIds: [] });
  });

  it('sem editBlocks não há lápis de editar conteúdo', () => {
    render(<CanvasPanel showFilters={false} />);
    expect(screen.queryByLabelText('Editar conteúdo de Saldo')).not.toBeInTheDocument();
  });

  it('editBlocks mostra o lápis SEM trazer a paleta de blocos junto', () => {
    render(<CanvasPanel showFilters={false} editBlocks />);
    expect(screen.getByLabelText('Editar conteúdo de Saldo')).toBeInTheDocument();
    expect(screen.queryByTestId('block-palette')).not.toBeInTheDocument();
  });

  it('authoring continua ligando o lápis por default', () => {
    render(<CanvasPanel authoring />);
    expect(screen.getByLabelText('Editar conteúdo de Saldo')).toBeInTheDocument();
  });
});

describe('CanvasPanel — reordenar bloco pelo teclado', () => {
  const TWO_BLOCKS: CanvasPage = {
    id: 'p1',
    title: 'Página 1',
    blockMap: {
      k1: { id: 'k1', type: 'kpi', label: 'Saldo', value: 'R$ 1', colSpan: 2 },
      k2: { id: 'k2', type: 'kpi', label: 'Dívida', value: 'R$ 2', colSpan: 2 },
    },
    layout: [{ id: 'row1', blockIds: ['k1', 'k2'] }],
  };

  beforeEach(() => {
    useCanvasStore.setState({ pages: [TWO_BLOCKS], activePage: 0, selectedBlockIds: [] });
  });

  it('seta para a direita na pega troca o bloco de lugar com o vizinho', async () => {
    const user = userEvent.setup();
    render(<CanvasPanel showFilters={false} />);

    screen.getByLabelText(/^Mover Saldo/).focus();
    await user.keyboard('{ArrowRight}');

    const row = useCanvasStore.getState().pages[0]!.layout[0]!;
    expect(row.blockIds).toEqual(['k2', 'k1']);
  });

  it('seta contra a borda não faz nada — não há vizinho para trocar', async () => {
    const user = userEvent.setup();
    render(<CanvasPanel showFilters={false} />);

    screen.getByLabelText(/^Mover Saldo/).focus();
    await user.keyboard('{ArrowLeft}');

    expect(useCanvasStore.getState().pages[0]!.layout[0]!.blockIds).toEqual(['k1', 'k2']);
  });

  it('seta repetida usa a ordem já atualizada, não a de antes do primeiro movimento', async () => {
    useCanvasStore.setState({
      pages: [{
        ...TWO_BLOCKS,
        blockMap: {
          ...TWO_BLOCKS.blockMap,
          k3: { id: 'k3', type: 'kpi', label: 'Limite', value: 'R$ 3', colSpan: 2 },
        },
        layout: [{ id: 'row1', blockIds: ['k1', 'k2', 'k3'] }],
      }],
    });
    const user = userEvent.setup();
    render(<CanvasPanel showFilters={false} />);

    screen.getByLabelText(/^Mover Saldo/).focus();
    await user.keyboard('{ArrowRight}');
    screen.getByLabelText(/^Mover Saldo/).focus();
    await user.keyboard('{ArrowRight}');

    expect(useCanvasStore.getState().pages[0]!.layout[0]!.blockIds).toEqual(['k2', 'k3', 'k1']);
  });
});

/**
 * O outro lado da grade — o par deste teste vive em `ReportPage.test.tsx`.
 *
 * Edição e leitura desenhavam a mesma página de dois jeitos: a leitura abria
 * uma grade por linha gravada e esticava blocos para fechá-la; a edição punha
 * tudo numa grade só, com a largura declarada. Os dois passaram a chamar
 * `widthStyle` da mesma `GRID_CLASS` — e cada lado tem um teste que
 * diz o que espera dela, para a próxima divergência falhar na suíte e não na
 * tela do usuário.
 */
describe('CanvasPanel — a grade dos blocos', () => {
  const THREE_WIDTHS: CanvasPage = {
    id: 'p1',
    title: 'Página 1',
    blockMap: {
      k1: { id: 'k1', type: 'kpi', label: 'Saldo', value: 'R$ 1', colSpan: 3 },
      k2: { id: 'k2', type: 'kpi', label: 'Dívida', value: 'R$ 2', colSpan: 2 },
      // Gravado fora da faixa do tipo (template antigo): renderiza como está.
      k3: { id: 'k3', type: 'kpi', label: 'Limite', value: 'R$ 3', colSpan: 6 },
    },
    layout: [{ id: 'row1', blockIds: ['k1', 'k2'] }, { id: 'row2', blockIds: ['k3'] }],
  };

  beforeEach(() => {
    useCanvasStore.setState({ pages: [THREE_WIDTHS], activePage: 0, selectedBlockIds: [] });
  });

  it('é uma grade só, com a largura que cada bloco declara', () => {
    render(<CanvasPanel showFilters={false} />);

    const cells = screen.getAllByTestId('block').map((b) => b.closest('[style*="grid-column"]'));
    expect(cells.map((c) => (c as HTMLElement | null)?.style.gridColumn)).toEqual([
      'span 3', 'span 2', 'span 6',
    ]);

    // As três células penduradas na MESMA grade: a linha gravada é ordem, não
    // corte — quem decide onde a linha quebra é o encaixe.
    const grade = cells[0]?.parentElement;
    expect(grade?.className).toContain('grid-cols-6');
    for (const cell of cells) expect(cell?.parentElement).toBe(grade);
  });
});
