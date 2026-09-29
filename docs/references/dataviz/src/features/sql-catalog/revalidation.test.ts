import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed revalidation tests (Bulk F4 / ADR-0013).
 *
 * Mock surface:
 *   db.collection(name).where(...).where(...).get() -> { docs: [{id, ref}] }
 *   db.batch().update(ref, data).commit()
 */

interface FakeDoc {
  id: string;
  ref: { id: string };
  data: () => Record<string, unknown>;
}

const makeFirestoreMock = () => {
  const collections = new Map<string, FakeDoc[]>();
  const whereCalls: Array<{ collection: string; field: string; op: string; value: unknown }> = [];
  const batchUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const batchCommits = vi.fn(async () => undefined);

  const collectionFn = (name: string) => {
    const buildQuery = (filters: Array<[string, string, unknown]>) => ({
      where: (f: string, op: string, v: unknown) => {
        whereCalls.push({ collection: name, field: f, op, value: v });
        return buildQuery([...filters, [f, op, v]]);
      },
      get: vi.fn(async () => {
        const arr = collections.get(name) ?? [];
        const filtered = arr.filter((d) =>
          filters.every(([f, op, v]) => {
            const dv = d.data()[f];
            if (op === '==') return dv === v;
            if (op === '!=') return dv !== v;
            return true;
          }),
        );
        return { docs: filtered };
      }),
    });
    return {
      where: (f: string, op: string, v: unknown) => {
        whereCalls.push({ collection: name, field: f, op, value: v });
        return buildQuery([[f, op, v]]);
      },
      doc: (id: string) => ({ id }),
    };
  };

  const batchFn = () => ({
    update: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
      batchUpdates.push({ id: ref.id, data });
    }),
    commit: batchCommits,
  });

  return {
    db: { collection: collectionFn, batch: batchFn },
    state: { collections, whereCalls, batchUpdates, batchCommits },
  };
};

let firestoreMock = makeFirestoreMock();

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => firestoreMock.db,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
  },
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vi.resetModules();
});

function makeDoc(id: string, data: Record<string, unknown>): FakeDoc {
  return { id, ref: { id }, data: () => data };
}

describe('revalidateCatalog (Firestore)', () => {
  it('issues two queries (glossary != / regulatory !=) on approved docs', async () => {
    firestoreMock.state.collections.set('sqlCatalog', []);
    const { revalidateCatalog } = await import('./revalidation');
    await revalidateCatalog({ glossaryVersion: 'v3', regulatoryPackVersion: 'r2' });

    const wheres = firestoreMock.state.whereCalls;
    // Two queries × two where() calls each = 4 entries.
    expect(wheres).toHaveLength(4);
    expect(wheres.filter((w) => w.field === 'status' && w.op === '==' && w.value === 'approved'))
      .toHaveLength(2);
    expect(wheres).toContainEqual({
      collection: 'sqlCatalog',
      field: 'glossaryVersion',
      op: '!=',
      value: 'v3',
    });
    expect(wheres).toContainEqual({
      collection: 'sqlCatalog',
      field: 'regulatoryPackVersion',
      op: '!=',
      value: 'r2',
    });
  });

  it('marks status=needs_revalidation for drifted approved docs (batched)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      makeDoc('d1', { status: 'approved', glossaryVersion: 'v2', regulatoryPackVersion: 'r2' }),
      makeDoc('d2', { status: 'approved', glossaryVersion: 'v3', regulatoryPackVersion: 'r1' }),
      makeDoc('d3', { status: 'approved', glossaryVersion: 'v3', regulatoryPackVersion: 'r2' }), // current
      makeDoc('d4', { status: 'draft',    glossaryVersion: 'v2', regulatoryPackVersion: 'r1' }), // not approved
    ]);
    const { revalidateCatalog } = await import('./revalidation');
    const out = await revalidateCatalog({ glossaryVersion: 'v3', regulatoryPackVersion: 'r2' });

    expect(out.affected).toBe(2);
    const ids = firestoreMock.state.batchUpdates.map((u) => u.id).sort();
    expect(ids).toEqual(['d1', 'd2']);
    for (const u of firestoreMock.state.batchUpdates) {
      expect(u.data).toMatchObject({
        status: 'needs_revalidation',
        updatedAt: 'SERVER_TS',
      });
    }
    expect(firestoreMock.state.batchCommits).toHaveBeenCalledTimes(1);
  });

  it('dedups doc that drifted on both fields (set-merge)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      makeDoc('both', { status: 'approved', glossaryVersion: 'v2', regulatoryPackVersion: 'r1' }),
    ]);
    const { revalidateCatalog } = await import('./revalidation');
    const out = await revalidateCatalog({ glossaryVersion: 'v3', regulatoryPackVersion: 'r2' });
    expect(out.affected).toBe(1);
    expect(firestoreMock.state.batchUpdates).toHaveLength(1);
  });

  it('returns affected=0 and no batch when nothing drifts (idempotency)', async () => {
    firestoreMock.state.collections.set('sqlCatalog', [
      makeDoc('ok', { status: 'approved', glossaryVersion: 'v3', regulatoryPackVersion: 'r2' }),
    ]);
    const { revalidateCatalog } = await import('./revalidation');
    const out = await revalidateCatalog({ glossaryVersion: 'v3', regulatoryPackVersion: 'r2' });
    expect(out.affected).toBe(0);
    expect(firestoreMock.state.batchCommits).not.toHaveBeenCalled();
  });

  it('chunks updates at 500 per WriteBatch', async () => {
    const docs: FakeDoc[] = [];
    for (let i = 0; i < 1100; i++) {
      docs.push(
        makeDoc(`d${i}`, { status: 'approved', glossaryVersion: 'old', regulatoryPackVersion: 'r2' }),
      );
    }
    firestoreMock.state.collections.set('sqlCatalog', docs);
    const { revalidateCatalog } = await import('./revalidation');
    const out = await revalidateCatalog({ glossaryVersion: 'v3', regulatoryPackVersion: 'r2' });
    expect(out.affected).toBe(1100);
    expect(firestoreMock.state.batchCommits).toHaveBeenCalledTimes(3); // ceil(1100/500)
  });
});
