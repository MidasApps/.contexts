/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MonthRangePicker } from './month-range-picker';

/**
 * O gatilho é um ícone de calendário mais uma faixa de datas — nada nele diz
 * QUE período ele governa. Enquanto havia um só na tela, dava para deduzir pelo
 * contexto; a `PageToolbar` agora monta DOIS lado a lado (o analisado e o
 * comparativo), e para quem lê a página por leitor de tela os dois botões
 * passaram a se chamar a mesma coisa: "mai/2026 — jul/2026".
 *
 * A prop `label` existia exatamente para essa distinção — declarada na
 * interface, passada por três call sites e nunca renderizada.
 */
describe('<MonthRangePicker> — o gatilho diz de que período se trata', () => {
  const props = {
    startDate: '2026-05-31',
    endDate: '2026-07-31',
    onRangeChange: vi.fn(),
    minDate: '2026-01-31',
    maxDate: '2026-12-31',
  };

  it('sem label, se apresenta como o período analisado', () => {
    render(<MonthRangePicker {...props} />);

    const trigger = screen.getByRole('button', { name: /período analisado/i });
    expect(trigger.textContent).toContain('mai/2026');
  });

  it('com label, diz qual período é — e mantém a faixa no nome', () => {
    render(<MonthRangePicker {...props} label="comparativo" />);

    expect(screen.getByRole('button', { name: /período comparativo/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /período analisado/i })).toBeNull();
  });

  /*
   * Vazio, o gatilho mostra o placeholder. O nome ainda precisa dizer QUAL
   * período está por preencher: "Selecionar período" em dois botões iguais é o
   * mesmo empate de antes.
   */
  it('vazio, o nome ainda distingue os dois', () => {
    render(<MonthRangePicker {...props} startDate="" endDate="" label="comparativo" placeholder="Selecionar período" />);

    expect(screen.getByRole('button', { name: /período comparativo/i })).toBeTruthy();
  });
});
