/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasBlockRenderer } from '../../CanvasBlockRenderer';
import type { CanvasBlock } from '@/shared/config/agents/types';

// O chat do modal não é o objeto deste teste — o que se verifica aqui é se o
// bloco OFERECE o caminho para ele.
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => <div>CHAT</div> }));

/**
 * Clicar num indicador abre o modal com o chat sobre ele. Isso existia, e
 * sumiu do relatório por um `expandable={false}` fixo no renderer — escrito
 * quando ele só servia ao canvas da IA, onde o bloco está sendo arrastado e um
 * modal atrapalha. O relatório herdou a decisão sem ter o problema.
 *
 * Os testes abaixo prendem os dois lados: o relatório oferece, o canvas não.
 */
const gauge = {
  id: 'g1',
  type: 'gauge',
  label: 'Índice Recebível',
  value: 8.31,
  threshold: 1.2,
  suffix: 'x',
  metricId: 'covenants.indice_recebivel',
} as unknown as CanvasBlock;

// KPI SEM sparkline — o caso que nunca abria, porque o clique exigia série
// histórica e nenhum KPI dos templates de covenants declara uma.
const kpiWithoutHistory = {
  id: 'k1',
  type: 'kpi',
  label: 'Dívida Atual',
  value: 'R$ 8,56 mi',
  metricId: 'covenants.divida_atual',
} as unknown as CanvasBlock;

describe('CanvasBlockRenderer — abrir o chat do indicador', () => {
  it('KPI sem histórico oferece o botão de análise', () => {
    render(<CanvasBlockRenderer block={kpiWithoutHistory} expandable />);
    expect(screen.getByLabelText('Ver detalhes de Dívida Atual')).toBeTruthy();
  });

  it('gauge de covenant é clicável e alcançável por teclado', () => {
    const { container } = render(<CanvasBlockRenderer block={gauge} expandable />);
    const card = container.querySelector('[aria-label="Analisar Índice Recebível"]');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('role')).toBe('button');
    expect(card!.getAttribute('tabindex')).toBe('0');
  });

  it('sem expandable (canvas de edição) nada é clicável', () => {
    const { container } = render(<CanvasBlockRenderer block={gauge} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    const kpi = render(<CanvasBlockRenderer block={kpiWithoutHistory} />);
    expect(kpi.container.querySelector('button[aria-label^="Ver detalhes"]')).toBeNull();
  });

  // Durante o carregamento o valor ainda é o zero do template: abrir o chat ali
  // mandaria esse zero para o agente como se fosse o número do covenant.
  it('carregando não abre o chat', () => {
    const { container } = render(<CanvasBlockRenderer block={gauge} expandable loading />);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });
});
