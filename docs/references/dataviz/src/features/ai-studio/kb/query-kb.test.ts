import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ vectorSearchMock: vi.fn(), repoListMock: vi.fn() }));
vi.mock('@/shared/lib/firestore/vector-search', () => ({ vectorSearch: h.vectorSearchMock }));
vi.mock('@/features/ai-studio/repo', () => ({
  AiStudioRepo: vi.fn().mockImplementation(function () { return { list: h.repoListMock }; }),
}));

import { resolveVisibleKbs, queryKbDocs } from './query-kb';

const fakeDb = { collection: () => ({}) } as unknown as FirebaseFirestore.Firestore;

beforeEach(() => { h.vectorSearchMock.mockReset(); h.repoListMock.mockReset(); });

describe('resolveVisibleKbs', () => {
  it('inclui globais e do cliente ativo; exclui outro cliente e archived; respeita refs', async () => {
    h.repoListMock.mockResolvedValueOnce([
      { id: 'g1', clientId: null, status: 'active' },
      { id: 'om1', clientId: 'OM', status: 'active' },
      { id: 'brz1', clientId: 'BRZ', status: 'active' },
      { id: 'g2', clientId: null, status: 'archived' },
    ]);
    const out = await resolveVisibleKbs(['g1', 'om1', 'brz1', 'g2'], 'OM', fakeDb);
    expect(out.sort()).toEqual(['g1', 'om1']);
  });

  it('cliente null vê só globais', async () => {
    h.repoListMock.mockResolvedValueOnce([
      { id: 'g1', clientId: null, status: 'active' },
      { id: 'om1', clientId: 'OM', status: 'active' },
    ]);
    const out = await resolveVisibleKbs(['g1', 'om1'], null, fakeDb);
    expect(out).toEqual(['g1']);
  });

  it('refs vazio → []', async () => {
    const out = await resolveVisibleKbs([], 'OM', fakeDb);
    expect(out).toEqual([]);
    expect(h.repoListMock).not.toHaveBeenCalled();
  });
});

describe('queryKbDocs', () => {
  it('knowledgeBaseIds vazio → [] sem chamar vectorSearch', async () => {
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: [] }, fakeDb);
    expect(out).toEqual([]);
    expect(h.vectorSearchMock).not.toHaveBeenCalled();
  });

  it('chama vectorSearch com filtro in e mapeia hits', async () => {
    h.vectorSearchMock.mockResolvedValueOnce([
      { id: 'c1', score: 0.9, data: { content: 'x', metadata: { filename: 'a.md' } } },
    ]);
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: ['k1', 'k2'] }, fakeDb);
    expect(h.vectorSearchMock).toHaveBeenCalledWith(expect.objectContaining({ filters: { knowledgeBaseId: ['k1', 'k2'] }, topK: 5 }));
    expect(out[0]).toMatchObject({ id: 'c1', content: 'x', similarity: 0.9 });
  });

  it('particiona >30 KBs em lotes e une por score', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `k${i}`);
    h.vectorSearchMock
      .mockResolvedValueOnce([{ id: 'a', score: 0.5, data: { content: 'a', metadata: {} } }])
      .mockResolvedValueOnce([{ id: 'b', score: 0.8, data: { content: 'b', metadata: {} } }]);
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: ids }, fakeDb);
    expect(h.vectorSearchMock).toHaveBeenCalledTimes(2);
    expect(out.map((x) => x.id)).toEqual(['b', 'a']); // ordenado por score desc
  });
});
