import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ bindings: vi.fn(), ds: vi.fn() }));
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: (...a: unknown[]) => h.bindings(...a),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: (...a: unknown[]) => h.ds(...a),
}));

import { resolveClientQueryScope, catalogQueryScope, SHARED_REFERENCE_TABLES } from '../client-query-scope';

const VILA_ROSA = [
  { productId: 'liquid-play', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_monitor' }] },
  { productId: 'liquid-play-plus', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_covenants' }] },
];

beforeEach(() => {
  h.bindings.mockReset().mockResolvedValue({ ok: true, bindings: VILA_ROSA });
  h.ds.mockReset().mockResolvedValue({ projectId: 'proj-teste' });
});

describe('resolveClientQueryScope', () => {
  it('libera todos os datasets VINCULADOS ao cliente, com o projeto do dataSource', async () => {
    const scope = await resolveClientQueryScope({ clientId: 'vila-rosa', dataset: 'vila_rosa_monitor' });
    expect(h.bindings).toHaveBeenCalledWith('vila-rosa');
    expect(scope.defaultDataset).toBe('vila_rosa_monitor');
    expect(scope.allowed).toEqual(expect.arrayContaining([
      { projectId: 'proj-teste', datasetId: 'vila_rosa_monitor' },
      { projectId: 'proj-teste', datasetId: 'vila_rosa_covenants' },
      ...SHARED_REFERENCE_TABLES,
    ]));
  });

  it('referência compartilhada é por TABELA, não o dataset inteiro', () => {
    expect(SHARED_REFERENCE_TABLES).toEqual([
      { datasetId: 'dataviz_aux', tableIds: ['ba_bancos', 'ba_pluggy_categorias'] },
    ]);
  });

  it('sem clientId: só o dataset autorizado pela rota + referência compartilhada', async () => {
    const scope = await resolveClientQueryScope({ dataset: 'vila_rosa_monitor' });
    expect(h.bindings).not.toHaveBeenCalled();
    expect(scope.allowed).toEqual([{ datasetId: 'vila_rosa_monitor' }, ...SHARED_REFERENCE_TABLES]);
  });

  it('falha ao ler os bindings estreita (nunca alarga) o escopo', async () => {
    h.bindings.mockRejectedValueOnce(new Error('firestore fora'));
    const scope = await resolveClientQueryScope({ clientId: 'vila-rosa', dataset: 'vila_rosa_monitor' });
    expect(scope.allowed).toEqual([{ datasetId: 'vila_rosa_monitor' }, ...SHARED_REFERENCE_TABLES]);
  });

  it('dataset cujo dataSource não existe fica de fora', async () => {
    h.ds.mockImplementation(async (id: string) => (id === 'bq-main' ? null : { projectId: 'x' }));
    const scope = await resolveClientQueryScope({ clientId: 'vila-rosa', dataset: 'vila_rosa_monitor' });
    expect(scope.allowed).toEqual([{ datasetId: 'vila_rosa_monitor' }, ...SHARED_REFERENCE_TABLES]);
  });
});

describe('catalogQueryScope — entrada do catálogo de SQL (admin)', () => {
  it('uses only the datasets bound to the entry\'s client, the first one as default', async () => {
    const scope = await catalogQueryScope('vila-rosa');
    expect(scope).toEqual({
      defaultDataset: 'proj-teste.vila_rosa_monitor',
      allowed: [
        { projectId: 'proj-teste', datasetId: 'vila_rosa_monitor' },
        { projectId: 'proj-teste', datasetId: 'vila_rosa_covenants' },
        ...SHARED_REFERENCE_TABLES,
      ],
    });
  });

  it('returns null when the client has no bound dataset', async () => {
    h.bindings.mockResolvedValueOnce({ ok: true, bindings: [] });
    expect(await catalogQueryScope('sem-binding')).toBeNull();
  });

  it('returns null, never a wider scope, when the bindings cannot be read', async () => {
    h.bindings.mockRejectedValueOnce(new Error('firestore fora'));
    expect(await catalogQueryScope('vila-rosa')).toBeNull();
  });
});
