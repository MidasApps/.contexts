import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed rag-service tests (Bulk F2 / ADR-0013).
 *
 * Mock layout mirrors the slice of Firestore Admin SDK we touch:
 *   db.collection('embeddingsDocs').doc(id).{get,set}
 *   db.collection('embeddingsDocs').where(...).get()
 *
 * `vectorSearch` is mocked at the module boundary so queryDocs tests assert
 * we wired filters/topK correctly without recomputing cosine here.
 */

interface DocState {
  exists: boolean;
  data: Record<string, unknown> | undefined;
}

const makeFirestoreMock = () => {
  const docs = new Map<string, DocState>();
  const setDoc = vi.fn();

  const docFn = (col: string) => (id: string) => {
    const path = `${col}/${id}`;
    return {
      id,
      get: vi.fn(async () => {
        const s = docs.get(path);
        return {
          exists: s?.exists ?? false,
          id,
          data: () => s?.data,
        };
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        setDoc(path, data);
        docs.set(path, { exists: true, data });
      }),
    };
  };

  const buildQuery = (col: string, filters: Array<[string, unknown]>) => ({
    where: vi.fn((field: string, _op: string, value: unknown) =>
      buildQuery(col, [...filters, [field, value]]),
    ),
    get: vi.fn(async () => {
      const matched = [...docs.entries()]
        .filter(([path]) => path.startsWith(`${col}/`))
        .filter(([, s]) =>
          filters.every(([f, v]) => (s.data as Record<string, unknown>)?.[f] === v),
        );
      return {
        empty: matched.length === 0,
        docs: matched.map(([path, s]) => ({
          id: path.slice(col.length + 1),
          data: () => s.data,
        })),
      };
    }),
  });

  const collectionFn = vi.fn((col: string) => ({
    doc: vi.fn(docFn(col)),
    where: (f: string, op: string, v: unknown) => buildQuery(col, [[f, v]]).where(f, op, v),
  }));

  return {
    db: { collection: collectionFn },
    state: { docs, setDoc },
  };
};

let firestoreMock = makeFirestoreMock();
const vectorSearchMock = vi.fn();

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => firestoreMock.db,
}));

