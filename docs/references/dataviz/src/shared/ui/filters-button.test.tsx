/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/widgets/filter-panel', () => ({ FilterPanel: () => null }));

import { FiltersButton } from './filters-button';

/**
 * Repare no que NÃO está mockado aqui: o `DataProvider`.
 *
 * O botão chamava `useDataFilters()` dentro de um try/catch e jogava o
 * resultado fora — o hook servia só de sonda, e o `catch` fazia o botão sumir
 * fora do provedor. A justificativa era que "o painel que ele abre lê o
 * contexto"; desde que o eixo do tempo migrou para a `PageToolbar`, o painel
 * não lê mais nada de lá. O que sobrou é uma dependência que só sabe esconder
 * UI que funcionaria.
 */
describe('<FiltersButton>', () => {
  it('não depende do provedor de datas para se montar', () => {
    render(<FiltersButton />);

    expect(screen.getByRole('button', { name: /ajustes/i })).toBeTruthy();
  });

  /*
   * O contador somava "modo de visualização fora do padrão" e "comparação
   * ligada" — os dois controles que se mudaram para a barra da página. Deixá-lo
   * aqui faria o botão anunciar 2 ajustes ativos e abrir um painel onde nenhum
   * dos dois existe. O nome ACESSÍVEL é a âncora certa: um selo dentro do botão
   * entraria nele ("Ajustes 2"), coisa que um `queryByText('2')` não pegaria se
   * o selo voltasse com outro número.
   */
  it('não anuncia contagem de controles que saíram do painel', () => {
    render(<FiltersButton />);

    expect(screen.getByRole('button').textContent?.trim()).toBe('Ajustes');
  });
});
