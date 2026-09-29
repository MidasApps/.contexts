/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LandingPage } from '../LandingPage';

function beamCardOf(text: string): HTMLElement {
  const card = screen.getAllByText(text)[0]!.closest('.p-px');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe('LandingPage', () => {
  it('mostra a navegação e os KPIs de demonstração', () => {
    render(<LandingPage />);
    expect(screen.getByText('Já tenho conta')).toBeTruthy();
    for (const label of ['Total de Contratos', 'Saldo Nominal', 'Inadimplência']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it('o card acende o feixe no hover e apaga ao sair', async () => {
    render(<LandingPage />);
    const card = beamCardOf('Total de Contratos');
    expect(card.className).toMatch(/bg-gradient-to-br/);

    fireEvent.mouseEnter(card);
    expect(card.className).not.toMatch(/bg-gradient-to-br/);
    await waitFor(() => expect(card.style.getPropertyValue('--beam-bg')).toContain('conic-gradient'));

    fireEvent.mouseLeave(card);
    await waitFor(() => expect(card.style.getPropertyValue('--beam-bg')).toBe(''));
    expect(card.style.getPropertyValue('--glow-bg')).toBe('');
    expect(card.className).toMatch(/bg-gradient-to-br/);
  });
});