vi.mock('@/shared/lib/firestore/vector-search', () => ({
  vectorSearch: (...a: unknown[]) => vectorSearchMock(...a),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  Timestamp: class {},
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vectorSearchMock.mockReset();
  vi.resetModules();
});

describe('RagService.upsertDoc', () => {
  const baseInput = {
    knowledgeBaseId: 'default',
    sourcePath: 'docs/benchmarking/x.md',
    chunkIndex: 0,
    content: 'body',
    contentHash: 'h1',
    embedding: [0.1, 0.2],
    embeddingModel: 'gemini-embedding-001',
    clientId: 'OM',
    docType: 'regulatory' as string | null,
    product: 'CRI' as string | null,
    persona: 'securitizadora' as string | null,
    regulatoryArea: 'CVM-60' as string | null,
    metadata: { headingPath: ['Title'] },
  };

  it('throws when clientId missing', async () => {
    const { upsertDoc } = await import('./rag-service');
    await expect(
      upsertDoc({ ...baseInput, clientId: '' }),
    ).rejects.toThrow(/clientId/);
  });

  it('writes doc with deterministic id (sha256 of clientId:sourcePath:chunkIndex)', async () => {
    const { upsertDoc } = await import('./rag-service');
    await upsertDoc(baseInput);

    const calls = firestoreMock.state.setDoc.mock.calls;
    expect(calls).toHaveLength(1);
    const [path, data] = calls[0]!;
    expect(path).toMatch(/^embeddingsDocs\/[a-f0-9]{64}$/);
    expect(data).toMatchObject({
      knowledgeBaseId: 'default',
      clientId: 'OM',
      sourcePath: 'docs/benchmarking/x.md',
      chunkIndex: 0,
      content: 'body',
      contentHash: 'h1',
      embedding: [0.1, 0.2],
      embeddingModel: 'gemini-embedding-001',
      docType: 'regulatory',
      product: 'CRI',
      persona: 'securitizadora',
      regulatoryArea: 'CVM-60',
      createdAt: 'SERVER_TS',
    });
  });

  it('skips write when existing doc has same contentHash + embeddingModel', async () => {
    const { upsertDoc } = await import('./rag-service');
    // First write.
    await upsertDoc(baseInput);
    expect(firestoreMock.state.setDoc).toHaveBeenCalledTimes(1);
    // Re-upsert with identical contentHash → skip.
    await upsertDoc(baseInput);
    expect(firestoreMock.state.setDoc).toHaveBeenCalledTimes(1);
  });

  /** Without a base the chunk was invisible to the assistant's search. */
  it('throws when knowledgeBaseId missing', async () => {
    const { upsertDoc } = await import('./rag-service');
    await expect(upsertDoc({ ...baseInput, knowledgeBaseId: ' ' })).rejects.toThrow(/knowledgeBaseId/);
    expect(firestoreMock.state.setDoc).not.toHaveBeenCalled();
  });

  /** A legacy chunk (no base) with the same content must be rewritten to get one. */
  it('rewrites an unchanged chunk that has no knowledge base yet', async () => {
    const { upsertDoc } = await import('./rag-service');
    await upsertDoc(baseInput);
    const [path, data] = firestoreMock.state.setDoc.mock.calls[0]!;
    firestoreMock.state.docs.set(path as string, { exists: true, data: { ...(data as object), knowledgeBaseId: undefined } });

    await upsertDoc(baseInput);

    expect(firestoreMock.state.setDoc).toHaveBeenCalledTimes(2);
    expect(firestoreMock.state.setDoc.mock.calls[1]![1]).toMatchObject({ knowledgeBaseId: 'default' });
  });

  it('knowledgeBaseExists reads knowledgeBases/{id}', async () => {
    const { knowledgeBaseExists } = await import('./rag-service');
    firestoreMock.state.docs.set('knowledgeBases/default', { exists: true, data: {} });
    expect(await knowledgeBaseExists('default')).toBe(true);
    expect(await knowledgeBaseExists('nao-existe')).toBe(false);
  });

  it('overwrites when contentHash changes', async () => {
    const { upsertDoc } = await import('./rag-service');
    await upsertDoc(baseInput);
    await upsertDoc({ ...baseInput, contentHash: 'h2', content: 'new body' });
    expect(firestoreMock.state.setDoc).toHaveBeenCalledTimes(2);
  });

  it('different (clientId, sourcePath, chunkIndex) → different doc id', async () => {
    const { upsertDoc } = await import('./rag-service');
    await upsertDoc(baseInput);
    await upsertDoc({ ...baseInput, chunkIndex: 1 });
    const paths = firestoreMock.state.setDoc.mock.calls.map((c) => c[0]);
    expect(new Set(paths).size).toBe(2);
  });
});

describe('RagService.queryDocs', () => {
  it('REQUIRES clientId filter', async () => {
    const { queryDocs } = await import('./rag-service');
    await expect(
      // @ts-expect-error testing runtime guard
      queryDocs({ embedding: [0.1], topK: 5 }),
    ).rejects.toThrow(/clientId/);
  });

  it('delegates to vectorSearch with clientId filter and maps results', async () => {
    vectorSearchMock.mockResolvedValueOnce([
      {
        id: 'a',
        score: 0.92,
        data: { sourcePath: 'p.md', content: 'c', metadata: { x: 1 } },
      },
    ]);
    const { queryDocs } = await import('./rag-service');
    const out = await queryDocs({ embedding: [0.1, 0.2], topK: 5, clientId: 'OM' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'a',
      sourcePath: 'p.md',
      content: 'c',
      metadata: { x: 1 },
      similarity: 0.92,
    });
    const call = vectorSearchMock.mock.calls[0]![0];
    expect(call.queryEmbedding).toEqual([0.1, 0.2]);
    expect(call.topK).toBe(5);
    expect(call.filters).toEqual({ clientId: 'OM' });
  });

  it('forwards optional product/persona/docType filters', async () => {
    vectorSearchMock.mockResolvedValueOnce([]);
    const { queryDocs } = await import('./rag-service');
    await queryDocs({
      embedding: [0.1],
      topK: 5,
      clientId: 'OM',
      filters: { product: 'CRI', persona: 'securitizadora', docType: 'regulatory' },
    });
    const call = vectorSearchMock.mock.calls[0]![0];
    expect(call.filters).toEqual({
      clientId: 'OM',
      product: 'CRI',
      persona: 'securitizadora',
      docType: 'regulatory',
    });
  });
});

describe('RagService.getExistingHashes', () => {
  it('returns empty map when no docs match sourcePath', async () => {
    const { getExistingHashes } = await import('./rag-service');
    const out = await getExistingHashes('docs/none.md');
    expect(out.size).toBe(0);
  });

  it('returns chunk_index → content_hash map for matching docs', async () => {
    const { upsertDoc, getExistingHashes } = await import('./rag-service');
    await upsertDoc({
      knowledgeBaseId: 'default',
      sourcePath: 'docs/x.md',
      chunkIndex: 0,
      content: 'a',
      contentHash: 'ha',
      embedding: [0],
      embeddingModel: 'm',
      clientId: 'OM',
      docType: null,
      product: null,
      persona: null,
      regulatoryArea: null,
      metadata: {},
    });
    await upsertDoc({
      knowledgeBaseId: 'default',
      sourcePath: 'docs/x.md',
      chunkIndex: 1,
      content: 'b',
      contentHash: 'hb',
      embedding: [0],
      embeddingModel: 'm',
      clientId: 'OM',
      docType: null,
      product: null,
      persona: null,
      regulatoryArea: null,
      metadata: {},
    });
    const out = await getExistingHashes('docs/x.md');
    expect(out.get(0)).toBe('ha');
    expect(out.get(1)).toBe('hb');
    expect(out.size).toBe(2);
  });
});
