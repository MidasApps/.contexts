/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { KpiBlock as KpiBlockType } from '@/shared/config/agents/types';
// O modal embute a `AISidebar`, que depende do router do Next. O assunto aqui é
// o que o modal RECEBE do bloco — o chat não entra nisso.
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { KpiBlock } from '../KpiBlock';

/**
 * O bloco de vários KPIs é o irmão esquecido do `SingleKpiBlock`.
 *
 * Os dois montam o MESMO `KpiModalConfig` e abrem o MESMO modal, e a correção
 * que levou a variação comparativa para a tela ampliada foi feita só num deles.
 * Expandir um item daqui apagava o selo que o card ao lado mostrava.
 */

function block(item: Partial<KpiBlockType['items'][number]> = {}): KpiBlockType {
  return {
    id: 'kk', type: 'kpis',
    items: [{ label: 'Inadimplência', value: '4,81%', trendIsPositive: false, ...item }],
  } as KpiBlockType;
}

describe('<KpiBlock> — comparação de período', () => {
  it('mostra a variação no card', () => {
    render(<KpiBlock block={block({ deltaPercent: '12,3%', deltaDirection: 'up' })} expandable />);
    expect(screen.getByText('+12,3%')).toBeTruthy();
  });

  it('leva a variação para o modal ao expandir', () => {
    render(<KpiBlock block={block({ deltaPercent: '12,3%', deltaDirection: 'up' })} expandable />);

    fireEvent.click(screen.getByLabelText('Ver detalhes de Inadimplência'));

    expect(screen.getAllByText('vs comparativo').length).toBeGreaterThan(1);
  });

  it('sem comparação, nada de selo — nem no card, nem no modal', () => {
    render(<KpiBlock block={block()} expandable />);
    expect(screen.queryByText('vs comparativo')).toBeNull();

    fireEvent.click(screen.getByLabelText('Ver detalhes de Inadimplência'));
    expect(screen.queryByText('vs comparativo')).toBeNull();
  });

  /** Mesmo parser, mesmo defeito: "1.500,0%" não pode virar 1,5%. */
  it('variação de milhar não é truncada pelo separador', () => {
    render(<KpiBlock block={block({ deltaPercent: '1.500,0%', deltaDirection: 'up' })} />);
    expect(screen.getByText('+1.500,0%')).toBeTruthy();
  });
});
