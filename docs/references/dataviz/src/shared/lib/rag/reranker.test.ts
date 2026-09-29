import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateObjectMock = vi.fn();
vi.mock('ai', async (orig) => ({
  ...(await orig<typeof import('ai')>()),
  generateObject: (...a: unknown[]) => generateObjectMock(...a),
}));
vi.mock('@ai-sdk/google-vertex', () => ({ vertex: (id: string) => ({ id }) }));

describe('rerank', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    vi.resetModules();
  });

  it('returns topN in score order', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ranked: [
          { index: 2, score: 0.95 },
          { index: 0, score: 0.7 },
          { index: 1, score: 0.4 },
        ],
      },
    });
    const { rerank } = await import('./reranker');
    const docs = [
      { content: 'a', similarity: 0.5 },
      { content: 'b', similarity: 0.5 },
      { content: 'c', similarity: 0.5 },
    ];
    const out = await rerank({ query: 'q', candidates: docs, topN: 2 });
    expect(out.map((d) => d.content)).toEqual(['c', 'a']);
  });

  it('falls back to original order on rerank failure', async () => {
    generateObjectMock.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const { rerank } = await import('./reranker');
    const docs = [
      { content: 'a', similarity: 0.5 },
      { content: 'b', similarity: 0.5 },
      { content: 'c', similarity: 0.5 },
    ];
    const out = await rerank({ query: 'q', candidates: docs, topN: 2 });
    expect(out).toEqual([docs[0], docs[1]]);
  });

  it('returns candidates unchanged when count <= topN', async () => {
    const { rerank } = await import('./reranker');
    const docs = [
      { content: 'a', similarity: 0.5 },
      { content: 'b', similarity: 0.5 },
    ];
    const out = await rerank({ query: 'q', candidates: docs, topN: 5 });
    expect(out).toEqual(docs);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
