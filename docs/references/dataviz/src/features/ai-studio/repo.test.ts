import { describe, it, expect, beforeEach } from 'vitest';
import { AiStudioRepo } from './repo';

// Fake Firestore mínimo (doc/collection/get/set/update/delete)
type DocData = Record<string, unknown>;
type FakeStore = Record<string, Record<string, DocData>>;
interface FakeDb {
  store: FakeStore;
  collection(name: string): unknown;
}

function makeFakeDb(initial: FakeStore = {}): FakeDb & FirebaseFirestore.Firestore {
  const store: FakeStore = JSON.parse(JSON.stringify(initial));
  const db: FakeDb = {
    store,
    collection(name: string) {
      store[name] ??= {};
      return {
        doc(id: string) {
          return {
            async get() {
              const data = store[name][id];
              return { exists: data !== undefined, id, data: () => data };
            },
            async set(value: DocData, opts?: { merge?: boolean }) {
              store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...value } : value;
            },
            async update(value: DocData) {
              if (store[name][id] === undefined) throw new Error('NOT_FOUND');
              store[name][id] = { ...store[name][id], ...value };
            },
            async delete() { delete store[name][id]; },
          };
        },
        async get() {
          const docs = Object.entries(store[name]).map(([id, data]) => ({ id, data: () => data }));
          return { docs };
        },
      };
    },
  };
  return db as unknown as FakeDb & FirebaseFirestore.Firestore;
}

describe('AiStudioRepo', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('upsert cria com origin=user e marca updatedAt/createdAt', async () => {
    const repo = new AiStudioRepo('skill', db);
    const res = await repo.upsert('safra', { name: 'Safra', playbook: 'p' });
    expect(res.id).toBe('safra');
    const stored = db.store.aiSkills.safra;
    expect(stored.origin).toBe('user');
    expect(stored.createdAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();
  });

  it('upsert nunca permite origin=system vindo do body', async () => {
    const repo = new AiStudioRepo('skill', db);
    await repo.upsert('x', { name: 'X', origin: 'system' });
    expect(db.store.aiSkills.x.origin).toBe('user');
  });

  it('upsert em doc system preserva campos travados', async () => {
    db.store.aiAgents = { sup: { name: 'Sup', kind: 'orchestrator', origin: 'system', systemKey: 'sup', instructions: 'old', model: 'router' } };
    const repo = new AiStudioRepo('agent', db);
    await repo.upsert('sup', { name: 'Sup', kind: 'worker', instructions: 'new', model: 'router' });
    expect(db.store.aiAgents.sup.kind).toBe('orchestrator'); // travado
    expect(db.store.aiAgents.sup.instructions).toBe('new');   // editável
    expect(db.store.aiAgents.sup.origin).toBe('system');      // preserva origin
  });

  it('upsert gera warnings para refs órfãs (soft)', async () => {
    const repo = new AiStudioRepo('agent', db);
    const res = await repo.upsert('a', { name: 'A', model: 'fast', skillRefs: ['nao-existe'], toolRefs: ['tool-fantasma'] });
    expect(res.warnings && res.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('upsert sem refs órfãs não retorna warnings', async () => {
    const repo = new AiStudioRepo('agent', db);
    const res = await repo.upsert('a', { name: 'A', model: 'fast', toolRefs: ['execute_sql'] });
    expect(res.warnings).toBeUndefined();
  });

  it('remove bloqueia system (ProtectionError)', async () => {
    db.store.aiSkills = { sys: { name: 'Sys', origin: 'system' } };
    const repo = new AiStudioRepo('skill', db);
    await expect(repo.remove('sys')).rejects.toMatchObject({ status: 422 });
  });

  it('remove permite user', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user' } };
    const repo = new AiStudioRepo('skill', db);
    await repo.remove('u');
    expect(db.store.aiSkills.u).toBeUndefined();
  });

  it('patch bloqueia campo travado em system', async () => {
    db.store.aiAgents = { sup: { name: 'Sup', origin: 'system', kind: 'orchestrator' } };
    const repo = new AiStudioRepo('agent', db);
    await expect(repo.patch('sup', { kind: 'worker' })).rejects.toMatchObject({ status: 422 });
  });

  it('patch só aplica campos da allowlist', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user', playbook: 'old' } };
    const repo = new AiStudioRepo('skill', db);
    await repo.patch('u', { playbook: 'new', hacker: 'x' });
    expect(db.store.aiSkills.u.playbook).toBe('new');
    expect(db.store.aiSkills.u.hacker).toBeUndefined();
  });

  it('list serializa id/origin/status', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user', status: 'active' } };
    const repo = new AiStudioRepo('skill', db);
    const rows = await repo.list();
    expect(rows[0]).toMatchObject({ id: 'u', origin: 'user', status: 'active' });
  });

  it('reset re-semeia o doc a partir do seed', async () => {
    db.store.aiAgents = { sup: { name: 'editado', origin: 'system', systemKey: 'sup', kind: 'orchestrator' } };
    const repo = new AiStudioRepo('agent', db);
    await repo.reset('sup', { name: 'Supervisor', kind: 'orchestrator', instructions: 'base', model: 'router', origin: 'system', systemKey: 'sup' });
    expect(db.store.aiAgents.sup.name).toBe('Supervisor');
  });
});
