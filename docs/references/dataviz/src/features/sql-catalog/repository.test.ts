import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed repository tests (Bulk F4 / ADR-0013).
 *
 * Mock surface mirrors the Admin SDK chain we use:
 *   db.collection(name).add(data) -> { id }
 *   db.collection(name).doc(id).{get,update}
 *   db.collection(name).where(...).where(...).orderBy(...).offset(n).limit(n).get()
 *   db.collection(name).where(...).where(...).limit(1).get()
 *   db.collection(name).where(...).count().get() -> { data: () => { count } }
 *   db.batch().update(ref, data).commit()
 */

interface DocState {
  id: string;
  data: Record<string, unknown>;
}

const makeFirestoreMock = () => {
  const collections = new Map<string, DocState[]>();
  const addedDocs: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  const updates: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  const batchUpdates: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  const batchCommits = vi.fn(async () => undefined);
  let autoId = 0;

  const docRef = (col: string, id: string) => ({
    id,
    get: vi.fn(async () => {
      const arr = collections.get(col) ?? [];
      const found = arr.find((d) => d.id === id);
      return {
        exists: !!found,
        id,
        data: () => found?.data,
      };
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      updates.push({ collection: col, id, data });
      const arr = collections.get(col) ?? [];
      const found = arr.find((d) => d.id === id);
      if (found) Object.assign(found.data, data);
      else collections.set(col, [...arr, { id, data: { ...data } }]);
    }),
  });

  const buildQuery = (col: string, filters: Array<[string, unknown]>) => {
    const apply = (rows: DocState[]) =>
      rows.filter((r) => filters.every(([f, v]) => r.data[f] === v));

    const queryObj: {
      where: (f: string, op: string, v: unknown) => typeof queryObj;
      orderBy: (f: string, dir?: 'asc' | 'desc') => typeof queryObj;
      offset: (n: number) => typeof queryObj;
      limit: (n: number) => typeof queryObj;
      get: () => Promise<{
        empty: boolean;
        docs: { id: string; ref: { update: (d: Record<string, unknown>) => Promise<void> }; data: () => Record<string, unknown> }[];
      }>;
      count: () => { get: () => Promise<{ data: () => { count: number } }> };
    } = {
      where: (f: string, _op: string, v: unknown) => buildQuery(col, [...filters, [f, v]]),
      orderBy: () => queryObj,
      offset: () => queryObj,
      limit: () => queryObj,
      get: async () => {
        const matched = apply(collections.get(col) ?? []);
        return {
          empty: matched.length === 0,
          docs: matched.map((m) => ({
            id: m.id,
            ref: docRef(col, m.id),
            data: () => m.data,
          })),
        };
      },
      count: () => ({
        get: async () => {
          const matched = apply(collections.get(col) ?? []);
          return { data: () => ({ count: matched.length }) };
        },
      }),
    };
    return queryObj;
  };

  const collectionFn = vi.fn((col: string) => ({
    add: vi.fn(async (data: Record<string, unknown>) => {
      const id = `auto-${++autoId}`;
      addedDocs.push({ collection: col, id, data });
      const arr = collections.get(col) ?? [];
      arr.push({ id, data: { ...data } });
      collections.set(col, arr);
      return { id };
    }),
    doc: vi.fn((id: string) => docRef(col, id)),
    where: (f: string, op: string, v: unknown) => buildQuery(col, [[f, v]]),
  }));

  const batchFn = vi.fn(() => ({
    update: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
      // We can't recover the col from ref alone, but tests assert on id/data only.
      batchUpdates.push({ collection: 'sqlCatalog', id: ref.id, data });
    }),
    commit: batchCommits,
  }));

  return {
    db: { collection: collectionFn, batch: batchFn },
    state: { collections, addedDocs, updates, batchUpdates, batchCommits },
  };
};

let firestoreMock = makeFirestoreMock();

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => firestoreMock.db,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
    increment: (n: number) => ({ __increment: n }),
  },
  Timestamp: class FakeTimestamp {
    constructor(public _date: Date) {}
    toDate() {
      return this._date;
    }
  },
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vi.resetModules();
});

