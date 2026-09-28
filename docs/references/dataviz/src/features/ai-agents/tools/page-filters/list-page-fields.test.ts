import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/shared/lib/firebase/admin', () => {
  const doc = () => ({ collection: () => ({ doc }), get: async () => h.get() });
  return { getDb: () => ({ collection: () => ({ doc }) }) };
});

import { createListPageFieldsTool } from './list-page-fields';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown> = {}): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const semanticContext = {
  clientId: 'vila-rosa',
  metrics: [
    {
      id: 'chat.extrato',
      name: 'Extrato',
      requires: [],
      recipe: { kind: 'sql', template: 'SELECT 1 WHERE {filter.banco} AND {filter.categoria}' },
      filterFields: {
        banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
        categoria: { expr: 'cat.traduzida', field: 'categoria', label: 'Categoria' },
      },
    },
    { id: 'covenants.saldo', name: 'Saldo', requires: [], recipe: { kind: 'sql', template: 'SELECT 1' } },
  ],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const ctx = (over: Record<string, unknown> = {}) => ({
  clientId: 'vila-rosa',
  activeGroupId: 'covenants',
  activeReportId: 'extrato-detalhado',
  semanticContext,
  ...over,
});

beforeEach(() => {
  h.get.mockReset().mockReturnValue({
    exists: true,
    data: () => ({
      blockMap: { b1: { metricId: 'chat.extrato' }, b2: { metricId: 'covenants.saldo' } },
      filters: { metricPageFilters: { banco: { kind: 'in', control: 'dropdown' } } },
    }),
  });
});

/**
 * ADR-0026 — o assistente precisa VER os indicadores da página para escolher o
 * campo do filtro. Sem isso ele garimpava no contrato do cliente inteiro e
 * escolhia coluna que não aparece em indicador nenhum.
 */
describe('list_page_fields', () => {
  it('lista os campos filtráveis dos indicadores da página, dizendo o que já foi declarado', async () => {
    const r = await run(createListPageFieldsTool(ctx()));

    expect(r.ok).toBe(true);
    expect(r.campos).toEqual([
      { campo: 'banco', chave: 'banco', metricId: 'chat.extrato', label: 'Banco', jaDeclarado: true },
      { campo: 'categoria', chave: 'categoria', metricId: 'chat.extrato', label: 'Categoria', jaDeclarado: false },
    ]);
  });

  /*
   * `jaDeclarado` sozinho não diz o que acontece se o modelo escolher aquele
   * campo: add_page_filter recusa com FILTRO_JA_EXISTE. Dizer aqui evita o
   * turno gasto para descobrir a restrição.
   */
  it('conta que campo já declarado é recusado, e como trocá-lo', async () => {
    const r = await run(createListPageFieldsTool(ctx()));

    expect(r.comoUsar).toMatch(/recusa/i);
    expect(r.comoUsar).toContain('remove_page_filter');
  });

  it('lista os indicadores da página, inclusive os que não oferecem filtro', async () => {
    const r = await run(createListPageFieldsTool(ctx()));

    expect(r.indicadoresDaPagina).toEqual(['chat.extrato', 'covenants.saldo']);
  });

  /*
   * Página sem campo filtrável não é erro — é resposta. O assistente precisa
   * dela para dizer ao usuário que ali não dá, em vez de inventar um seletor.
   */
  it('página sem campo filtrável responde a lista vazia, com o porquê', async () => {
    h.get.mockReturnValue({
      exists: true,
      data: () => ({ blockMap: { b2: { metricId: 'covenants.saldo' } }, filters: {} }),
    });

    const r = await run(createListPageFieldsTool(ctx()));

    expect(r.ok).toBe(true);
    expect(r.campos).toEqual([]);
    expect(r.comoUsar).toContain('filterFields');
  });

  it('sem página aberta não há indicador para listar', async () => {
    const r = await run(createListPageFieldsTool(ctx({ activeReportId: undefined })));

    expect(r).toMatchObject({ ok: false, error: 'SEM_PAGINA_ABERTA' });
  });

  it('página que não existe no banco', async () => {
    h.get.mockReturnValue({ exists: false });

    const r = await run(createListPageFieldsTool(ctx()));

    expect(r).toMatchObject({ ok: false, error: 'PAGINA_NAO_ENCONTRADA' });
  });
});
