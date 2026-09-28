import { describe, it, expect, vi, beforeEach } from 'vitest';

const embedManyMock = vi.fn();
vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));

const textEmbeddingModelMock = vi.fn(() => ({ provider: 'vertex' }));
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { textEmbeddingModel: textEmbeddingModelMock },
}));

describe('embedTexts', () => {
  beforeEach(() => {
    embedManyMock.mockReset();
    textEmbeddingModelMock.mockClear();
    process.env.RAG_EMBEDDING_PROVIDER = 'vertex';
    process.env.RAG_EMBEDDING_MODEL = 'gemini-embedding-001';
    process.env.RAG_INGEST_BATCH_SIZE = '2';
  });

  it('batches inputs and concatenates embeddings', async () => {
    embedManyMock
      .mockResolvedValueOnce({ embeddings: [[0.1], [0.2]] })
      .mockResolvedValueOnce({ embeddings: [[0.3]] });
    const { embedTexts } = await import('./embeddings');
    const out = await embedTexts(['a', 'b', 'c']);
    expect(out).toEqual([[0.1], [0.2], [0.3]]);
    expect(embedManyMock).toHaveBeenCalledTimes(2);
  });

  it('retries on transient error and succeeds', async () => {
    embedManyMock
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce({ embeddings: [[0.5]] });
    const { embedTexts } = await import('./embeddings');
    const out = await embedTexts(['x']);
    expect(out).toEqual([[0.5]]);
  });

  it('throws after maxRetries', async () => {
    embedManyMock.mockRejectedValue(new Error('500'));
    const { embedTexts } = await import('./embeddings');
    await expect(embedTexts(['x'], { maxRetries: 2 })).rejects.toThrow(/500/);
  });
});
