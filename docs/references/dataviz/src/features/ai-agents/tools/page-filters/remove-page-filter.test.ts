import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '<<apagar>>' } }));
vi.mock('@/shared/lib/firebase/admin', () => {
  const doc = () => ({
    collection: () => ({ doc }),
    get: async () => h.get(),
    update: h.update,
  });
  return { getDb: () => ({ collection: () => ({ doc }) }) };
});

import { createRemovePageFilterTool } from './remove-page-filter';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown>): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const ctx = (over: Record<string, unknown> = {}) => ({
  clientId: 'vila-rosa',
  activeGroupId: 'covenants',
  activeReportId: 'extrato-detalhado',
  ...over,
});

beforeEach(() => {
  h.update.mockClear();
  h.get.mockReset().mockReturnValue({
    exists: true,
    data: () => ({
      filters: {
        metricPageFilters: {
          date_range: { kind: 'date_range', attribute: 'transacoes.data' },
          banco: { kind: 'in', control: 'dropdown', attribute: 'transacoes.banco_codigo', label: 'Banco' },
        },
      },
    }),
  });
});

describe('remove_page_filter', () => {
  it('remove pelo rótulo que o usuário vê', async () => {
    const r = await run(createRemovePageFilterTool(ctx()), { filtro: 'Banco' });

    expect(r).toMatchObject({ action: 'page_filter_removed', key: 'banco' });
    expect(h.update).toHaveBeenCalledWith({ 'filters.metricPageFilters.banco': '<<apagar>>' });
  });

  it('remove pela chave também', async () => {
    const r = await run(createRemovePageFilterTool(ctx()), { filtro: 'banco' });
    expect(r.action).toBe('page_filter_removed');
  });

  /**
   * `date_range` não é um seletor: é como as métricas da página recebem o
   * período escolhido no painel. Apagá-lo não tiraria controle da tela — faria
   * os blocos pararem de responder à data, sem erro nenhum.
   */
  it('recusa apagar o filtro de tempo da página', async () => {
    const r = await run(createRemovePageFilterTool(ctx()), { filtro: 'date_range' });

    expect(r).toMatchObject({ ok: false, error: 'FILTRO_DE_TEMPO' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('filtro inexistente devolve a lista do que existe', async () => {
    const r = await run(createRemovePageFilterTool(ctx()), { filtro: 'Categoria' });

    expect(r).toMatchObject({ ok: false, error: 'FILTRO_NAO_ENCONTRADO' });
    expect(r.message).toContain('Banco');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('sem página aberta não remove nada', async () => {
    const r = await run(createRemovePageFilterTool(ctx({ activeGroupId: undefined })), { filtro: 'Banco' });

    expect(r).toMatchObject({ ok: false, error: 'SEM_PAGINA_ABERTA' });
    expect(h.update).not.toHaveBeenCalled();
  });
});
