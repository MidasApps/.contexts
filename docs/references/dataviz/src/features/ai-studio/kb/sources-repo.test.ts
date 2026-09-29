import { describe, it, expect, beforeEach, vi } from 'vitest';

const { deleteKbDocChunksMock } = vi.hoisted(() => ({ deleteKbDocChunksMock: vi.fn() }));
vi.mock('./kb-upsert', () => ({ deleteKbDocChunks: deleteKbDocChunksMock }));

import { sourceDocId, upsertSource, listSources, deleteSource, recomputeKbCounters } from './sources-repo';

type DocData = Record<string, unknown>;
type FakeStore = Record<string, Record<string, DocData>>;
type Filter = [field: string, op: string, val: unknown];

interface FakeDb {
  store: FakeStore;
  collection(name: string): unknown;
}

function makeFakeDb(): FakeDb & FirebaseFirestore.Firestore {
  const store: FakeStore = {};
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col = {
        _f: [] as Filter[],
        doc(id: string) {
          return {
            async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; },
            async set(v: DocData, opts?: { merge?: boolean }) { store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...v } : v; },
            async update(v: DocData) { store[name][id] = { ...store[name][id], ...v }; },
            async delete() { delete store[name][id]; },
          };
        },
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; },
        async get(this: { _f?: Filter[] }) {
          const entries = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, , val]) => d[f] === val));
          return { docs: entries.map(([id, d]) => ({ id, data: () => d })) };
        },
      };
      return col;
    },
  } as unknown as FakeDb & FirebaseFirestore.Firestore;
}

describe('sources-repo', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); deleteKbDocChunksMock.mockReset().mockResolvedValue(0); });

  it('sourceDocId determinístico por (kb, filename)', () => {
    expect(sourceDocId('kb1', 'a.md')).toBe(sourceDocId('kb1', 'a.md'));
    expect(sourceDocId('kb1', 'a.md')).not.toBe(sourceDocId('kb1', 'b.md'));
  });

  it('upsertSource cria e re-upload (mesmo filename) reusa o id', async () => {
    const id1 = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 10, status: 'processing' }, db);
    const id2 = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 12, status: 'ready', chunkCount: 3 }, db);
    expect(id1).toBe(id2);
    expect(db.store.knowledgeBaseSources[id1].status).toBe('ready');
    expect(db.store.knowledgeBaseSources[id1].chunkCount).toBe(3);
  });

  it('listSources filtra por KB', async () => {
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 1 }, db);
    await upsertSource({ knowledgeBaseId: 'kb2', filename: 'b.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 1 }, db);
    const rows = await listSources('kb1', db);
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe('a.md');
  });

  it('recomputeKbCounters soma só os ready', async () => {
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 3 }, db);
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'b.md', mimeType: 't', sizeBytes: 1, status: 'error' }, db);
    db.store.knowledgeBases = { kb1: { name: 'KB1' } };
    await recomputeKbCounters('kb1', db);
    expect(db.store.knowledgeBases.kb1.docCount).toBe(1);
    expect(db.store.knowledgeBases.kb1.chunkCount).toBe(3);
  });

  it('deleteSource remove doc + chunks + recomputa', async () => {
    const id = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 3 }, db);
    db.store.knowledgeBases = { kb1: { name: 'KB1' } };
    await deleteSource(id, db);
    expect(db.store.knowledgeBaseSources[id]).toBeUndefined();
    expect(deleteKbDocChunksMock).toHaveBeenCalledWith(id, db);
    expect(db.store.knowledgeBases.kb1.docCount).toBe(0);
  });
});
