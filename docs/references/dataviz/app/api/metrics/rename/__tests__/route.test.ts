/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — model a Firestore transaction + array-contains queries.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const state = {
    // per-id existence + data for metrics docs (oldRef / newRef)
    metricDocs: {} as Record<string, { exists: boolean; data: Record<string, unknown> }>,
    // products / templates returned by the array-contains queries
    productsQueryResult: [] as Array<{ id: string; metricRefs: string[] }>,
    templatesQueryResult: [] as Array<{ id: string; metricRefs: string[] }>,
  };

  // Tracks what the transaction did, for assertions.
  const tracker = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  function metricRef(id: string) {
    return { __kind: 'metricRef', id };
  }

  function makeDocSnap(coll: 'products' | 'dashboardTemplates', id: string, metricRefs: string[]) {
    return {
      id,
      ref: { __kind: coll, id },
      data: () => ({ metricRefs }),
    };
  }

  const dbInstance = {
    collection: (name: string) => {
      if (name === 'products') {
        return {
          where: () => ({
            get: async () => ({
              docs: state.productsQueryResult.map((p) => makeDocSnap('products', p.id, p.metricRefs)),
            }),
          }),
          doc: (id: string) => metricRef(id),
        };
      }
      if (name === 'dashboardTemplates') {
        return {
          where: () => ({
            get: async () => ({
              docs: state.templatesQueryResult.map((t) => makeDocSnap('dashboardTemplates', t.id, t.metricRefs)),
            }),
          }),
        };
      }
      // metrics
      return {
        doc: (id: string) => metricRef(id),
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { id: string }) => {
          const d = state.metricDocs[ref.id] ?? { exists: false, data: {} };
          return { exists: d.exists, data: () => d.data };
        },
        set: tracker.set,
        update: tracker.update,
        delete: tracker.delete,
      };
      return fn(tx);
    },
  };

  return { state, tracker, dbInstance };
});

vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: vi.fn(),
  getAdminFirestore: vi.fn(() => mocks.dbInstance),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async () => ({ email: 'admin@askliquid.com' })),
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: vi.fn(() => ({ seconds: 1, nanoseconds: 0 })) },
}));

vi.mock('@/shared/lib/runtime-config', () => ({
  DATAVIZ_DATABASE_ID: 'test-db',
  DEV_BYPASS_EMAIL: 'admin@askliquid.com',
  isAdminEmail: vi.fn(() => true),
  isDevAuthBypassEnabled: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function req(body: unknown) {
  return new NextRequest('http://x/api/metrics/rename', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_DOC = {
  label: 'Inadimplência',
  type: 'kpi',
  requires: ['carteira-base.contratos.saldo'],
  version: '1.0.0',
  status: 'active',
};

describe('POST /api/metrics/rename — atomic rename', () => {
  beforeEach(() => {
    mocks.state.metricDocs = {};
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [];
    mocks.tracker.set.mockClear();
    mocks.tracker.update.mockClear();
    mocks.tracker.delete.mockClear();
  });

  it('re-aponta refs de produto + template e deleta o doc antigo em uma chamada', async () => {
    mocks.state.metricDocs = {
      'perf.old': { exists: true, data: { ...VALID_DOC, createdAt: 'c0' } },
      'perf.new': { exists: false, data: {} },
    };
    mocks.state.productsQueryResult = [{ id: 'product-a', metricRefs: ['perf.old', 'other.metric'] }];
    mocks.state.templatesQueryResult = [{ id: 'visao-geral', metricRefs: ['perf.old'] }];

    const res = await POST(req({ oldId: 'perf.old', newId: 'perf.new', doc: VALID_DOC }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.id).toBe('perf.new');
    expect(body.repointedProducts).toEqual(['product-a']);
    expect(body.repointedTemplates).toEqual(['visao-geral']);

    // novo doc escrito
    expect(mocks.tracker.set).toHaveBeenCalledOnce();
    const [, newDoc] = mocks.tracker.set.mock.calls[0];
    expect(newDoc.createdAt).toBe('c0'); // createdAt preservado

    // refs re-apontadas
    const updateCalls = mocks.tracker.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    const productUpdate = updateCalls.find((c) => c[0].id === 'product-a');
    expect(productUpdate?.[1].metricRefs).toEqual(['perf.new', 'other.metric']);
    const templateUpdate = updateCalls.find((c) => c[0].id === 'visao-geral');
    expect(templateUpdate?.[1].metricRefs).toEqual(['perf.new']);

    // doc antigo deletado
    expect(mocks.tracker.delete).toHaveBeenCalledOnce();
    expect(mocks.tracker.delete.mock.calls[0][0].id).toBe('perf.old');
  });

  it('409 quando newId já existe — não escreve nem deleta', async () => {
    mocks.state.metricDocs = {
      'perf.old': { exists: true, data: { ...VALID_DOC } },
      'perf.new': { exists: true, data: { ...VALID_DOC } },
    };

    const res = await POST(req({ oldId: 'perf.old', newId: 'perf.new', doc: VALID_DOC }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('newId já existe');
    expect(mocks.tracker.set).not.toHaveBeenCalled();
    expect(mocks.tracker.delete).not.toHaveBeenCalled();
  });

  it('404 quando oldId não existe', async () => {
    mocks.state.metricDocs = {
      'perf.old': { exists: false, data: {} },
      'perf.new': { exists: false, data: {} },
    };

    const res = await POST(req({ oldId: 'perf.old', newId: 'perf.new', doc: VALID_DOC }));

    expect(res.status).toBe(404);
    expect(mocks.tracker.set).not.toHaveBeenCalled();
  });

  it('400 quando oldId === newId', async () => {
    const res = await POST(req({ oldId: 'perf.x', newId: 'perf.x', doc: VALID_DOC }));
    expect(res.status).toBe(400);
  });

  it('400 quando newId é inválido', async () => {
    const res = await POST(req({ oldId: 'perf.old', newId: 'INVALID', doc: VALID_DOC }));
    expect(res.status).toBe(400);
  });
});
