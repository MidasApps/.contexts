import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed eviction tests (Bulk F3 / ADR-0013).
 *
 * Mock surface:
 *   db.collection(name).where('createdAt', '<', cutoff).get()
 *     -> { docs: QueryDocumentSnapshot[] }
 *   db.batch().delete(ref).commit()
 *
 * Each fake doc carries a `data()` callback that returns:
 *   { createdAt, lastReusedAt, templateId? }
 * `data().createdAt` is only used to compute the date filter (asserted via the
 * `where` mock); the JS-side filter checks `lastReusedAt` and `templateId`.
 */

interface FakeDoc {
  id: string;
  ref: { id: string };
  data: () => Record<string, unknown>;
}

const makeFirestoreMock = () => {
  const collections = new Map<string, FakeDoc[]>();
  const batchDeleteCalls: string[] = [];
  const batchCommitCalls = vi.fn(async () => undefined);
  const whereCalls: Array<{ collection: string; field: string; op: string; value: unknown }> = [];

  const collectionFn = (name: string) => ({
    where: vi.fn((field: string, op: string, value: unknown) => {
      whereCalls.push({ collection: name, field, op, value });
      return {
        get: vi.fn(async () => {
          const all = collections.get(name) ?? [];
          // Apply the createdAt < cutoff filter the test provides.
          if (field === 'createdAt' && op === '<' && value instanceof Date) {
            const cutoff = value;
            return {
              docs: all.filter((d) => {
                const created = d.data().createdAt as Date | undefined;
                return created instanceof Date && created < cutoff;
              }),
            };
          }
          return { docs: all };
        }),
      };
    }),
  });

  const batchFn = () => ({
    delete: vi.fn((ref: { id: string }) => {
      batchDeleteCalls.push(ref.id);
    }),
    commit: batchCommitCalls,
  });

  return {
    db: { collection: collectionFn, batch: batchFn },
    state: { collections, batchDeleteCalls, batchCommitCalls, whereCalls },
  };
};

let firestoreMock = makeFirestoreMock();

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => firestoreMock.db,
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: class FakeTimestamp {
    constructor(public _date: Date) {}
    toDate() {
      return this._date;
    }
  },
}));

vi.mock('./metrics', () => ({
  recordMemoryMetric: vi.fn(),
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vi.resetModules();
});

function makeDoc(
  id: string,
  data: { createdAt: Date; lastReusedAt?: Date | null; templateId?: string | null },
): FakeDoc {
  return {
    id,
    ref: { id },
    data: () => ({
      createdAt: data.createdAt,
      lastReusedAt: data.lastReusedAt ?? null,
      ...(data.templateId !== undefined ? { templateId: data.templateId } : {}),
    }),
  };
}

describe('runEviction (Firestore TTL)', () => {
  it('computes cutoff as now - 90d and applies it as createdAt where filter', async () => {
    firestoreMock.state.collections.set('embeddingsSql', []);
    firestoreMock.state.collections.set('embeddingsBlocks', []);

    const { runEviction } = await import('./eviction');
    await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });

    const expected = new Date('2026-05-03T00:00:00.000Z');
    const wheres = firestoreMock.state.whereCalls;
    expect(wheres).toHaveLength(2);
    expect(wheres[0]).toEqual({
      collection: 'embeddingsSql',
      field: 'createdAt',
      op: '<',
      value: expected,
    });
    expect(wheres[1]).toEqual({
      collection: 'embeddingsBlocks',
      field: 'createdAt',
      op: '<',
      value: expected,
    });
  });

  it('respects injected `now` for testing', async () => {
    firestoreMock.state.collections.set('embeddingsSql', []);
    firestoreMock.state.collections.set('embeddingsBlocks', []);
    const { runEviction } = await import('./eviction');
    await runEviction({ now: new Date('2026-12-31T00:00:00.000Z') });
    expect(firestoreMock.state.whereCalls[0]!.value).toEqual(
      new Date('2026-10-02T00:00:00.000Z'),
    );
  });

  it('deletes embeddingsSql docs older than 90d when lastReusedAt is null', async () => {
    const cutoff = new Date('2026-05-03T00:00:00.000Z');
    const old = new Date(cutoff.getTime() - 1000);
    firestoreMock.state.collections.set('embeddingsSql', [
      makeDoc('s1', { createdAt: old, lastReusedAt: null }),
      makeDoc('s2', { createdAt: old, lastReusedAt: null }),
    ]);
    firestoreMock.state.collections.set('embeddingsBlocks', []);

    const { runEviction } = await import('./eviction');
    const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });

    expect(out.sqlDeleted).toBe(2);
    expect(out.blocksDeleted).toBe(0);
    expect(firestoreMock.state.batchDeleteCalls).toEqual(['s1', 's2']);
    expect(firestoreMock.state.batchCommitCalls).toHaveBeenCalledTimes(1);
  });

  it('keeps embeddingsSql docs whose lastReusedAt is fresh', async () => {
    const cutoff = new Date('2026-05-03T00:00:00.000Z');
    const old = new Date(cutoff.getTime() - 1000);
    const fresh = new Date(cutoff.getTime() + 1000);
    firestoreMock.state.collections.set('embeddingsSql', [
      makeDoc('s_keep', { createdAt: old, lastReusedAt: fresh }),
      makeDoc('s_drop', { createdAt: old, lastReusedAt: null }),
    ]);
    firestoreMock.state.collections.set('embeddingsBlocks', []);

    const { runEviction } = await import('./eviction');
    const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });

    expect(out.sqlDeleted).toBe(1);
    expect(firestoreMock.state.batchDeleteCalls).toEqual(['s_drop']);
  });

  it('skips embeddingsBlocks whose templateId is non-null (curated pin)', async () => {
    const cutoff = new Date('2026-05-03T00:00:00.000Z');
    const old = new Date(cutoff.getTime() - 1000);
    firestoreMock.state.collections.set('embeddingsSql', []);
    firestoreMock.state.collections.set('embeddingsBlocks', [
      makeDoc('b_template', { createdAt: old, lastReusedAt: null, templateId: 'tpl-1' }),
      makeDoc('b_drop', { createdAt: old, lastReusedAt: null, templateId: null }),
    ]);

    const { runEviction } = await import('./eviction');
    const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });

    expect(out.blocksDeleted).toBe(1);
    expect(firestoreMock.state.batchDeleteCalls).toEqual(['b_drop']);
  });

  it('chunks delete batches at 500 docs per WriteBatch', async () => {
    const cutoff = new Date('2026-05-03T00:00:00.000Z');
    const old = new Date(cutoff.getTime() - 1000);
    const docs: FakeDoc[] = [];
    for (let i = 0; i < 1200; i++) {
      docs.push(makeDoc(`s${i}`, { createdAt: old, lastReusedAt: null }));
    }
    firestoreMock.state.collections.set('embeddingsSql', docs);
    firestoreMock.state.collections.set('embeddingsBlocks', []);

    const { runEviction } = await import('./eviction');
    const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });

    expect(out.sqlDeleted).toBe(1200);
    // 1200 / 500 = ceil(2.4) -> 3 batches.
    expect(firestoreMock.state.batchCommitCalls).toHaveBeenCalledTimes(3);
  });

  it('returns zeros when nothing matches', async () => {
    firestoreMock.state.collections.set('embeddingsSql', []);
    firestoreMock.state.collections.set('embeddingsBlocks', []);
    const { runEviction } = await import('./eviction');
    const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });
    expect(out).toEqual({ sqlDeleted: 0, blocksDeleted: 0 });
    expect(firestoreMock.state.batchCommitCalls).not.toHaveBeenCalled();
  });
});