describe('sql-catalog repository (Firestore)', () => {
  it('insertDraft creates draft doc with status=draft, useCount=0, server timestamps', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const result = await repo.insertDraft({
      intent: 'safra OM',
      sql: 'SELECT 1',
      clientId: 'OM',
      personaId: 'originador',
      schemaSnapshot: { tables: [] },
      tags: ['kpi', 'safra'],
    });
    expect(result.id).toMatch(/^auto-/);
    expect(result.sqlHash).toMatch(/^[0-9a-f]{64}$/);

    expect(firestoreMock.state.addedDocs).toHaveLength(1);
    const added = firestoreMock.state.addedDocs[0];
    expect(added.collection).toBe('sqlCatalog');
    expect(added.data).toMatchObject({
      intent: 'safra OM',
      sql: 'SELECT 1',
      clientId: 'OM',
      personaId: 'originador',
      tags: ['kpi', 'safra'],
      status: 'draft',
      useCount: 0,
      curatedBy: null,
      curatedAt: null,
      glossaryVersion: null,
      regulatoryPackVersion: null,
      createdAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
    });
  });

  it('insertDraft throws if clientId missing (multi-tenant guard)', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await expect(
      repo.insertDraft({
        intent: 'x',
        sql: 'SELECT 1',
        clientId: '',
        personaId: null,
        schemaSnapshot: null,
        tags: null,
      }),
    ).rejects.toThrow(/clientId/);
  });

  it('listByClient returns only docs of that tenant', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'a1', data: { clientId: 'A', status: 'approved', intent: 'a', sql: 'S', sqlHash: 'h', useCount: 1 } },
      { id: 'b1', data: { clientId: 'B', status: 'approved', intent: 'b', sql: 'S', sqlHash: 'h', useCount: 1 } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const out = await repo.listByClient({ clientId: 'A', limit: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a1');
    expect(out[0].client_id).toBe('A');
  });

  it('listByClient throws if clientId missing', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await expect(repo.listByClient({ clientId: '', limit: 10 })).rejects.toThrow(/clientId/);
  });

  it('listByClient applies status and personaId filters', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: '1', data: { clientId: 'OM', status: 'approved', personaId: 'originador', intent: 'i', sql: 'S', sqlHash: 'h' } },
      { id: '2', data: { clientId: 'OM', status: 'draft', personaId: 'originador', intent: 'i', sql: 'S', sqlHash: 'h' } },
      { id: '3', data: { clientId: 'OM', status: 'approved', personaId: 'gestor', intent: 'i', sql: 'S', sqlHash: 'h' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const out = await repo.listByClient({
      clientId: 'OM',
      status: 'approved',
      personaId: 'originador',
      limit: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('countByClient uses count() aggregation', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: '1', data: { clientId: 'OM', status: 'approved' } },
      { id: '2', data: { clientId: 'OM', status: 'approved' } },
      { id: '3', data: { clientId: 'OM', status: 'draft' } },
      { id: '4', data: { clientId: 'BRZ', status: 'approved' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    expect(await repo.countByClient({ clientId: 'OM' })).toBe(3);
    expect(await repo.countByClient({ clientId: 'OM', status: 'approved' })).toBe(2);
    expect(await repo.countByClient({ clientId: 'BRZ' })).toBe(1);
  });

  it('approve sets status=approved with curatedBy/curatedAt and gates qualityScore >= 0.7', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'abc', data: { clientId: 'OM', status: 'draft' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.approve({
      id: 'abc',
      curatedBy: 'admin@x',
      qualityScore: 0.85,
      glossaryVersion: 'v3',
      regulatoryPackVersion: 'r2',
    });
    const update = firestoreMock.state.updates[0];
    expect(update.id).toBe('abc');
    expect(update.data).toMatchObject({
      status: 'approved',
      curatedBy: 'admin@x',
      qualityScore: 0.85,
      glossaryVersion: 'v3',
      regulatoryPackVersion: 'r2',
      curatedAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
    });
  });

  it('approve rejects when qualityScore < 0.7 (ADR-0009 gate)', async () => {
    const { createRepository, QualityScoreTooLowError } = await import('./repository');
    const repo = createRepository();
    await expect(
      repo.approve({
        id: 'abc',
        curatedBy: 'admin@x',
        qualityScore: 0.5,
        glossaryVersion: 'v1',
        regulatoryPackVersion: 'r1',
      }),
    ).rejects.toThrow(QualityScoreTooLowError);
  });

  it('reject sets status=deprecated', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'abc', data: { clientId: 'OM', status: 'approved' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.reject({ id: 'abc' });
    const u = firestoreMock.state.updates[0];
    expect(u.id).toBe('abc');
    expect(u.data).toMatchObject({ status: 'deprecated', updatedAt: 'SERVER_TS' });
  });

  it('incrementUse scopes by clientId AND sqlHash; uses FieldValue.increment(1)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'm1', data: { clientId: 'OM', sqlHash: 'h1', useCount: 5 } },
      { id: 'm2', data: { clientId: 'BRZ', sqlHash: 'h1', useCount: 99 } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.incrementUse({ sqlHash: 'h1', clientId: 'OM' });
    expect(firestoreMock.state.updates).toHaveLength(1);
    const u = firestoreMock.state.updates[0];
    expect(u.id).toBe('m1');
    expect(u.data.useCount).toEqual({ __increment: 1 });
    expect(u.data.lastUsedAt).toBe('SERVER_TS');
    expect(u.data.updatedAt).toBe('SERVER_TS');
  });

  it('incrementUse no-op when no doc matches (sql_hash + clientId)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', []);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.incrementUse({ sqlHash: 'h1', clientId: 'OM' });
    expect(firestoreMock.state.updates).toHaveLength(0);
  });

  it('incrementUse throws if clientId missing', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await expect(repo.incrementUse({ sqlHash: 'h1', clientId: '' })).rejects.toThrow(
      /clientId/,
    );
  });

  it('markNeedsRevalidation bulk-updates affected ids via WriteBatch', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.markNeedsRevalidation({ affectedIds: ['a', 'b', 'c'] });
    const updates = firestoreMock.state.batchUpdates;
    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(updates[0].data).toMatchObject({
      status: 'needs_revalidation',
      updatedAt: 'SERVER_TS',
    });
    expect(firestoreMock.state.batchCommits).toHaveBeenCalledTimes(1);
  });

  it('markNeedsRevalidation chunks at 500 ids per batch', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    await repo.markNeedsRevalidation({ affectedIds: ids });
    // 1200 / 500 -> 3 commits
    expect(firestoreMock.state.batchCommits).toHaveBeenCalledTimes(3);
    expect(firestoreMock.state.batchUpdates).toHaveLength(1200);
  });

  it('markNeedsRevalidation no-op when affectedIds empty', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.markNeedsRevalidation({ affectedIds: [] });
    expect(firestoreMock.state.batchCommits).not.toHaveBeenCalled();
  });

  it('findByHash filters by sqlHash AND clientId (multi-tenant)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'x', data: { clientId: 'OM', sqlHash: 'h1', intent: 'i', sql: 'S' } },
      { id: 'y', data: { clientId: 'BRZ', sqlHash: 'h1', intent: 'i', sql: 'S' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const found = await repo.findByHash({ sqlHash: 'h1', clientId: 'OM' });
    expect(found?.id).toBe('x');
    expect(found?.client_id).toBe('OM');
  });

  it('findByHash returns null when no match', async () => {
    firestoreMock.state.collections.set('sqlCatalog', []);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const found = await repo.findByHash({ sqlHash: 'h1', clientId: 'OM' });
    expect(found).toBeNull();
  });

  it('findByHash throws if clientId missing', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await expect(repo.findByHash({ sqlHash: 'h', clientId: '' })).rejects.toThrow(/clientId/);
  });

  it('getById returns row when present, null otherwise', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'a', data: { clientId: 'OM', intent: 'i', sql: 'S', sqlHash: 'h', status: 'approved' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    const got = await repo.getById('a');
    expect(got?.id).toBe('a');
    expect(got?.status).toBe('approved');
    const miss = await repo.getById('zzz');
    expect(miss).toBeNull();
  });

  it('updateFields stamps updatedAt and applies provided fields only', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'a', data: { clientId: 'OM', intent: 'old', sql: 'S', sqlHash: 'h' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.updateFields({ id: 'a', intent: 'new', tags: ['k'] });
    const u = firestoreMock.state.updates[0];
    expect(u.id).toBe('a');
    expect(u.data).toMatchObject({ intent: 'new', tags: ['k'], updatedAt: 'SERVER_TS' });
  });

  it('updateFields recomputes sqlHash when sql changes', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      { id: 'a', data: { clientId: 'OM', sql: 'OLD', sqlHash: 'old' } },
    ]);
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.updateFields({ id: 'a', sql: 'SELECT 99' });
    const u = firestoreMock.state.updates[0];
    expect(u.data.sql).toBe('SELECT 99');
    expect(u.data.sqlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('updateFields no-op when no fields set', async () => {
    const { createRepository } = await import('./repository');
    const repo = createRepository();
    await repo.updateFields({ id: 'a' });
    expect(firestoreMock.state.updates).toHaveLength(0);
  });
});
