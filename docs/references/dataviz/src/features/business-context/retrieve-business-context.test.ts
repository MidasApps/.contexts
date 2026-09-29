import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadBusinessContextMock = vi.fn();
const getMacroSnapshotMock = vi.fn();
const embedTextsMock = vi.fn();
const queryDocsMock = vi.fn();
const rerankMock = vi.fn();

vi.mock('@/shared/config/business-context', () => ({
  loadBusinessContext: (...a: unknown[]) => loadBusinessContextMock(...a),
}));
// Borda nova: o perfil do cliente passou a vir do Firestore. Sem este mock o
// teste abre rede de verdade — foi o que aconteceu ao migrar, e é o mesmo
// modo de falha do achado R15 (teste não-hermético que estoura por timeout).
vi.mock('@/shared/repositories/client-business-profile', () => ({
  getClientBusinessProfile: async () => null,
  invalidateBusinessProfileCache: () => {},
}));
vi.mock('@/shared/lib/macro/bcb-sgs', () => ({
  getMacroSnapshot: (...a: unknown[]) => getMacroSnapshotMock(...a),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({
  embedTexts: (...a: unknown[]) => embedTextsMock(...a),
}));
vi.mock('@/shared/lib/rag/rag-service', () => ({
  queryDocs: (...a: unknown[]) => queryDocsMock(...a),
}));
vi.mock('@/shared/lib/rag/reranker', () => ({
  rerank: (...a: unknown[]) => rerankMock(...a),
}));
// O catálogo shipado ficou vazio com a purga de clientes. Sem este fixture o
// teste de wiring abaixo só conseguiria afirmar `template === null`, que passa
// mesmo se a chamada a selectTemplate for removida.
vi.mock('@/shared/config/dashboard-templates/templates-loader', () => ({
  loadDashboardTemplates: () => [
    {
      id: 'diretor-fii-cri-vila-rosa',
      persona: 'diretor-fii-cri',
      client: 'vila-rosa',
      kpis: [],
      visuals: [],
      tables: [],
    },
  ],
}));

describe('retrieveBusinessContext', () => {
  beforeEach(() => {
    loadBusinessContextMock.mockReset().mockReturnValue({});
    getMacroSnapshotMock.mockReset().mockResolvedValue({ source: 'BCB_SGS' });
    embedTextsMock.mockReset().mockResolvedValue([[0.1, 0.2]]);
    queryDocsMock.mockReset().mockResolvedValue([
      {
        id: 'a',
        sourcePath: 'docs/x.md',
        content: 'CRI sob CVM 60',
        metadata: {},
        similarity: 0.9,
      },
    ]);
    rerankMock
      .mockReset()
      .mockImplementation(
        async ({ candidates, topN }: { candidates: unknown[]; topN: number }) =>
          candidates.slice(0, topN),
      );
  });

  it('returns BusinessContext for valid args', async () => {
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    const ctx = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'diretor-fii-cri',
      briefing: 'Como está a OC?',
    });
    expect(ctx.retrieved).toHaveLength(1);
    expect(ctx.retrievalMeta.source).toBe('rag');
    expect(ctx.retrievalMeta.cacheHit).toBe(false);
  });

  it('returns cached on second call within TTL (cacheHit=true)', async () => {
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'cfo-securitizadora',
      briefing: 'X',
    });
    const second = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'cfo-securitizadora',
      briefing: 'X',
    });
    expect(second.retrievalMeta.cacheHit).toBe(true);
    expect(embedTextsMock).toHaveBeenCalledOnce();
  });

  it('falls back to source=fallback when both rag and macro fail', async () => {
    embedTextsMock.mockRejectedValueOnce(new Error('embed down'));
    getMacroSnapshotMock.mockRejectedValueOnce(new Error('macro down'));
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    const ctx = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'controller',
      briefing: 'Y',
    });
    expect(ctx.retrievalMeta.source).toBe('fallback');
    expect(ctx.retrieved).toEqual([]);
  });

  it('falls back to partial when only one of rag/macro fails', async () => {
    embedTextsMock.mockRejectedValueOnce(new Error('embed down'));
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    const ctx = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'controller',
      briefing: 'Z',
    });
    expect(ctx.retrievalMeta.source).toBe('partial');
  });

  it('selects template via selectTemplate', async () => {
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    const ctx = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'diretor-fii-cri',
      briefing: 'OC',
    });
    expect(ctx.template?.id).toBe('diretor-fii-cri-vila-rosa');
  });

  it('caps retrieved chunks at topN=5 via rerank', async () => {
    queryDocsMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        sourcePath: 'docs/x.md',
        content: `c${i}`,
        metadata: {},
        similarity: 1 - i * 0.01,
      })),
    );
    const { retrieveBusinessContext } = await import('./retrieve-business-context');
    const { clearCache } = await import('./cache');
    clearCache();
    const ctx = await retrieveBusinessContext({
      clientId: 'vila-rosa',
      personaId: 'cfo-securitizadora',
      briefing: 'big',
    });
    expect(ctx.retrieved.length).toBeLessThanOrEqual(5);
  });
});
