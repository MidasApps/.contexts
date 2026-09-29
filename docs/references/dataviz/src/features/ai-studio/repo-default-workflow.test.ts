import { describe, it, expect, beforeEach } from 'vitest';
import { AiStudioRepo } from './repo';

type DocData = Record<string, unknown>;
type FakeStore = Record<string, Record<string, DocData>>;
type Filter = [field: string, op: string, val: unknown];

interface FakeDb {
  store: FakeStore;
  collection(name: string): unknown;
  batch(): unknown;
}

// Fake Firestore com doc get/set/update + where('==').get() + batch.
function makeFakeDb(initial: Record<string, DocData> = {}): FakeDb & FirebaseFirestore.Firestore {
  const store: FakeStore = { aiWorkflows: JSON.parse(JSON.stringify(initial)) };
  function docRef(name: string, id: string) {
    return {
      id,
      async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; },
      async set(v: DocData, opts?: { merge?: boolean }) { store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...v } : v; },
      async update(v: DocData) { store[name][id] = { ...store[name][id], ...v }; },
      async delete() { delete store[name][id]; },
    };
  }
  const db = {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col = {
        _f: [] as Filter[],
        doc: (id: string) => docRef(name, id),
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; },
        async get(this: { _f?: Filter[] }) {
          const entries = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, , val]) => d[f] === val));
          return { docs: entries.map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })) };
        },
      };
      return col;
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        update(ref: { id: string }, v: DocData) { ops.push(() => { store.aiWorkflows[ref.id] = { ...store.aiWorkflows[ref.id], ...v }; }); },
        async commit() { ops.forEach((o) => o()); },
      };
    },
  };
  return db as unknown as FakeDb & FirebaseFirestore.Firestore;
}

describe('AiStudioRepo — enforcement 1-default (workflow)', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb({
      default: { name: 'Default', status: 'active', isDefault: true, instruction: 'i', origin: 'system', systemKey: 'default' },
      wfb: { name: 'B', status: 'active', isDefault: false, instruction: 'i', origin: 'user' },
    });
  });

  it('patch isDefault:true em wfb desmarca o default anterior', async () => {
    const repo = new AiStudioRepo('workflow', db);
    await repo.patch('wfb', { isDefault: true });
    expect(db.store.aiWorkflows.wfb.isDefault).toBe(true);
    expect(db.store.aiWorkflows.default.isDefault).toBe(false);
  });

  it('patch isDefault:false no único default → lança', async () => {
    // torna `default` o único default (wfb já é false)
    const repo = new AiStudioRepo('workflow', db);
    await expect(repo.patch('default', { isDefault: false })).rejects.toThrow(/default/i);
  });

  it('upsert workflow com isDefault:true desmarca os outros', async () => {
    const repo = new AiStudioRepo('workflow', db);
    await repo.upsert('wfc', { name: 'C', status: 'active', isDefault: true, instruction: 'i', description: 'd' });
    expect(db.store.aiWorkflows.wfc.isDefault).toBe(true);
    expect(db.store.aiWorkflows.default.isDefault).toBe(false);
  });

  it('tipo != workflow não dispara a lógica de default', async () => {
    const skillDb = makeFakeDb();
    skillDb.store.aiSkills = { s1: { name: 'S', status: 'active', origin: 'user', playbook: 'p' } };
    const repo = new AiStudioRepo('skill', skillDb);
    await repo.patch('s1', { playbook: 'novo' }); // não deve tentar where('isDefault')
    expect(skillDb.store.aiSkills.s1.playbook).toBe('novo');
  });
});
