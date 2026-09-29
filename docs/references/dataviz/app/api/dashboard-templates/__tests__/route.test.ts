/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, dbState } = vi.hoisted(() => {
  const docData: Record<string, unknown> = {
    name: 'Visão Geral', description: 'x', category: 'Carteira', productRefs: ['credit'],
    blockMap: {}, layout: [], metricRefs: [], status: 'active',
  };
  // Slugs de produtos que "existem" para a validação soft de productRefs (POST).
  const existingProductSlugs = new Set<string>();
  const docRef = {
    get: vi.fn(async () => ({ exists: true, id: 'visao-geral', data: () => docData })),
    set: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const colRef = {
    doc: vi.fn(() => docRef),
    get: vi.fn(async () => ({ docs: [{ id: 'visao-geral', data: () => docData }] })),
  };
  const productsCol = {
    doc: (slug: string) => ({
      get: async () => ({ exists: existingProductSlugs.has(slug) }),
    }),
  };
  return {
    verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'admin@admin.test'),
    dbState: {
      collection: vi.fn((name: string) => (name === 'products' ? productsCol : colRef)),
      colRef,
      docRef,
      existingProductSlugs,
    },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: verifyAuthTokenMock }));
// Admin comes from ADMIN_EMAIL_DOMAIN, which has no default. The test pins its
// own domain instead of depending on the environment.
vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: (email?: string | null) => Boolean(email?.endsWith('@admin.test')),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => dbState }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__del__' },
}));

import { GET, POST, PATCH, DELETE } from '../route';

function req(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/dashboard-templates', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@admin.test');
    dbState.collection.mockClear();
    dbState.docRef.set.mockClear();
    dbState.docRef.update.mockClear();
    dbState.docRef.delete.mockClear();
    dbState.existingProductSlugs.clear();
  });

  it('POST 403 para quem não é admin', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce('user@cliente.test');
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'novo', name: 'Novo', description: 'd', category: 'Risco', productRefs: [],
    }));
    expect(res.status).toBe(403);
    expect(dbState.docRef.set).not.toHaveBeenCalled();
  });

  it('GET 401 sem auth', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce(null);
    const res = await GET(req('http://x/api/dashboard-templates'));
    expect(res.status).toBe(401);
  });

  it('GET lista todos', async () => {
    const res = await GET(req('http://x/api/dashboard-templates'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('visao-geral');
  });

  it('GET single por id', async () => {
    const res = await GET(req('http://x/api/dashboard-templates?id=visao-geral'));
    const body = await res.json();
    expect(body.data.id).toBe('visao-geral');
  });

  it('GET single serializa productRefs', async () => {
    const res = await GET(req('http://x/api/dashboard-templates?id=visao-geral'));
    const body = await res.json();
    expect(body.data.productRefs).toEqual(['credit']);
  });

  it('POST cria/upsert via set', async () => {
    dbState.existingProductSlugs.add('credit');
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'novo', name: 'Novo', description: 'd', category: 'Risco', productRefs: ['credit'],
    }));
    expect(res.status).toBe(200);
    expect(dbState.docRef.set).toHaveBeenCalled();
  });

  it('POST 200 + warning quando productRef é fantasma (não bloqueia)', async () => {
    // nenhum slug registrado → 'credit' é fantasma
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'novo', name: 'Novo', description: 'd', category: 'Risco', productRefs: ['credit'],
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe('novo');
    expect(body.data.warnings).toContain('productRefs "credit" inexistente');
    expect(dbState.docRef.set).toHaveBeenCalled();
  });

  it('POST sem warnings quando todos os productRefs existem', async () => {
    dbState.existingProductSlugs.add('credit');
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'novo', name: 'Novo', description: 'd', category: 'Risco', productRefs: ['credit'],
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.warnings).toBeUndefined();
  });

  it('POST 400 com payload inválido', async () => {
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', { id: 'x' }));
    expect(res.status).toBe(400);
  });

  it('POST 400 com id inválido', async () => {
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'INVALID_ID', name: 'Nome', description: 'd', category: 'Risco', productRefs: ['credit'],
    }));
    expect(res.status).toBe(400);
  });

  it('PATCH atualiza parcial', async () => {
    const res = await PATCH(req('http://x/api/dashboard-templates', 'PATCH', {
      id: 'visao-geral', layout: [{ id: 'r1', blockIds: [] }],
    }));
    expect(res.status).toBe(200);
    expect(dbState.docRef.update).toHaveBeenCalled();
  });

  it('DELETE remove por id', async () => {
    const res = await DELETE(req('http://x/api/dashboard-templates?id=visao-geral', 'DELETE'));
    expect(res.status).toBe(200);
    expect(dbState.docRef.delete).toHaveBeenCalled();
  });
});
