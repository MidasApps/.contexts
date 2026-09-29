/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  valor: {
    dateRange: { start: '2026-05-01', end: '2026-07-01' },
    setDateRange: vi.fn(),
    compareEnabled: false,
    setCompareEnabled: vi.fn(),
    comparePeriod: undefined as { start: string; end: string } | undefined,
    setComparePeriod: vi.fn(),
    viewMode: 'snapshot' as 'snapshot' | 'accumulated',
    setViewMode: vi.fn(),
    dataBaseOptions: [{ value: '2026-07-01' }, { value: '2026-05-01' }],
  },
}));

vi.mock('@/shared/providers/DataProvider', () => ({
  useDataFilters: () => ctx.valor,
}));

import { PageToolbar } from './PageToolbar';

beforeEach(() => {
  ctx.valor.setViewMode.mockClear();
  ctx.valor.setCompareEnabled.mockClear();
  ctx.valor.compareEnabled = false;
  ctx.valor.viewMode = 'snapshot';
});

/**
 * O recorte no tempo governa todo número da página, e vivia numa gaveta: o
 * período saiu dela primeiro, e agora saem também os dois controles que
 * dependem dele — o modo (posição do último mês × acumulado do período) e a
 * comparação. Separá-los do período era pedir para o usuário abrir um painel
 * para entender o que já está desenhado na tela.
 */
describe('<PageToolbar> — modo e comparação junto do período', () => {
  /*
   * "Acumulado" prometia soma, e só 4 dos 9 blocos que o modo alcança somam
   * (transações: entradas, saídas, extrato resumido, recebimentos). Os outros 4
   * — faixa de atraso ×3 e rating — agrupam por mês: acumular ali devolveria
   * uma barra por mês, não a soma, e somá-los contaria o mesmo contrato três
   * vezes. O rótulo passa a descrever o RECORTE, que é o que o controle de
   * fato faz na consulta; o que cada bloco faz com o período é do bloco.
   */
  it('alterna para todo o período', () => {
    render(<PageToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /todo o período/i }));

    expect(ctx.valor.setViewMode).toHaveBeenCalledWith('accumulated');
  });

  it('não promete soma no rótulo', () => {
    render(<PageToolbar />);

    expect(screen.queryByRole('button', { name: /acumulado/i })).toBeNull();
  });

  it('alterna de volta para Último mês', () => {
    ctx.valor.viewMode = 'accumulated';
    render(<PageToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /último mês/i }));

    expect(ctx.valor.setViewMode).toHaveBeenCalledWith('snapshot');
  });

  it('liga a comparação de períodos', () => {
    render(<PageToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /comparar/i }));

    expect(ctx.valor.setCompareEnabled).toHaveBeenCalledWith(true);
  });

  /*
   * Com a comparação ligada é preciso escolher CONTRA o quê. Sem este segundo
   * seletor o usuário liga o modo e não tem como dizer com que período comparar
   * — que era o motivo de o controle morar no painel.
   */
  it('com comparação ligada, oferece o período comparativo', () => {
    ctx.valor.compareEnabled = true;
    render(<PageToolbar />);

    // O separador e o seletor vazio são o que o usuário vê; o nome acessível
    // do seletor é coberto logo abaixo, em "os dois seletores de período têm
    // nomes distintos".
    expect(screen.getByText('vs')).toBeTruthy();
    expect(screen.getByText('Selecionar período')).toBeTruthy();
  });

  it('sem datas do dataset, não oferece período nem modo', () => {
    const withoutDates = { ...ctx.valor, dataBaseOptions: [] };
    ctx.valor.dataBaseOptions = withoutDates.dataBaseOptions;
    render(<PageToolbar />);

    expect(screen.queryByRole('button', { name: /todo o período/i })).toBeNull();
    ctx.valor.dataBaseOptions = [{ value: '2026-07-01' }, { value: '2026-05-01' }];
  });
});

/**
 * Os três controles do eixo do tempo são botões nus: nada neles diz que estão
 * ligados, e o segmentado não se anuncia como uma escolha entre duas opções.
 * Para quem não vê o realce em `bg-primary/15`, "Último mês" e "Todo o período"
 * são dois botões independentes sem estado — o modo corrente é invisível.
 */
describe('<PageToolbar> — os controles anunciam seu estado', () => {
  it('o segmentado se anuncia como um grupo com nome', () => {
    render(<PageToolbar />);

    expect(screen.getByRole('group', { name: /modo de visualização/i })).toBeTruthy();
  });

  it('o modo corrente vem marcado como escolhido, e o outro não', () => {
    render(<PageToolbar />);

    expect(screen.getByRole('button', { name: /último mês/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /todo o período/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('trocar o modo troca quem está marcado', () => {
    ctx.valor.viewMode = 'accumulated';
    render(<PageToolbar />);

    expect(screen.getByRole('button', { name: /todo o período/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /último mês/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('o botão de comparar diz se está ligado', () => {
    const { unmount } = render(<PageToolbar />);
    expect(screen.getByRole('button', { name: /comparar/i }).getAttribute('aria-pressed')).toBe('false');
    unmount();

    ctx.valor.compareEnabled = true;
    render(<PageToolbar />);
    expect(screen.getByRole('button', { name: /comparar/i }).getAttribute('aria-pressed')).toBe('true');
  });

  /*
   * Dois seletores de calendário lado a lado. Sem nome próprio os dois se
   * chamam pela faixa que exibem — e quando as duas faixas coincidem, ou quando
   * as duas estão vazias, viram o mesmo botão repetido.
   */
  it('os dois seletores de período têm nomes distintos', () => {
    ctx.valor.compareEnabled = true;
    render(<PageToolbar />);

    expect(screen.getByRole('button', { name: /período analisado/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /período comparativo/i })).toBeTruthy();
  });
});
