import { describe, it, expect, beforeEach } from 'vitest';
import { migrateEmbeddingsToKb } from './migrate-embeddings-to-kb';

type Doc = Record<string, unknown>;

/** Firestore de mentira: select/orderBy/limit/startAfter/get e batch().update/commit. */
function makeFakeDb() {
  const store: Record<string, Record<string, Doc>> = { embeddingsDocs: {} };
  const stats = { commits: 0, gets: 0 };
  const snapshot = (name: string, id: string) => ({
    id,
    get: (f: string) => store[name]![id]![f],
    ref: { name, id },
  });
  const query = (name: string, lim = Infinity, after?: string) => ({
    select: () => query(name, lim, after),
    orderBy: () => query(name, lim, after),
    limit: (n: number) => query(name, n, after),
    startAfter: (s: { id: string }) => query(name, lim, s.id),
    async get() {
      stats.gets++;
      const ids = Object.keys(store[name]!).sort().filter((id) => after === undefined || id > after).slice(0, lim);
      const docs = ids.map((id) => snapshot(name, id));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return {
    store,
    stats,
    collection(name: string) {
      store[name] ??= {};
      return query(name);
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        update(ref: { name: string; id: string }, v: Doc) { ops.push(() => { store[ref.name]![ref.id] = { ...store[ref.name]![ref.id], ...v }; }); },
        async commit() { stats.commits++; ops.forEach((op) => op()); },
      };
    },
  } as never as FirebaseFirestore.Firestore & { store: typeof store; stats: typeof stats };
}

describe('migrateEmbeddingsToKb', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('marca docs sem knowledgeBaseId com default; pula os que já têm', async () => {
    db.store.embeddingsDocs = {
      legacy1: { content: 'a', clientId: 'OM' },
      legacy2: { content: 'b', clientId: 'OM' },
      already: { content: 'c', knowledgeBaseId: 'mercado' },
    };
    const r = await migrateEmbeddingsToKb(db);
    expect(r.updated).toBe(2);
    expect(r.skipped).toBe(1);
    expect(db.store.embeddingsDocs!.legacy1!.knowledgeBaseId).toBe('default');
    expect(db.store.embeddingsDocs!.already!.knowledgeBaseId).toBe('mercado');
  });

  it('idempotente: 2ª passada não altera nada', async () => {
    db.store.embeddingsDocs = { legacy1: { content: 'a' } };
    await migrateEmbeddingsToKb(db);
    const r2 = await migrateEmbeddingsToKb(db);
    expect(r2.updated).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  /** Restaurar um backup é o caso de muitos documentos: lê e grava por página. */
  it('percorre uma coleção grande em páginas e grava um batch por página', async () => {
    db.store.embeddingsDocs = Object.fromEntries(
      Array.from({ length: 1234 }, (_, i) => [`d${String(i).padStart(5, '0')}`, { content: String(i) }]),
    );
    const r = await migrateEmbeddingsToKb(db, 'restaurada');
    expect(r).toEqual({ updated: 1234, skipped: 0 });
    expect(db.stats.commits).toBe(3);
    expect(Object.values(db.store.embeddingsDocs!).every((d) => d.knowledgeBaseId === 'restaurada')).toBe(true);
  });

  it('não grava batch vazio quando a página não tem nada a migrar', async () => {
    db.store.embeddingsDocs = { a: { knowledgeBaseId: 'x' }, b: { knowledgeBaseId: 'y' } };
    await migrateEmbeddingsToKb(db);
    expect(db.stats.commits).toBe(0);
  });
});
