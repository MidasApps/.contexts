/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlockRail, blockProvenance } from '../BlockRail';
import type { CanvasBlock } from '@/shared/config/agents/types';
import type { Metric } from '@/shared/schemas/metric';

const KPI: CanvasBlock = {
  id: 'b1', type: 'kpi', label: 'Índice Recebível', value: '7,00x', metricId: 'indice_recebivel',
} as CanvasBlock;

const TEXT: CanvasBlock = { id: 'b2', type: 'text', content: 'Nota' } as CanvasBlock;

const CATALOG = [
  { id: 'indice_recebivel', label: 'Índice de Cobertura de Recebíveis' },
] as unknown as Metric[];

describe('blockProvenance', () => {
  it('mostra o rótulo da métrica que alimenta o bloco', () => {
    expect(blockProvenance(KPI, CATALOG)).toEqual({
      text: 'Índice de Cobertura de Recebíveis',
      missing: false,
    });
  });

  it('cai no id quando a métrica não está no catálogo carregado', () => {
    expect(blockProvenance(KPI, [])).toEqual({ text: 'indice_recebivel', missing: false });
  });

  it('acusa o bloco que consome métrica e está sem nenhuma', () => {
    const withoutMetric = { ...KPI, metricId: undefined } as CanvasBlock;
    expect(blockProvenance(withoutMetric, CATALOG)).toEqual({ text: 'sem métrica', missing: true });
  });

  it('quem não consome métrica mostra o nome do tipo, e não um alerta', () => {
    expect(blockProvenance(TEXT, CATALOG)).toEqual({ text: 'Texto', missing: false });
  });
});

function mount(props: Partial<Parameters<typeof BlockRail>[0]> = {}) {
  const spies = {
    onToggleSelection: vi.fn(),
    onDelete: vi.fn(),
    onChooseWidth: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onNudge: vi.fn(),
  };
  render(
    <BlockRail
      block={KPI}
      metrics={CATALOG}
      side="acima"
      visible
      selected={false}
      selectionPosition={null}
      width={2}
      range={{ min: 1, recommended: 2, max: 6 }}
      widthRationale="O valor a 30px pede ~240px."
      draggable
      {...spies}
      {...props}
    />,
  );
  return spies;
}

describe('BlockRail', () => {
  it('nomeia o bloco em cada ação, para três blocos não virarem três "excluir"', () => {
    mount();
    expect(screen.getByLabelText('Excluir Índice Recebível')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mover Índice Recebível/)).toBeInTheDocument();
    expect(screen.getByLabelText('Selecionar Índice Recebível para o assistente ajustar')).toBeInTheDocument();
  });

  it('as setas na pega empurram o bloco para os lados', async () => {
    const user = userEvent.setup();
    const { onNudge } = mount();
    screen.getByLabelText(/^Mover/).focus();
    await user.keyboard('{ArrowRight}');
    expect(onNudge).toHaveBeenCalledWith(1);
    await user.keyboard('{ArrowLeft}');
    expect(onNudge).toHaveBeenLastCalledWith(-1);
  });

  it('Delete na pega abre a confirmação em vez de excluir direto', async () => {
    const user = userEvent.setup();
    const { onDelete } = mount();
    screen.getByLabelText(/^Mover/).focus();
    await user.keyboard('{Delete}');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a marca de seleção anuncia o estado e a posição na fila', () => {
    mount({ selected: true, selectionPosition: 2 });
    const mark = screen.getByLabelText('Tirar Índice Recebível da seleção do assistente');
    expect(mark).toHaveAttribute('aria-pressed', 'true');
    expect(mark).toHaveTextContent('2');
  });

  it('sem onEditContent o lápis não existe', () => {
    mount();
    expect(screen.queryByLabelText(/^Editar conteúdo/)).not.toBeInTheDocument();
  });

  it('durante o streaming a pega deixa de ser arrastável', () => {
    mount({ draggable: false });
    expect(screen.getByLabelText(/^Mover/)).toHaveAttribute('draggable', 'false');
  });
});
