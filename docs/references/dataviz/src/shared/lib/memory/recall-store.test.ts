import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed recall-store tests (Bulk F3 / ADR-0013).
 *
 * Mock layout mirrors the slice of Firestore Admin SDK we touch:
 *   db.collection('embeddingsSql').add({...})           // upsertSqlEmbedding
 *   db.collection('embeddingsBlocks').add({...})        // upsertBlockEmbedding
 *   db.collection(coll).doc(id).update({...})           // bumpReuse
 *
 * `vectorSearch` is mocked at the module boundary so query path tests assert
 * filter/topK wiring without recomputing cosine here.
 */

const makeFirestoreMock = () => {
  const addMock = vi.fn(
    (_col: string, _data: Record<string, unknown>): void => undefined,
  );
  const updateMock = vi.fn(
    (_col: string, _id: string, _patch: Record<string, unknown>): void => undefined,
  );

  const docFn = (col: string) => (id: string) => ({
    id,
    update: vi.fn(async (patch: Record<string, unknown>) => updateMock(col, id, patch)),
  });

  const collectionFn = vi.fn((col: string) => ({
    add: vi.fn(async (data: Record<string, unknown>) => {
      addMock(col, data);
      return { id: 'auto-id' };
    }),
    doc: vi.fn(docFn(col)),
  }));

  return {
    db: { collection: collectionFn },
    state: { addMock, updateMock, collectionFn },
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
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
    increment: (n: number) => `INCREMENT(${n})`,
  },
  Timestamp: class {},
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vectorSearchMock.mockReset();
  vi.resetModules();
});

