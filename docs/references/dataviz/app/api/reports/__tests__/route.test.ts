/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, dbState } = vi.hoisted(() => {
  // Source doc returned by reportsCol(...).doc(reportId).get() — used by dup/move.
  const sourceDocData: Record<string, unknown> = {
    name: 'Fluxo Mensal',
    description: 'Resumo',
    order: 0,
    blockMap: {},
    layout: [],
    filters: { dateRange: '2024' },
    queries: [{ id: 'q1' }],
    templateId: 'fluxo-mensal',
    productRefs: ['credit'],
    metricRefs: ['pdd.total'],
  };

  /**
   * Escritas capturadas. Era `addCalls` (só o payload) — o id vinha do
   * Firestore e não havia o que asseverar. Agora o id É a URL da página, então
   * ele entra na captura.
   */
  const writes: Array<{ groupId: string; id: string; payload: Record<string, unknown> }> = [];

  const docRef = {
    get: vi.fn(async () => ({ exists: true, id: 'rep-1', data: () => sourceDocData })),
    delete: vi.fn(async () => undefined),
  };

  // Grupo de origem (g1): já contém `rep-1`.
  const reportsColRef = {
    doc: vi.fn((id: string) => ({
      ...docRef,
      set: vi.fn(async (payload: Record<string, unknown>) => {
        writes.push({ groupId: 'g1', id, payload });
      }),
    })),
    orderBy: vi.fn(() => reportsColRef),
    get: vi.fn(async () => ({ docs: [{ id: 'rep-1', data: () => ({ order: 0 }) }] })),
  };

  // Grupo de destino (g2), separado para o `move` ter para onde ir. Vazio por
  // padrão; um teste sobrescreve `get` para forçar conflito de id.
  const targetColRef = {
    doc: vi.fn((id: string) => ({
      get: vi.fn(async () => ({ exists: false })),
      delete: vi.fn(async () => undefined),
      set: vi.fn(async (payload: Record<string, unknown>) => {
        writes.push({ groupId: 'g2', id, payload });
      }),
    })),
    orderBy: vi.fn(() => targetColRef),
    get: vi.fn(async () => ({ docs: [] as { id: string; data: () => unknown }[] })),
  };

  // getDb().collection('clients').doc(c).collection('groups').doc(g).collection('reports')
  const groupsColRef = {
    doc: vi.fn((groupId: string) => ({
      collection: vi.fn(() => (groupId === 'g2' ? targetColRef : reportsColRef)),
    })),
  };
  const clientDocRef = { collection: vi.fn(() => groupsColRef) };
  const clientsColRef = { doc: vi.fn(() => clientDocRef) };

  return {
    verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'admin@askliquid.com'),
    dbState: {
      collection: vi.fn(() => clientsColRef),
      reportsColRef,
      targetColRef,
      docRef,
      sourceDocData,
      writes,
    },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: verifyAuthTokenMock,
  // Estes testes cobrem lineage e id (não autorização); o admin tem acesso.
  verifyClientAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => dbState }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__del__' },
}));

import type { NextRequest } from 'next/server';
import { GET, POST } from '../route';

function req(url: string, method = 'POST', body?: unknown) {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

const validReportBody = {
  clientId: 'OM',
  groupId: 'g1',
  name: 'Novo Report',
};

function resetState() {
  verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
  dbState.reportsColRef.doc.mockClear();
  dbState.targetColRef.doc.mockClear();
  dbState.docRef.get.mockClear();
  dbState.docRef.delete.mockClear();
  dbState.writes.length = 0;
}

describe('/api/reports POST — id legível na URL', () => {
  beforeEach(resetState);

  // O id do documento é o último segmento de `/g/{grupo}/r/{id}`. Antes vinha
  // de `col.add()` — 20 caracteres sorteados — e a página criada pelo menu
  // ficava com URL ilegível, enquanto as vindas de seed eram nomeadas.
  it('deriva o id do nome, em vez de sortear', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', { ...validReportBody, name: 'Fluxo de Caixa' }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes[0].id).toBe('fluxo-de-caixa');
    expect((await res.json()).data.id).toBe('fluxo-de-caixa');
  });

  it('nome com acento vira slug sem acento', async () => {
    await POST(req('http://x/api/reports', 'POST', { ...validReportBody, name: 'Evolução de Obra' }));
    expect(dbState.writes[0].id).toBe('evolucao-de-obra');
  });

  // `.doc(id).set()` sobre id existente SUBSTITUI o documento. Sem sufixo,
  // criar uma segunda página com o mesmo nome apagaria a primeira — que é pior
  // que a URL feia que estamos consertando.
  it('nome repetido ganha sufixo em vez de sobrescrever a página existente', async () => {
    dbState.reportsColRef.get.mockResolvedValueOnce({
      docs: [{ id: 'recebiveis', data: () => ({ order: 0 }) }],
    });
    await POST(req('http://x/api/reports', 'POST', { ...validReportBody, name: 'Recebíveis' }));
    expect(dbState.writes[0].id).toBe('recebiveis-2');
  });

  it('nome sem caractere aproveitável não gera id vazio', async () => {
    await POST(req('http://x/api/reports', 'POST', { ...validReportBody, name: '🎉' }));
    expect(dbState.writes[0].id).toBe('pagina');
  });

  it('duplicar nomeia a cópia a partir do nome da origem', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        action: 'duplicate',
        clientId: 'OM',
        groupId: 'g1',
        reportId: 'rep-1',
      }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes[0].id).toBe('fluxo-mensal-copia');
  });

  // Link já compartilhado continua valendo quando o id está livre no destino.
  it('mover preserva o id quando ele está livre no grupo de destino', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        action: 'move',
        clientId: 'OM',
        groupId: 'g1',
        reportId: 'rep-1',
        toGroupId: 'g2',
      }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes[0]).toMatchObject({ groupId: 'g2', id: 'rep-1' });
    expect(dbState.docRef.delete).toHaveBeenCalled();
  });

  it('mover deriva id novo quando o destino já tem aquele id', async () => {
    dbState.targetColRef.get.mockResolvedValueOnce({
      docs: [{ id: 'rep-1', data: () => ({ order: 0 }) }],
    });
    await POST(
      req('http://x/api/reports', 'POST', {
        action: 'move',
        clientId: 'OM',
        groupId: 'g1',
        reportId: 'rep-1',
        toGroupId: 'g2',
      }),
    );
    expect(dbState.writes[0].id).toBe('fluxo-mensal');
  });
});

