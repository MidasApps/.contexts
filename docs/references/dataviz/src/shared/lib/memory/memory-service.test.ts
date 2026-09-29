import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Firestore mock builder. Each `getDb()` call returns the same root
 * mock — tests inspect its recorded calls/state to assert behavior.
 *
 * Layout mirrors the Firestore Admin SDK surface used by memory-service:
 *   db.collection(name).doc(id).{get,set,update}
 *   db.collection(name).doc(id).collection(name).{add, orderBy().limit().get()}
 */

interface MockDocSnap {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

interface DocState {
  exists: boolean;
  data: Record<string, unknown> | undefined;
}

const makeFirestoreMock = () => {
  // doc state by path "col/id"
  const docs = new Map<string, DocState>();
  // subcol messages by parent threadId
  const messages = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  let autoId = 0;

  const setDoc = vi.fn();
  const updateDoc = vi.fn();
  const subAdd = vi.fn();

  const docFn = (col: string) => (id?: string) => {
    const docId = id ?? `auto-${++autoId}`;
    const path = `${col}/${docId}`;

    return {
      id: docId,
      get: vi.fn(async (): Promise<MockDocSnap> => {
        const s = docs.get(path);
        return {
          exists: s?.exists ?? false,
          id: docId,
          data: () => s?.data,
        };
      }),
      set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        setDoc(path, data, opts);
        const prev = docs.get(path);
        const merged = opts?.merge ? { ...(prev?.data ?? {}), ...data } : data;
        docs.set(path, { exists: true, data: merged });
      }),
      update: vi.fn(async (data: Record<string, unknown>) => {
        updateDoc(path, data);
        const prev = docs.get(path);
        docs.set(path, { exists: true, data: { ...(prev?.data ?? {}), ...data } });
      }),
      collection: (subname: string) => {
        const key = `${path}/${subname}`;
        if (!messages.has(key)) messages.set(key, []);

        const buildQuery = (orderField: string, dir: 'asc' | 'desc', limit: number | null) => ({
          orderBy: (f: string, d: 'asc' | 'desc' = 'asc') => buildQuery(f, d, limit),
          limit: (n: number) => buildQuery(orderField, dir, n),
          get: vi.fn(async () => {
            const arr = (messages.get(key) ?? []).slice();
            arr.sort((a, b) => {
              const av = a.data[orderField] as number | undefined;
              const bv = b.data[orderField] as number | undefined;
              if (av === undefined || bv === undefined) return 0;
              return dir === 'desc' ? bv - av : av - bv;
            });
            const limited = limit != null ? arr.slice(0, limit) : arr;
            return {
              empty: limited.length === 0,
              docs: limited.map((m) => ({ id: m.id, data: () => m.data })),
            };
          }),
        });

        return {
          add: vi.fn(async (data: Record<string, unknown>) => {
            const id = `msg-${++autoId}`;
            subAdd(key, data);
            messages.get(key)!.push({ id, data });
            return {
              id,
              get: vi.fn(async () => ({
                exists: true,
                id,
                data: () => data,
              })),
            };
          }),
          orderBy: (f: string, d: 'asc' | 'desc' = 'asc') => buildQuery(f, d, null),
          limit: (n: number) => buildQuery('seq', 'asc', n),
          get: vi.fn(async () => ({
            empty: (messages.get(key) ?? []).length === 0,
            docs: (messages.get(key) ?? []).map((m) => ({ id: m.id, data: () => m.data })),
          })),
        };
      },
    };
  };

  const collectionFn = vi.fn((col: string) => ({
    doc: vi.fn(docFn(col)),
  }));

  return {
    db: { collection: collectionFn },
    state: { docs, messages, setDoc, updateDoc, subAdd },
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
  Timestamp: class {},
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vi.resetModules();
});

describe('MemoryService.createThread', () => {
  it('writes thread metadata with server timestamps and returns Thread', async () => {
    const { createThread } = await import('./memory-service');
    const t = await createThread({
      resourceId: 'OM:user@example.com',
      clientId: 'OM',
      threadId: 'thread-1',
    });

    expect(t.id).toBe('thread-1');
    expect(t.resourceId).toBe('OM:user@example.com');
    expect(t.clientId).toBe('OM');
    expect(firestoreMock.state.setDoc).toHaveBeenCalledWith(
      'workingMemory/thread-1',
      expect.objectContaining({
        resourceId: 'OM:user@example.com',
        clientId: 'OM',
        createdAt: 'SERVER_TS',
        updatedAt: 'SERVER_TS',
      }),
      expect.objectContaining({ merge: true }),
    );
  });

  it('generates id when threadId not provided', async () => {
    const { createThread } = await import('./memory-service');
    const t = await createThread({
      resourceId: 'OM:user@example.com',
      clientId: 'OM',
    });
    expect(t.id).toMatch(/^auto-/);
  });
});

