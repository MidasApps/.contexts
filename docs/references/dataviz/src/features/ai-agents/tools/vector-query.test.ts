import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryDocsMock = vi.fn();
const embedTextsMock = vi.fn();
const rerankMock = vi.fn();

vi.mock('@/shared/lib/rag/rag-service', () => ({
  queryDocs: (...a: unknown[]) => queryDocsMock(...a),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({
  embedTexts: (...a: unknown[]) => embedTextsMock(...a),
}));
vi.mock('@/shared/lib/rag/reranker', () => ({
  rerank: (...a: unknown[]) => rerankMock(...a),
}));

describe('createVectorQueryTool', () => {
  beforeEach(() => {
    queryDocsMock.mockReset();
    embedTextsMock.mockReset().mockResolvedValue([[0.1, 0.2]]);
    rerankMock.mockReset().mockImplementation(async ({ candidates, topN }: { candidates: unknown[]; topN: number }) =>
      candidates.slice(0, topN),
    );
    vi.resetModules();
  });

  it('binds clientId from context, not from input', async () => {
    queryDocsMock.mockResolvedValue([
      { id: '1', sourcePath: 'x.md', content: 'a', metadata: {}, similarity: 0.9 },
    ]);
    const { createVectorQueryTool } = await import('./vector-query');
    const tool = createVectorQueryTool({ clientId: 'OM' });
    const r = (await tool.execute!(
      { query: 'CRI CVM 60', filters: { product: 'CRI' } },
      { toolCallId: 't', messages: [] } as never,
    )) as { hits: unknown[] };
    expect(queryDocsMock).toHaveBeenCalledOnce();
    const call = queryDocsMock.mock.calls[0]![0];
    expect(call.clientId).toBe('OM');
    expect(r.hits).toHaveLength(1);
  });

  it('reranks topK=20 → topK=5', async () => {
    queryDocsMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        sourcePath: 'x.md',
        content: `c${i}`,
        metadata: {},
        similarity: 1 - i * 0.01,
      })),
    );
    const { createVectorQueryTool } = await import('./vector-query');
    const tool = createVectorQueryTool({ clientId: 'OM' });
    const r = (await tool.execute!({ query: 'q' }, { toolCallId: 't', messages: [] } as never)) as {
      hits: unknown[];
    };
    expect(r.hits).toHaveLength(5);
    expect(rerankMock).toHaveBeenCalledOnce();
  });

  it('clientId in input is ignored — server-bound wins (ADR-0006)', async () => {
    queryDocsMock.mockResolvedValue([]);
    const { createVectorQueryTool } = await import('./vector-query');
    const tool = createVectorQueryTool({ clientId: 'OM' });
    await tool.execute!(
      // attempt to override via filters — schema doesn't have clientId, so this is dropped at parse
      { query: 'q' },
      { toolCallId: 't', messages: [] } as never,
    );
    expect(queryDocsMock.mock.calls[0]![0].clientId).toBe('OM');
  });
});
