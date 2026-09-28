/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SingleKpiBlock as SingleKpiBlockType } from '@/shared/config/agents/types';
// O modal embute a `AISidebar`, que depende do router do Next. O assunto aqui
// é a amarração do KPI com o modal — o chat não entra nela.
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { SingleKpiBlock } from '../SingleKpiBlock';

/**
 * A comparação precisa sobreviver ao "expandir".
 *
 * O `KpiExpandedModal` já desenhava o selo "vs comparativo" — e o
 * `modalConfig` montado aqui simplesmente não o incluía. O card mostrava a
 * variação, a pessoa clicava para ver de perto, e ela sumia justamente na tela
 * ampliada, que é onde se vai olhar com atenção.
 */

function block(over: Partial<SingleKpiBlockType> = {}): SingleKpiBlockType {
  return {
    id: 'k1', type: 'kpi', metricId: 'm', label: 'Inadimplência',
    value: '4,81%', positiveIsGood: false,
    ...over,
  } as SingleKpiBlockType;
}

describe('SingleKpiBlock — comparação de período', () => {
  it('mostra a variação no card', () => {
    render(<SingleKpiBlock block={block({ deltaPercent: '12,3%', deltaDirection: 'up' })} expandable />);
    expect(screen.getByText('+12,3%')).toBeTruthy();
  });

  it('leva a variação para o modal ao expandir', () => {
    render(<SingleKpiBlock block={block({ deltaPercent: '12,3%', deltaDirection: 'up' })} expandable />);

    fireEvent.click(screen.getByLabelText('Ver detalhes de Inadimplência'));

    // `getAllBy`: o modal tem layout responsivo e desenha o selo mais de uma
    // vez (uma por variação de largura), com só uma visível por vez.
    expect(screen.getAllByText('vs comparativo').length).toBeGreaterThan(0);
  });

  it('sem comparação, nada de selo — nem no card, nem no modal', () => {
    render(<SingleKpiBlock block={block()} expandable />);
    expect(screen.queryByText('vs comparativo')).toBeNull();

    fireEvent.click(screen.getByLabelText('Ver detalhes de Inadimplência'));
    expect(screen.queryByText('vs comparativo')).toBeNull();
  });

  /**
   * `positiveIsGood: false` na inadimplência: subir é PIORA. O juízo é do
   * bloco e precisa atravessar até o modal junto com o número — senão a mesma
   * variação apareceria verde num lugar e vermelha no outro.
   */
  it('o juízo de bom/ruim acompanha o número', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ deltaPercent: '12,3%', deltaDirection: 'up' })} expandable />,
    );
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });

  /**
   * A queda tem de continuar sendo queda na tela ampliada.
   *
   * Card e modal montavam o selo com o mesmo `{sinal}{Math.abs(...)}`, e o
   * `sinal` só existia para o positivo: "-8,5%" virava "8.5%" nos dois — o
   * número de uma ALTA embaixo de uma seta para baixo.
   */
  it('a queda mantém o sinal no card e no modal', () => {
    render(<SingleKpiBlock block={block({ deltaPercent: '-8,5%', deltaDirection: 'down' })} expandable />);
    fireEvent.click(screen.getByLabelText('Ver detalhes de Inadimplência'));

    const texts = new Set(screen.getAllByText(/8[.,]5%/).map((s) => s.textContent));
    expect([...texts]).toEqual(['-8,5%']);
  });

  /**
   * Variação de três dígitos: `formatNumber` escreve "1.500,0%" em pt-BR, e o
   * parser do bloco tirava só a vírgula — `parseFloat("1.500.0")` devolve
   * **1,5**. Um salto de 1.500% aparecia como "+1,5%", que é ruído com cara de
   * estabilidade. `ComparisonBadge` (gauge e progresso) já removia o ponto de
   * milhar antes; o KPI, não.
   */
  it('variação de milhar não é truncada pelo separador', () => {
    render(<SingleKpiBlock block={block({ deltaPercent: '1.500,0%', deltaDirection: 'up' })} />);
    expect(screen.getByText('+1.500,0%')).toBeTruthy();
  });
});