describe('MemoryService working memory', () => {
  const baseWM = {
    clientId: 'OM',
    personaId: 'originador',
    icpId: 'icp-1',
    productType: 'MCMV',
    briefing: 'b',
    activeDashboardId: null,
    pages: [],
    blocks: [],
    decisions: [],
    pendingQuestions: [],
  };

  it('setWorkingMemory persists payload + serverTimestamp(updatedAt)', async () => {
    const { setWorkingMemory } = await import('./memory-service');
    const out = await setWorkingMemory('thread-1', baseWM);
    expect(out.clientId).toBe('OM');
    expect(firestoreMock.state.setDoc).toHaveBeenCalledWith(
      'workingMemory/thread-1',
      expect.objectContaining({
        payload: expect.objectContaining({ clientId: 'OM' }),
        clientId: 'OM',
        updatedAt: 'SERVER_TS',
      }),
      expect.objectContaining({ merge: true }),
    );
  });

  it('getWorkingMemory returns null when doc missing', async () => {
    const { getWorkingMemory } = await import('./memory-service');
    const out = await getWorkingMemory('missing');
    expect(out).toBeNull();
  });

  it('getWorkingMemory returns null when doc exists but no payload', async () => {
    // Pre-create thread w/o payload (createThread case before any set).
    const { createThread, getWorkingMemory } = await import('./memory-service');
    await createThread({ resourceId: 'OM:u', clientId: 'OM', threadId: 't' });
    const out = await getWorkingMemory('t');
    expect(out).toBeNull();
  });

  it('getWorkingMemory parses persisted payload', async () => {
    const { setWorkingMemory, getWorkingMemory } = await import('./memory-service');
    await setWorkingMemory('t', baseWM);
    const out = await getWorkingMemory('t');
    expect(out?.clientId).toBe('OM');
    expect(out?.personaId).toBe('originador');
  });

  it('getWorkingMemory throws on invalid payload', async () => {
    // Manually corrupt the doc state.
    const { getWorkingMemory } = await import('./memory-service');
    firestoreMock.state.docs.set('workingMemory/bad', {
      exists: true,
      data: { payload: { clientId: 1 } },
    });
    await expect(getWorkingMemory('bad')).rejects.toThrow();
  });

  it('patchWorkingMemory merges patch onto existing WM', async () => {
    const { setWorkingMemory, patchWorkingMemory, getWorkingMemory } = await import(
      './memory-service'
    );
    await setWorkingMemory('t', baseWM);
    await patchWorkingMemory('t', { briefing: 'updated' });
    const out = await getWorkingMemory('t');
    expect(out?.briefing).toBe('updated');
    expect(out?.clientId).toBe('OM');
  });
});

describe('MemoryService messages', () => {
  it('appendMessage adds doc to subcollection with monotonic seq', async () => {
    const { appendMessage } = await import('./memory-service');

    const m1 = await appendMessage('t-1', { role: 'user', parts: [{ type: 'text', text: 'oi' }] });
    const m2 = await appendMessage('t-1', { role: 'assistant', parts: [{ type: 'text', text: 'olá' }] });

    expect(m1.role).toBe('user');
    expect(m2.role).toBe('assistant');

    const calls = firestoreMock.state.subAdd.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toBe('workingMemory/t-1/messages');
    expect(calls[0][1]).toMatchObject({ role: 'user', seq: 1, createdAt: 'SERVER_TS' });
    expect(calls[1][1]).toMatchObject({ role: 'assistant', seq: 2 });
  });

  /**
   * O Firestore recusa o documento INTEIRO se qualquer campo aninhado for
   * `undefined`. As `parts` vêm do AI SDK, que preenche opcionais assim
   * (`providerMetadata`) — então toda resposta de assistente era recusada e o
   * histórico de conversa ficava vazio sem sintoma na tela.
   */
  it('appendMessage descarta campos undefined nas parts (Firestore os recusa)', async () => {
    const { appendMessage } = await import('./memory-service');

    await appendMessage('t-undef', {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'oi', providerMetadata: undefined },
        { type: 'step-start', aninhado: { mantem: 1, some: undefined } },
      ],
    });

    const [, data] = firestoreMock.state.subAdd.mock.calls.at(-1)!;
    const parts = (data as { parts: Record<string, unknown>[] }).parts;
    expect('providerMetadata' in parts[0]).toBe(false);
    expect(parts[0]).toMatchObject({ type: 'text', text: 'oi' });
    expect(parts[1].aninhado).toEqual({ mantem: 1 });
  });

  it('getMessages returns latest first ordered by seq DESC, respecting limit', async () => {
    const { appendMessage, getMessages } = await import('./memory-service');
    await appendMessage('t', { role: 'user', parts: [] });
    await appendMessage('t', { role: 'assistant', parts: [] });
    await appendMessage('t', { role: 'user', parts: [] });

    const out = await getMessages('t', { limit: 2 });
    expect(out).toHaveLength(2);
    // Most recent first → role of the last appended
    expect(out[0].role).toBe('user');
    expect(out[1].role).toBe('assistant');
  });
});
