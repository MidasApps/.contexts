import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateObjectMock = vi.fn();
vi.mock('ai', async (orig) => ({
  ...(await orig<typeof import('ai')>()),
  generateObject: (...a: unknown[]) => generateObjectMock(...a),
}));
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: (id: string) => ({ provider: 'vertex', modelId: id }),
}));

describe('extractChunkMetadata', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    vi.resetModules();
  });

  it('returns structured metadata', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        docType: 'regulatory',
        product: 'CRI',
        persona: 'securitizadora',
        regulatoryArea: 'CVM-60',
      },
    });
    const { extractChunkMetadata } = await import('./metadata-extractor');
    const m = await extractChunkMetadata('CRI sob CVM 60 ...', {
      sourcePath: 'docs/benchmarking/2 1.md',
    });
    expect(m.docType).toBe('regulatory');
    expect(m.product).toBe('CRI');
  });

  it('returns nulls when extractor cannot classify', async () => {
    generateObjectMock.mockResolvedValue({
      object: { docType: null, product: null, persona: null, regulatoryArea: null },
    });
    const { extractChunkMetadata } = await import('./metadata-extractor');
    const m = await extractChunkMetadata('texto genérico', { sourcePath: 'x.md' });
    expect(m.docType).toBeNull();
  });

  it('falls back to nulls on extractor error', async () => {
    generateObjectMock.mockImplementationOnce(() => Promise.reject(new Error('quota')));
    const { extractChunkMetadata } = await import('./metadata-extractor');
    const m = await extractChunkMetadata('t', { sourcePath: 'x.md' });
    expect(m).toEqual({
      docType: null,
      product: null,
      persona: null,
      regulatoryArea: null,
    });
  });
});