describe('recall-store.upsertSqlEmbedding', () => {
  const baseInput = {
    embedding: [0.1, 0.2],
    clientId: 'OM',
    personaId: 'originador',
    intent: 'safra',
    sqlText: 'SELECT 1',
    schemaSnapshot: { t: 1 },
    rowCount: 10,
    latencyMs: 100,
    glossaryVersion: 'v3',
    regulatoryPackVersion: 'cvm60-2026-04',
  };

  it('throws when clientId or personaId missing', async () => {
    const { upsertSqlEmbedding } = await import('./recall-store');
    await expect(upsertSqlEmbedding({ ...baseInput, clientId: '' })).rejects.toThrow(/clientId/);
    await expect(upsertSqlEmbedding({ ...baseInput, personaId: '' })).rejects.toThrow(/personaId/);
  });

  it('writes to embeddingsSql with normalized fields, reuseCount=0, serverTimestamp', async () => {
    const { upsertSqlEmbedding } = await import('./recall-store');
    await upsertSqlEmbedding(baseInput);

    expect(firestoreMock.state.addMock).toHaveBeenCalledTimes(1);
    const [coll, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(coll).toBe('embeddingsSql');
    expect(data).toMatchObject({
      clientId: 'OM',
      personaId: 'originador',
      intent: 'safra',
      sqlText: 'SELECT 1',
      schemaSnapshot: { t: 1 },
      rowCount: 10,
      latencyMs: 100,
      glossaryVersion: 'v3',
      regulatoryPackVersion: 'cvm60-2026-04',
      embedding: [0.1, 0.2],
      reuseCount: 0,
      lastReusedAt: null,
      createdAt: 'SERVER_TS',
    });
  });

  it('defaults glossaryVersion / regulatoryPackVersion to null when omitted', async () => {
    const { upsertSqlEmbedding } = await import('./recall-store');
    await upsertSqlEmbedding({
      ...baseInput,
      glossaryVersion: undefined,
      regulatoryPackVersion: undefined,
    });
    const [, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(data).toMatchObject({ glossaryVersion: null, regulatoryPackVersion: null });
  });
});

describe('recall-store.upsertBlockEmbedding', () => {
  const baseInput = {
    embedding: [0.3, 0.4],
    clientId: 'OM',
    blockType: 'kpi' as const,
    content: 'inadimplência 30d',
    blockSpec: { label: 'X', value: '10' },
    templateId: 'tpl-1',
  };

  it('throws when clientId missing', async () => {
    const { upsertBlockEmbedding } = await import('./recall-store');
    await expect(upsertBlockEmbedding({ ...baseInput, clientId: '' })).rejects.toThrow(/clientId/);
  });

  it('writes to embeddingsBlocks with reuseCount=0, lastReusedAt=null', async () => {
    const { upsertBlockEmbedding } = await import('./recall-store');
    await upsertBlockEmbedding(baseInput);

    expect(firestoreMock.state.addMock).toHaveBeenCalledTimes(1);
    const [coll, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(coll).toBe('embeddingsBlocks');
    expect(data).toMatchObject({
      clientId: 'OM',
      blockType: 'kpi',
      content: 'inadimplência 30d',
      blockSpec: { label: 'X', value: '10' },
      templateId: 'tpl-1',
      embedding: [0.3, 0.4],
      reuseCount: 0,
      lastReusedAt: null,
      createdAt: 'SERVER_TS',
    });
  });

  it('templateId defaults to null when omitted', async () => {
    const { upsertBlockEmbedding } = await import('./recall-store');
    await upsertBlockEmbedding({ ...baseInput, templateId: undefined });
    const [, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(data).toMatchObject({ templateId: null });
  });

  it('grava metricId quando fornecido (default null)', async () => {
    const { upsertBlockEmbedding } = await import('./recall-store');
    await upsertBlockEmbedding({ ...baseInput, metricId: 'carteira.x' });
    const [, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(data).toMatchObject({ metricId: 'carteira.x' });

    firestoreMock = makeFirestoreMock();
    const { upsertBlockEmbedding: u2 } = await import('./recall-store');
    await u2({ ...baseInput });
    const [, d2] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(d2).toMatchObject({ metricId: null });
  });
});

describe('recall-store.querySqlEmbeddings', () => {
  it('throws when clientId or personaId missing', async () => {
    const { querySqlEmbeddings } = await import('./recall-store');
    await expect(
      querySqlEmbeddings({ embedding: [0.1], clientId: '', personaId: 'p', topK: 3 }),
    ).rejects.toThrow(/clientId/);
    await expect(
      querySqlEmbeddings({ embedding: [0.1], clientId: 'OM', personaId: '', topK: 3 }),
    ).rejects.toThrow(/personaId/);
  });

  it('clamps topK to [1, 50]', async () => {
    vectorSearchMock.mockResolvedValue([]);
    const { querySqlEmbeddings } = await import('./recall-store');

    await querySqlEmbeddings({ embedding: [0.1], clientId: 'OM', personaId: 'p', topK: 999 });
    expect(vectorSearchMock.mock.calls[0]![0].topK).toBe(50);

    vectorSearchMock.mockClear();
    await querySqlEmbeddings({ embedding: [0.1], clientId: 'OM', personaId: 'p', topK: 0 });
    expect(vectorSearchMock.mock.calls[0]![0].topK).toBe(1);
  });

  it('passes clientId + personaId as filters and maps results to EmbeddedSql', async () => {
    vectorSearchMock.mockResolvedValueOnce([
      {
        id: 'r1',
        score: 0.9,
        data: {
          clientId: 'OM',
          personaId: 'originador',
          intent: 'safra',
          sqlText: 'SELECT 1',
          schemaSnapshot: { t: 1 },
          rowCount: 5,
          latencyMs: 42,
          glossaryVersion: 'v3',
          regulatoryPackVersion: 'cvm60-2026-04',
          reuseCount: 2,
        },
      },
    ]);
    const { querySqlEmbeddings } = await import('./recall-store');
    const out = await querySqlEmbeddings({
      embedding: [0.1, 0.2],
      clientId: 'OM',
      personaId: 'originador',
      topK: 3,
    });

    const call = vectorSearchMock.mock.calls[0]![0];
    expect(call.queryEmbedding).toEqual([0.1, 0.2]);
    expect(call.filters).toEqual({ clientId: 'OM', personaId: 'originador' });
    expect(call.topK).toBe(3);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'r1',
      clientId: 'OM',
      personaId: 'originador',
      intent: 'safra',
      sqlText: 'SELECT 1',
      schemaSnapshot: { t: 1 },
      rowCount: 5,
      latencyMs: 42,
      glossaryVersion: 'v3',
      regulatoryPackVersion: 'cvm60-2026-04',
      reuseCount: 2,
      score: 0.9,
    });
  });
});

describe('recall-store.queryBlockEmbeddings', () => {
  it('throws when clientId missing', async () => {
    const { queryBlockEmbeddings } = await import('./recall-store');
    await expect(
      queryBlockEmbeddings({ embedding: [0.1], clientId: '', blockType: 'kpi', topK: 3 }),
    ).rejects.toThrow(/clientId/);
  });

  it('passes clientId + blockType as filters and maps results', async () => {
    vectorSearchMock.mockResolvedValueOnce([
      {
        id: 'b1',
        score: 0.85,
        data: {
          clientId: 'OM',
          blockType: 'kpi',
          blockSpec: { label: 'X' },
          templateId: null,
          reuseCount: 1,
        },
      },
    ]);
    const { queryBlockEmbeddings } = await import('./recall-store');
    const out = await queryBlockEmbeddings({
      embedding: [0.1],
      clientId: 'OM',
      blockType: 'kpi',
      topK: 3,
    });

    const call = vectorSearchMock.mock.calls[0]![0];
    expect(call.filters).toEqual({ clientId: 'OM', blockType: 'kpi' });
    expect(call.topK).toBe(3);

    expect(out[0]).toMatchObject({
      id: 'b1',
      clientId: 'OM',
      blockType: 'kpi',
      blockSpec: { label: 'X' },
      templateId: null,
      reuseCount: 1,
      score: 0.85,
    });
  });

  it('mapeia metricId do doc (default null)', async () => {
    vectorSearchMock.mockResolvedValueOnce([
      { id: 'b1', score: 0.9, data: { clientId: 'OM', blockType: 'kpi', blockSpec: {}, metricId: 'carteira.x' } },
    ]);
    const { queryBlockEmbeddings } = await import('./recall-store');
    const out = await queryBlockEmbeddings({ embedding: [0.1], clientId: 'OM', blockType: 'kpi', topK: 1 });
    expect(out[0].metricId).toBe('carteira.x');
  });
});

describe('recall-store.bumpReuse', () => {
  it('rejects collection names not in allowlist', async () => {
    const { bumpReuse } = await import('./recall-store');
    await expect(bumpReuse('arbitrary' as never, ['x'])).rejects.toThrow(/collection/);
  });

  it('no-op when ids array is empty', async () => {
    const { bumpReuse } = await import('./recall-store');
    await bumpReuse('embeddingsSql', []);
    expect(firestoreMock.state.updateMock).not.toHaveBeenCalled();
  });

  it('updates each doc with reuseCount increment and serverTimestamp', async () => {
    const { bumpReuse } = await import('./recall-store');
    await bumpReuse('embeddingsSql', ['r1', 'r2']);
    expect(firestoreMock.state.updateMock).toHaveBeenCalledTimes(2);
    const calls = firestoreMock.state.updateMock.mock.calls;
    expect(calls[0]).toEqual([
      'embeddingsSql',
      'r1',
      { reuseCount: 'INCREMENT(1)', lastReusedAt: 'SERVER_TS' },
    ]);
    expect(calls[1]).toEqual([
      'embeddingsSql',
      'r2',
      { reuseCount: 'INCREMENT(1)', lastReusedAt: 'SERVER_TS' },
    ]);
  });

  it('routes embeddingsBlocks updates to the right collection', async () => {
    const { bumpReuse } = await import('./recall-store');
    await bumpReuse('embeddingsBlocks', ['b1']);
    expect(firestoreMock.state.updateMock).toHaveBeenCalledWith(
      'embeddingsBlocks',
      'b1',
      expect.objectContaining({ reuseCount: 'INCREMENT(1)' }),
    );
  });
});
