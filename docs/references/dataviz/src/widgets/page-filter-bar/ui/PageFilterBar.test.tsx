/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CanvasPageFilters } from '@/shared/config/agents/types';

const h = vi.hoisted(() => ({ fetchFilterValues: vi.fn() }));
vi.mock('@/shared/lib/metrics/fetch-filter-values', () => ({
  fetchFilterValues: (...a: unknown[]) => h.fetchFilterValues(...a),
}));

import { PageFilterBar } from './PageFilterBar';

beforeEach(() => {
  h.fetchFilterValues.mockReset().mockResolvedValue([{ value: '001' }, { value: '341' }]);
});

const FILTERS_WITH_DROPDOWN: CanvasPageFilters = {
  metricPageFilters: {
    banco: { kind: 'in', attribute: 'transacoes.banco_codigo', control: 'dropdown', label: 'Banco' },
  },
};

describe('<PageFilterBar>', () => {
  it('sem entradas dropdown declaradas → não renderiza nada', () => {
    const { container } = render(
      <PageFilterBar filters={{}} clientId="c" productId="p" values={{}} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(h.fetchFilterValues).not.toHaveBeenCalled();
  });

  it('com entrada dropdown: busca valores com clientId/productId/attribute/labelAttribute e renderiza o label', async () => {
    render(
      <PageFilterBar
        filters={FILTERS_WITH_DROPDOWN}
        clientId="vila-rosa"
        productId="covenants"
        values={{}}
        onChange={() => {}}
      />,
    );
    await waitFor(() => expect(h.fetchFilterValues).toHaveBeenCalledWith({
      clientId: 'vila-rosa',
      productId: 'covenants',
      attribute: 'transacoes.banco_codigo',
      labelAttribute: undefined,
    }));
    expect(screen.getByText('Banco')).toBeInTheDocument();
  });

  it('sem clientId/productId (ainda não resolvido) → não busca, mas mantém o label visível', () => {
    render(
      <PageFilterBar filters={FILTERS_WITH_DROPDOWN} values={{}} onChange={() => {}} />,
    );
    expect(h.fetchFilterValues).not.toHaveBeenCalled();
    expect(screen.getByText('Banco')).toBeInTheDocument();
  });

  it('valores selecionados exibem o trigger com a contagem (não "Todos"/estado de alerta padrão)', async () => {
    render(
      <PageFilterBar
        filters={FILTERS_WITH_DROPDOWN}
        clientId="vila-rosa"
        productId="covenants"
        values={{ banco: ['001', '341'] }}
        onChange={() => {}}
      />,
    );
    await waitFor(() => expect(h.fetchFilterValues).toHaveBeenCalled());
    // 2 selecionados de 2 opções → trigger mostra rótulo de "todos selecionados" (default: "Todos os itens").
    await waitFor(() => expect(screen.getByRole('button', { name: /todos os itens/i })).toBeInTheDocument());
  });
});

/**
 * O defeito que isto tranca: o dropdown ficava VAZIO com a resposta certa no
 * Network.
 *
 * Havia uma trava `fetchedSignatureRef` para não buscar duas vezes. Em
 * desenvolvimento o React monta o efeito, limpa e monta de novo: a primeira
 * passada gravava a assinatura e disparava a busca, a limpeza marcava
 * `cancelled`, a segunda via a assinatura igual e desistia — e a resposta da
 * primeira chegava para ser descartada. O usuário abria o filtro criado pela
 * IA e lia "Nenhum resultado".
 */
describe('<PageFilterBar> — sobrevive à remontagem do efeito', () => {
  it('mostra as opções mesmo com o efeito montado duas vezes (StrictMode)', async () => {
    render(
      <StrictMode>
        <PageFilterBar
          filters={FILTERS_WITH_DROPDOWN}
          clientId="vila-rosa"
          productId="covenants"
          values={{}}
          onChange={() => {}}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(h.fetchFilterValues).toHaveBeenCalled());

    // Abre o seletor: é aí que o usuário viu "Nenhum resultado".
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText('001')).toBeTruthy());
    expect(screen.getByText('341')).toBeTruthy();
    expect(screen.queryByText(/nenhum resultado/i)).toBeNull();
  });
});

/**
 * ADR-0026 — filtro declarado sobre o campo do indicador.
 *
 * O seletor lê as opções do resultado da métrica, então mostra o mesmo texto da
 * tela. Sem isso a tabela dizia "BANCO INTER" e o dropdown oferecia `77`.
 */
describe('<PageFilterBar> — campo do indicador', () => {
  const FILTER_BY_FIELD: CanvasPageFilters = {
    metricPageFilters: {
      banco: {
        kind: 'in',
        control: 'dropdown',
        label: 'Banco',
        source: { metricId: 'covenants.extrato_table', field: 'banco' },
      },
    },
  };

  it('busca por metricId/field, sem mandar attribute', async () => {
    h.fetchFilterValues.mockResolvedValue([{ value: 'BANCO INTER' }]);
    render(
      <PageFilterBar
        filters={FILTER_BY_FIELD}
        clientId="vila-rosa"
        productId="covenants"
        values={{}}
        onChange={() => {}}
      />,
    );

    await waitFor(() => expect(h.fetchFilterValues).toHaveBeenCalledWith({
      clientId: 'vila-rosa',
      productId: 'covenants',
      metricId: 'covenants.extrato_table',
      field: 'banco',
    }));
  });

  /*
   * Trocar a métrica de origem do filtro tem de refazer a busca. A assinatura
   * do efeito era `key:attribute:labelAttribute` — dois filtros por campo do
   * indicador têm attribute `undefined` nos dois, então sem incluir a origem a
   * troca passaria batida e o dropdown ficaria com as opções da métrica antiga.
   */
  it('trocar a métrica de origem refaz a busca', async () => {
    const { rerender } = render(
      <PageFilterBar filters={FILTER_BY_FIELD} clientId="c" productId="p" values={{}} onChange={() => {}} />,
    );
    await waitFor(() => expect(h.fetchFilterValues).toHaveBeenCalled());
    const before = h.fetchFilterValues.mock.calls.length;

    rerender(
      <PageFilterBar
        filters={{
          metricPageFilters: {
            banco: {
              kind: 'in', control: 'dropdown', label: 'Banco',
              source: { metricId: 'covenants.outra', field: 'banco' },
            },
          },
        }}
        clientId="c"
        productId="p"
        values={{}}
        onChange={() => {}}
      />,
    );

    await waitFor(() => expect(h.fetchFilterValues.mock.calls.length).toBeGreaterThan(before));
    expect(h.fetchFilterValues).toHaveBeenLastCalledWith(
      expect.objectContaining({ metricId: 'covenants.outra' }),
    );
  });
});