describe('/api/reports POST — lineage', () => {
  beforeEach(resetState);

  it('persiste templateId/productRefs/metricRefs quando presentes', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        ...validReportBody,
        templateId: 'fluxo-mensal',
        productRefs: ['credit'],
        metricRefs: ['pdd.total'],
      }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes).toHaveLength(1);
    const persisted = dbState.writes[0].payload;
    expect(persisted.templateId).toBe('fluxo-mensal');
    expect(persisted.productRefs).toEqual(['credit']);
    expect(persisted.metricRefs).toEqual(['pdd.total']);
  });

  it('omite os campos de lineage quando ausentes (happy-path byte-equivalente)', async () => {
    const res = await POST(req('http://x/api/reports', 'POST', { ...validReportBody }));
    expect(res.status).toBe(200);
    expect(dbState.writes).toHaveLength(1);
    const persisted = dbState.writes[0].payload;
    expect(persisted).not.toHaveProperty('templateId');
    expect(persisted).not.toHaveProperty('productRefs');
    expect(persisted).not.toHaveProperty('metricRefs');
  });

  it('omite productRefs/metricRefs quando enviados vazios', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        ...validReportBody,
        productRefs: [],
        metricRefs: [],
      }),
    );
    expect(res.status).toBe(200);
    const persisted = dbState.writes[0].payload;
    expect(persisted).not.toHaveProperty('productRefs');
    expect(persisted).not.toHaveProperty('metricRefs');
  });

  it('preserva lineage ao duplicar (copiado do doc de origem)', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        action: 'duplicate',
        clientId: 'OM',
        groupId: 'g1',
        reportId: 'rep-1',
      }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes).toHaveLength(1);
    const persisted = dbState.writes[0].payload;
    expect(persisted.templateId).toBe('fluxo-mensal');
    expect(persisted.productRefs).toEqual(['credit']);
    expect(persisted.metricRefs).toEqual(['pdd.total']);
  });

  it('preserva lineage ao mover (copiado do doc de origem)', async () => {
    const res = await POST(
      req('http://x/api/reports', 'POST', {
        action: 'move',
        clientId: 'OM',
        groupId: 'g1',
        reportId: 'rep-1',
        toGroupId: 'g2',
      }),
    );
    expect(res.status).toBe(200);
    expect(dbState.writes).toHaveLength(1);
    const persisted = dbState.writes[0].payload;
    expect(persisted.templateId).toBe('fluxo-mensal');
    expect(persisted.productRefs).toEqual(['credit']);
    expect(persisted.metricRefs).toEqual(['pdd.total']);
  });
});

describe('/api/reports GET — lineage round-trip', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
    dbState.docRef.get.mockClear();
    dbState.reportsColRef.get.mockClear();
  });

  it('single GET de doc COM lineage retorna os 3 campos', async () => {
    const res = await GET(
      req('http://x/api/reports?clientId=OM&groupId=g1&reportId=rep-1', 'GET'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.templateId).toBe('fluxo-mensal');
    expect(body.data.productRefs).toEqual(['credit']);
    expect(body.data.metricRefs).toEqual(['pdd.total']);
  });

  it('single GET de doc SEM lineage retorna os campos undefined (ausentes no JSON)', async () => {
    dbState.docRef.get.mockResolvedValueOnce({
      exists: true,
      id: 'rep-1',
      data: () => ({ name: 'Sem lineage', order: 0, blockMap: {}, layout: [] }),
    });
    const res = await GET(
      req('http://x/api/reports?clientId=OM&groupId=g1&reportId=rep-1', 'GET'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // JSON.stringify dropa chaves undefined → ausentes na resposta.
    expect(body.data).not.toHaveProperty('templateId');
    expect(body.data).not.toHaveProperty('productRefs');
    expect(body.data).not.toHaveProperty('metricRefs');
  });

  it('list GET retorna lineage por report (com e sem)', async () => {
    dbState.reportsColRef.get.mockResolvedValueOnce({
      docs: [
        {
          id: 'rep-com',
          data: () => ({
            name: 'Com',
            order: 0,
            templateId: 'fluxo-mensal',
            productRefs: ['credit'],
            metricRefs: ['pdd.total'],
          }),
        },
        { id: 'rep-sem', data: () => ({ name: 'Sem', order: 1 }) },
      ],
    });
    const res = await GET(req('http://x/api/reports?clientId=OM&groupId=g1', 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    const [withIt, withoutIt] = body.data;
    expect(withIt.templateId).toBe('fluxo-mensal');
    expect(withIt.productRefs).toEqual(['credit']);
    expect(withIt.metricRefs).toEqual(['pdd.total']);
    expect(withoutIt).not.toHaveProperty('templateId');
    expect(withoutIt).not.toHaveProperty('productRefs');
    expect(withoutIt).not.toHaveProperty('metricRefs');
  });
});
