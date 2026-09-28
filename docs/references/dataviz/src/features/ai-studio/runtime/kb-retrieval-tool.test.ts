import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  embedTextsMock: vi.fn(), rerankMock: vi.fn(), resolveVisibleKbsMock: vi.fn(), queryKbDocsMock: vi.fn(),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({ embedTexts: h.embedTextsMock }));
vi.mock('@/shared/lib/rag/reranker', () => ({ rerank: h.rerankMock }));
vi.mock('@/features/ai-studio/kb/query-kb', () => ({ resolveVisibleKbs: h.resolveVisibleKbsMock, queryKbDocs: h.queryKbDocsMock }));

import { createKbRetrievalTool } from './kb-retrieval-tool';

// O tool() do pacote `ai` expõe um execute opcional; nos testes ele sempre existe.
interface KbHitOut { content: string; similarity: number; filename?: string; metadata: Record<string, unknown> }
type ExecutableTool = { execute: (input: { query: string }) => Promise<{ hits: KbHitOut[] }> };

beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('createKbRetrievalTool', () => {
  it('sem KB visível → hits vazio, não embeda', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce([]);
    const t = createKbRetrievalTool({ clientId: 'OM', knowledgeBaseRefs: ['x'] });
    const out = await (t as unknown as ExecutableTool).execute({ query: 'q' });
    expect(out.hits).toEqual([]);
    expect(h.embedTextsMock).not.toHaveBeenCalled();
  });

  it('com KB visível: embeda, busca escopado, reranqueia', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce(['k1', 'k2']);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    h.queryKbDocsMock.mockResolvedValueOnce([{ id: 'c1', content: 'a', similarity: 0.7, metadata: { filename: 'a.md' } }]);
    h.rerankMock.mockResolvedValueOnce([{ id: 'c1', content: 'a', similarity: 0.7, metadata: { filename: 'a.md' } }]);
    const t = createKbRetrievalTool({ clientId: 'OM', knowledgeBaseRefs: ['k1', 'k2'] });
    const out = await (t as unknown as ExecutableTool).execute({ query: 'inadimplência' });
    expect(h.queryKbDocsMock).toHaveBeenCalledWith(expect.objectContaining({ knowledgeBaseIds: ['k1', 'k2'] }));
    expect(out.hits[0]).toMatchObject({ content: 'a', similarity: 0.7 });
  });

  it('embedding vazio → hits vazio', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce(['k1']);
    h.embedTextsMock.mockResolvedValueOnce([]);
    const t = createKbRetrievalTool({ clientId: null, knowledgeBaseRefs: ['k1'] });
    const out = await (t as unknown as ExecutableTool).execute({ query: 'q' });
    expect(out.hits).toEqual([]);
  });
});
