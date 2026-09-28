import { describe, it, expect, beforeEach } from 'vitest';
import { kbChunkId, upsertKbChunks, pruneKbChunks, deleteKbDocChunks, type KbChunkInput } from './kb-upsert';

// Fake Firestore com collection().doc().set()/delete() e where().get()
type DocData = Record<string, unknown>;
type FakeStore = Record<string, Record<string, DocData>>;
interface FakeDb {
  store: FakeStore;
  collection(name: string): unknown;
}

function makeFakeDb(): FakeDb & FirebaseFirestore.Firestore {
  const store: FakeStore = {};
  const db: FakeDb = {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col = {
        doc(id: string) {
          return {
            async set(v: DocData) { store[name][id] = { ...(store[name][id] ?? {}), ...v }; },
            async delete() { delete store[name][id]; },
          };
        },
        _filters: [] as Array<[string, string, unknown]>,
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._filters = [...col._filters, [f, op, val]]; return c; },
        async get() {
          const entries = Object.entries(store[name]).filter(([, d]) =>
            (this._filters ?? []).every(([f, op, val]: [string, string, unknown]) =>
              op === '==' ? d[f] === val : op === '>=' ? (d[f] as number) >= (val as number) : true),
          );
          return { docs: entries.map(([id, d]) => ({ id, data: () => d, ref: col.doc(id) })) };
        },
      };
      return col;
    },
  };
  return db as unknown as FakeDb & FirebaseFirestore.Firestore;
}

const EMB = [1, 0, 0];
function chunk(i: number, over: Partial<KbChunkInput> = {}): KbChunkInput {
  return { knowledgeBaseId: 'kb1', sourceDocId: 's1', chunkIndex: i, content: `c${i}`, embedding: EMB, embeddingModel: 'gemini-embedding-001', clientId: null, metadata: {}, ...over };
}

describe('kb-upsert', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('kbChunkId é determinístico por (kb, sourceDoc, idx)', () => {
    expect(kbChunkId('kb1', 's1', 0)).toBe(kbChunkId('kb1', 's1', 0));
    expect(kbChunkId('kb1', 's1', 0)).not.toBe(kbChunkId('kb1', 's1', 1));
    expect(kbChunkId('kb1', 's1', 0)).not.toBe(kbChunkId('kb2', 's1', 0));
  });

  it('upsertKbChunks grava com id determinístico + campos KB', async () => {
    await upsertKbChunks([chunk(0), chunk(1)], db);
    const id0 = kbChunkId('kb1', 's1', 0);
    expect(db.store.embeddingsDocs[id0].knowledgeBaseId).toBe('kb1');
    expect(db.store.embeddingsDocs[id0].sourceDocId).toBe('s1');
    expect(db.store.embeddingsDocs[id0].clientId).toBeNull();
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(2);
  });

  it('re-upload reescreve os mesmos ids (idempotente)', async () => {
    await upsertKbChunks([chunk(0, { content: 'old' })], db);
    await upsertKbChunks([chunk(0, { content: 'new' })], db);
    const id0 = kbChunkId('kb1', 's1', 0);
    expect(db.store.embeddingsDocs[id0].content).toBe('new');
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(1);
  });

  it('pruneKbChunks remove órfãos (idx >= keepCount)', async () => {
    await upsertKbChunks([chunk(0), chunk(1), chunk(2)], db);
    await pruneKbChunks('kb1', 's1', 2, db); // mantém 0,1; remove 2
    expect(db.store.embeddingsDocs[kbChunkId('kb1', 's1', 2)]).toBeUndefined();
    expect(db.store.embeddingsDocs[kbChunkId('kb1', 's1', 1)]).toBeDefined();
  });

  it('deleteKbDocChunks remove todos do sourceDoc', async () => {
    await upsertKbChunks([chunk(0), chunk(1)], db);
    const n = await deleteKbDocChunks('s1', db);
    expect(n).toBe(2);
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(0);
  });
});
