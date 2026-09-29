/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // Single mutable object — closures read state directly (no spread).
  const state = {
    clientsDocs: [] as Array<{ id: string; data: () => { productBindings: Array<{ productId: string }> } }>,
    templatesQueryResult: [] as Array<{ id: string }>,
    productDocDelete: vi.fn(async () => undefined),
    productDocSet: vi.fn(async () => undefined),
    // Soft-validation fixtures (POST):
    existingMetricIds: new Set<string>(),
    // Set de chaves "contractRef/entityId" que existem.
    existingEntities: new Set<string>(),
  };

  const dbInstance = {
    collection: (name: string) => {
      if (name === 'clients') {
        return {
          get: async () => ({ docs: state.clientsDocs }),
        };
      }
      if (name === 'dashboardTemplates') {
        return {
          where: () => ({
            get: async () => ({ docs: state.templatesQueryResult.map((t) => ({ id: t.id })) }),
          }),
        };
      }
      if (name === 'metrics') {
        return {
          doc: (id: string) => ({
            get: async () => ({ exists: state.existingMetricIds.has(id) }),
          }),
        };
      }
      if (name === 'dataContracts') {
        return {
          doc: (contractRef: string) => ({
            collection: () => ({
              doc: (entityId: string) => ({
                get: async () => ({
                  exists: state.existingEntities.has(`${contractRef}/${entityId}`),
                }),
              }),
            }),
          }),
        };
      }
      // products
      return {
        doc: () => ({
          delete: state.productDocDelete,
          set: state.productDocSet,
          get: async () => ({ exists: false }),
        }),
      };
    },
  };

  return { state, dbInstance };
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
  Timestamp: { now: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));

vi.mock('@/shared/lib/runtime-config', () => ({
  DATAVIZ_DATABASE_ID: 'test-db',
  DEV_BYPASS_EMAIL: 'admin@askliquid.com',
  isAdminEmail: vi.fn(() => true),
  isDevAuthBypassEnabled: vi.fn(() => false),
}));

vi.mock('@/shared/repositories/product-repo', () => ({
  invalidateProductCache: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { DELETE, POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function req(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { authorization: 'Bearer token' },
  });
}

function clientDoc(id: string, productIds: string[]) {
  return {
    id,
    data: () => ({ productBindings: productIds.map((productId) => ({ productId })) }),
  };
}

describe('DELETE /api/products — referential integrity gate', () => {
  beforeEach(() => {
    mocks.state.clientsDocs = [];
    mocks.state.templatesQueryResult = [];
    mocks.state.productDocDelete.mockClear();
  });

  it('422 quando cliente possui binding para o produto', async () => {
    mocks.state.clientsDocs = [
      clientDoc('om', ['credit', 'risk']),
      clientDoc('brz', ['other-product']),
    ];
    mocks.state.templatesQueryResult = [];

    const res = await DELETE(req('http://x/api/products?id=credit'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Produto referenciado');
    expect(body.dependentClients).toEqual(['om']);
    expect(body.dependentTemplates).toEqual([]);
    expect(mocks.state.productDocDelete).not.toHaveBeenCalled();
  });

  it('422 quando template referencia o produto', async () => {
    mocks.state.clientsDocs = [];
    mocks.state.templatesQueryResult = [{ id: 'visao-geral' }, { id: 'resumo-risco' }];

    const res = await DELETE(req('http://x/api/products?id=credit'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Produto referenciado');
    expect(body.dependentClients).toEqual([]);
    expect(body.dependentTemplates).toEqual(['visao-geral', 'resumo-risco']);
    expect(mocks.state.productDocDelete).not.toHaveBeenCalled();
  });

  it('422 quando tanto cliente quanto template referenciam o produto', async () => {
    mocks.state.clientsDocs = [clientDoc('conx', ['credit'])];
    mocks.state.templatesQueryResult = [{ id: 'visao-geral' }];

    const res = await DELETE(req('http://x/api/products?id=credit'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.dependentClients).toEqual(['conx']);
    expect(body.dependentTemplates).toEqual(['visao-geral']);
    expect(mocks.state.productDocDelete).not.toHaveBeenCalled();
  });

  it('200 e deleta quando nenhuma dependência existe', async () => {
    mocks.state.clientsDocs = [clientDoc('om', ['other-product'])];
    mocks.state.templatesQueryResult = [];

    const res = await DELETE(req('http://x/api/products?id=credit'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.productDocDelete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST — validação SOFT (não-bloqueante) de refs de catálogo
// ---------------------------------------------------------------------------
function postReq(body: unknown) {
  return new NextRequest('http://x/api/products', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseProduct = {
  id: 'credit',
  name: 'Crédito',
  icon: 'package',
  color: '#4f46e5',
  contractRefs: ['canonical'],
};

describe('POST /api/products — soft ref validation (warnings, não 422)', () => {
  beforeEach(() => {
    mocks.state.existingMetricIds = new Set();
    mocks.state.existingEntities = new Set();
    mocks.state.productDocSet.mockClear();
  });

  it('warning quando metricRef é fantasma (200, persiste)', async () => {
    mocks.state.existingMetricIds = new Set(); // nenhuma métrica existe
    const res = await POST(postReq({ ...baseProduct, metricRefs: ['perf.inadimplencia'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain('metricRefs "perf.inadimplencia" inexistente');
    expect(mocks.state.productDocSet).toHaveBeenCalledOnce();
  });

  it('warning quando entityRef não existe sob nenhum contractRef (200, persiste)', async () => {
    const res = await POST(postReq({ ...baseProduct, entityRefs: ['contratos'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.warnings).toContain('entityRefs "contratos" não encontrado em nenhum contractRef');
    expect(mocks.state.productDocSet).toHaveBeenCalledOnce();
  });

  it('sem warnings quando todas as refs existem', async () => {
    mocks.state.existingMetricIds = new Set(['perf.inadimplencia']);
    mocks.state.existingEntities = new Set(['canonical/contratos']);
    const res = await POST(
      postReq({
        ...baseProduct,
        metricRefs: ['perf.inadimplencia'],
        entityRefs: ['contratos'],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toBeUndefined();
    expect(mocks.state.productDocSet).toHaveBeenCalledOnce();
  });
});
