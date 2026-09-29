import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  doc: vi.fn(),
  set: vi.fn(async (..._a: unknown[]) => undefined),
  latest: vi.fn(),
  archive: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock('@/shared/lib/metrics/metric-revisions', () => ({
  latestRevision: (...a: unknown[]) => h.latest(...a),
  archiveRevision: (...a: unknown[]) => h.archive(...a),
}));
vi.mock('@/shared/lib/firestore/audit', () => ({
  auditFields: (email: string) => ({ updatedAt: { s: 0 }, updatedBy: email, schemaVersion: 2 }),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => h.doc(), set: h.set }) }) }),
}));

import { createRevertMetricTool } from './revert-metric';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown>): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const ctx = { clientId: 'vila-rosa', userEmail: 'u@e.com' };

const validDoc = (over: Record<string, unknown> = {}) => ({
  label: 'Vendas por mês',
  requires: ['liquid-play.contratos.data'],
  recipe: { kind: 'sql', template: 'SELECT 1 AS value' },
  shape: 'timeseries',
  outputColumns: ['bucket', 'value'],
  version: '1.0.0',
  status: 'active',
  ownerClientId: 'vila-rosa',
  ...over,
});

beforeEach(() => {
  h.set.mockClear();
  h.archive.mockClear();
  h.doc.mockReset().mockReturnValue({ exists: true, data: () => validDoc({ version: '1.0.2', label: 'Depois' }) });
  h.latest.mockReset().mockResolvedValue({
    version: '1.0.1',
    doc: validDoc({ version: '1.0.1', label: 'Antes', createdBy: 'quem@criou.com' }),
    archivedAt: { s: 0 },
    archivedBy: 'outro@e.com',
  });
});

describe('revert_metric', () => {
  it('restaura o documento anterior e continua subindo a versão', async () => {
    const r = await run(createRevertMetricTool(ctx), { metricId: 'chat.vendas' });

    expect(r).toMatchObject({ action: 'metric_reverted', restauradaDaVersao: '1.0.1', version: '1.0.3' });
    const saved = h.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.label).toBe('Antes');
    expect(saved.updatedBy).toBe('u@e.com');
    // O autor original não se recupera depois — vem do documento arquivado.
    expect(saved.createdBy).toBe('quem@criou.com');
  });

  /** Desfazer o desfazer precisa funcionar: o estado atual vai para o histórico. */
  it('arquiva o estado atual antes de substituí-lo', async () => {
    await run(createRevertMetricTool(ctx), { metricId: 'chat.vendas' });

    expect(h.archive).toHaveBeenCalledWith(
      expect.objectContaining({ doc: expect.objectContaining({ label: 'Depois' }) }),
    );
    expect(h.archive.mock.invocationCallOrder[0]!).toBeLessThan(h.set.mock.invocationCallOrder[0]!);
  });

  /** A forma pode ter mudado na alteração desfeita — o bloco precisa saber. */
  it('devolve as chaves do bloco depois de restaurar', async () => {
    const r = await run(createRevertMetricTool(ctx), { metricId: 'chat.vendas' });
    expect(r.aviso).toContain('xAxisKey: "bucket"');
  });

  it('sem histórico, avisa em vez de fingir que desfez', async () => {
    h.latest.mockResolvedValue(null);

    const r = await run(createRevertMetricTool(ctx), { metricId: 'chat.vendas' });

    expect(r).toMatchObject({ ok: false, error: 'SEM_HISTORICO' });
    expect(h.set).not.toHaveBeenCalled();
  });

  it('não restaura métrica de outro dono', async () => {
    h.doc.mockReturnValue({ exists: true, data: () => validDoc({ ownerClientId: null }) });

    const r = await run(createRevertMetricTool(ctx), { metricId: 'covenants.x' });

    expect(r).toMatchObject({ ok: false, error: 'METRICA_DE_OUTRO_DONO' });
    expect(h.set).not.toHaveBeenCalled();
  });

  /**
   * Documento arquivado antes de uma mudança de formato voltaria ao catálogo
   * como algo que o resto do sistema já não sabe ler.
   */
  it('recusa revisão que não é mais válida para o formato atual', async () => {
    h.latest.mockResolvedValue({ version: '0.9.0', doc: { label: 'Antiga' }, archivedAt: {}, archivedBy: 'x@e.com' });

    const r = await run(createRevertMetricTool(ctx), { metricId: 'chat.vendas' });

    expect(r).toMatchObject({ ok: false, error: 'REVISAO_INVALIDA' });
    expect(h.set).not.toHaveBeenCalled();
  });

  it('métrica inexistente não vira restauração silenciosa', async () => {
    h.doc.mockReturnValue({ exists: false, data: () => ({}) });

    const r = await run(createRevertMetricTool(ctx), { metricId: 'chat.nao_existe' });

    expect(r).toMatchObject({ ok: false, error: 'METRIC_NOT_FOUND' });
  });
});
