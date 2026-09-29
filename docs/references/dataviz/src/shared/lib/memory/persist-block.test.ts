import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const embedManyMock = vi.fn().mockResolvedValue({ embeddings: [Array(3072).fill(0.02)] });
vi.mock('./recall-store', () => ({ upsertBlockEmbedding: (...a: unknown[]) => upsertMock(...a) }));
vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { textEmbeddingModel: vi.fn(() => ({ provider: 'vertex' })) },
}));

describe('persistBlockSpec', () => {
  beforeEach(() => upsertMock.mockReset());

  it('persists KPI block with description + serialized spec', async () => {
    const { persistBlockSpec } = await import('./persist-block');
    await persistBlockSpec({
      clientId: 'OM', blockType: 'kpi',
      spec: { metric: 'inadimplencia_30d', format: 'percent' },
      description: 'Indicador inadimplência 30d para OM',
    });
    const arg = upsertMock.mock.calls[0][0];
    expect(arg).toMatchObject({ clientId: 'OM', blockType: 'kpi' });
    expect(arg.content).toContain('Indicador inadimplência 30d');
    expect(arg.content).toContain('inadimplencia_30d');
  });

  it('links variation to template_id when provided', async () => {
    const { persistBlockSpec } = await import('./persist-block');
    await persistBlockSpec({
      clientId: 'BRZ', blockType: 'chart', spec: {}, description: 'd',
      templateId: 't-orig-1',
    });
    expect(upsertMock.mock.calls[0][0].templateId).toBe('t-orig-1');
  });

  it('repassa metricId para upsertBlockEmbedding', async () => {
    const { persistBlockSpec } = await import('./persist-block');
    await persistBlockSpec({ clientId: 'OM', blockType: 'kpi', spec: {}, description: 'd', metricId: 'carteira.x' });
    expect(upsertMock.mock.calls[0][0].metricId).toBe('carteira.x');
  });
});
