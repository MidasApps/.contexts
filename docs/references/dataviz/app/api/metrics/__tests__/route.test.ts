/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // Single mutable object — closures read from this directly (no spread).
  const state = {
    productsQueryResult: [] as Array<{ id: string }>,
    templatesQueryResult: [] as Array<{ id: string }>,
    metricDocDelete: vi.fn(async (..._args: unknown[]) => undefined),
    metricDocUpdate: vi.fn(async (..._args: unknown[]) => undefined),
    metricDocSet: vi.fn(async (..._args: unknown[]) => undefined),
    revisionAdd: vi.fn(async (..._args: unknown[]) => undefined),
    // Doc existente lido por POST/DELETE (null ⇒ não existe). Controla owner.
    metricExisting: null as Record<string, unknown> | null,
    // Lista p/ GET (escopo).
    metricsList: [] as Array<{ id: string; ownerClientId: string | null }>,
    // Soft/hard ref fixtures (POST). Chave: "contractId.entityId.attributeId".
    // valor: { exists, deprecated }
    attributes: new Map<string, { exists: boolean; deprecated: boolean }>(),
  };

  const dbInstance = {
    collection: (name: string) => {
      if (name === 'products') {
        return {
          where: () => ({
            get: async () => ({
              empty: state.productsQueryResult.length === 0,
              docs: state.productsQueryResult.map((p) => ({ id: p.id })),
            }),
          }),
        };
      }
      if (name === 'dashboardTemplates') {
        return {
          where: () => ({
            get: async () => ({
              empty: state.templatesQueryResult.length === 0,
              docs: state.templatesQueryResult.map((t) => ({ id: t.id })),
            }),
          }),
        };
      }
      if (name === 'dataContracts') {
        return {
          doc: (contractId: string) => ({
            collection: () => ({
              doc: (entityId: string) => ({
                collection: () => ({
                  doc: (attributeId: string) => ({
                    get: async () => {
                      const entry = state.attributes.get(`${contractId}.${entityId}.${attributeId}`);
                      return {
                        exists: entry?.exists ?? false,
                        data: () => ({ deprecated: entry?.deprecated ?? false }),
                      };
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // metrics collection
      return {
        get: async () => ({
          docs: state.metricsList.map((m) => ({
            id: m.id,
            data: () => ({ ownerClientId: m.ownerClientId }),
          })),
        }),
        where: () => ({
          get: async () => ({
            docs: state.metricsList.map((m) => ({
              id: m.id,
              data: () => ({ ownerClientId: m.ownerClientId }),
            })),
          }),
        }),
        doc: () => ({
          delete: state.metricDocDelete,
          update: state.metricDocUpdate,
          set: state.metricDocSet,
          get: async () => ({
            exists: state.metricExisting !== null,
            data: () => state.metricExisting ?? {},
          }),
          // Subcoleção `revisions`: o histórico da métrica, gravado antes de
          // toda sobrescrita — inclusive as que vêm da administração.
          collection: () => ({ add: state.revisionAdd }),
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

const runtimeMock = vi.hoisted(() => ({ isAdminEmail: vi.fn(() => true) }));
vi.mock('@/shared/lib/runtime-config', () => ({
  DATAVIZ_DATABASE_ID: 'test-db',
  DEV_BYPASS_EMAIL: 'admin@askliquid.com',
  isAdminEmail: runtimeMock.isAdminEmail,
  isDevAuthBypassEnabled: vi.fn(() => false),
}));

const authMock = vi.hoisted(() => ({
  authorizeMetricWrite: vi.fn(async (): Promise<{ allowed: boolean; status?: number; error?: string }> => ({ allowed: true })),
}));
vi.mock('@/shared/lib/metrics/authorize-metric', () => ({ authorizeMetricWrite: authMock.authorizeMetricWrite }));

const apiAuthMock = vi.hoisted(() => ({
  verifyClientAccess: vi.fn(async (): Promise<{ allowed: boolean; status?: number; error?: string }> => ({ allowed: true })),
  // A rota usava uma cópia local de verifyAuth que lia `getAuth` direto; com a
  // desduplicação (R13) ela passou a usar o helper canônico, que precisa estar
  // aqui — o mock de `firebase-admin/auth` acima já não a alcança.
  verifyAuthToken: vi.fn(async (): Promise<string | null> => 'admin@askliquid.com'),
}));
vi.mock('@/shared/lib/api-auth', () => ({
  verifyClientAccess: apiAuthMock.verifyClientAccess,
  verifyAuthToken: apiAuthMock.verifyAuthToken,
}));

import { NextRequest } from 'next/server';
import { DELETE, POST, GET } from '../route';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function req(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { authorization: 'Bearer token' },
  });
}

describe('DELETE /api/metrics — hard delete gate', () => {
  beforeEach(() => {
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [];
    mocks.state.metricDocDelete.mockClear();
    mocks.state.metricDocUpdate.mockClear();
  });

  it('422 quando produto referencia a métrica (hard=true)', async () => {
    mocks.state.productsQueryResult = [{ id: 'product-a' }, { id: 'product-b' }];

    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Métrica referenciada');
    expect(body.dependentProducts).toEqual(['product-a', 'product-b']);
    expect(body.dependentTemplates).toEqual([]);
    expect(mocks.state.metricDocDelete).not.toHaveBeenCalled();
  });

  it('422 quando APENAS um template referencia a métrica (sem produto)', async () => {
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [{ id: 'visao-geral' }];

    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Métrica referenciada');
    expect(body.dependentProducts).toEqual([]);
    expect(body.dependentTemplates).toEqual(['visao-geral']);
    expect(mocks.state.metricDocDelete).not.toHaveBeenCalled();
  });

  it('200 e deleta quando nem produto nem template referenciam (hard=true)', async () => {
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [];

    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.metricDocDelete).toHaveBeenCalledOnce();
  });

  it('soft delete não consulta dependentes e apenas deprecia', async () => {
    mocks.state.productsQueryResult = [{ id: 'product-a' }];
    mocks.state.templatesQueryResult = [{ id: 'visao-geral' }];

    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.metricDocUpdate).toHaveBeenCalledOnce();
    expect(mocks.state.metricDocDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — 422 preservado p/ ref inexistente + WARNING soft p/ attr deprecated
// ---------------------------------------------------------------------------
function postReq(body: unknown) {
  return new NextRequest('http://x/api/metrics', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseMetric = {
  id: 'perf.inadimplencia',
  label: 'Inadimplência',
  type: 'kpi',
};

describe('POST /api/metrics — ref validation (422 hard + warning soft)', () => {
  beforeEach(() => {
    mocks.state.attributes = new Map();
    mocks.state.metricDocSet.mockClear();
    mocks.state.revisionAdd.mockClear();
    mocks.state.metricExisting = null;
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('422 preservado quando requires aponta para ref inexistente', async () => {
    // attribute não registrado → não existe
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.fantasma'] }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Refs inexistentes no contract');
    expect(body.invalidRefs).toContain('canonical.contratos.fantasma');
    expect(mocks.state.metricDocSet).not.toHaveBeenCalled();
  });

  it('200 + warning quando requires aponta para attribute deprecated (persiste)', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: true });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain('requires "canonical.contratos.saldo_devedor" referencia attribute deprecated');
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });

  it('200 sem warning quando requires aponta para attribute ativo', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toBeUndefined();
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST — A2 (multi-contract) + A7 (recipe ref) warnings soft
// ---------------------------------------------------------------------------
describe('POST /api/metrics — recipe + multi-contract warnings (soft)', () => {
  beforeEach(() => {
    mocks.state.attributes = new Map();
    mocks.state.metricDocSet.mockClear();
    mocks.state.metricExisting = null;
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('200 + warning quando recipe.valueAttribute é fantasma (não existe)', async () => {
    // `requires` válido (resolve), mas o recipe aponta p/ atributo inexistente.
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    const res = await POST(
      postReq({
        ...baseMetric,
        requires: ['canonical.contratos.saldo_devedor'],
        recipe: {
          kind: 'aggregation',
          primaryEntity: 'contratos',
          aggregation: 'sum',
          valueAttribute: 'contratos.fantasma',
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain('recipe referencia atributo inexistente "contratos.fantasma"');
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });

  it('200 + warning quando recipe referencia atributo deprecated', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    // atributo do recipe existe mas está deprecated.
    mocks.state.attributes.set('canonical.contratos.taxa_antiga', { exists: true, deprecated: true });
    const res = await POST(
      postReq({
        ...baseMetric,
        requires: ['canonical.contratos.saldo_devedor'],
        recipe: {
          kind: 'aggregation',
          primaryEntity: 'contratos',
          aggregation: 'sum',
          valueAttribute: 'contratos.taxa_antiga',
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain('recipe referencia atributo deprecated "contratos.taxa_antiga"');
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });

  it('200 + warning quando requires referencia múltiplos contratos', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.attributes.set('legado.contratos.saldo', { exists: true, deprecated: false });
    const res = await POST(
      postReq({
        ...baseMetric,
        requires: ['canonical.contratos.saldo_devedor', 'legado.contratos.saldo'],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain(
      'requires referencia múltiplos contratos (canonical, legado); o roteamento de dataset usa apenas o primeiro',
    );
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });

  it('200 sem novos warnings quando recipe (aggregation) referencia só atributos válidos', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.attributes.set('canonical.contratos.uf', { exists: true, deprecated: false });
    mocks.state.attributes.set('canonical.contratos.data_venc', { exists: true, deprecated: false });
    const res = await POST(
      postReq({
        ...baseMetric,
        requires: ['canonical.contratos.saldo_devedor'],
        recipe: {
          kind: 'aggregation',
          primaryEntity: 'contratos',
          aggregation: 'sum',
          valueAttribute: 'contratos.saldo_devedor',
          groupByAttributes: ['contratos.uf'],
          filters: [{ attribute: 'contratos.data_venc', op: '>=' }],
          orderBy: { attribute: 'contratos.uf', dir: 'asc' },
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toBeUndefined();
    expect(mocks.state.metricDocSet).toHaveBeenCalledOnce();
  });
});

describe('POST /api/metrics — propriedade/escopo', () => {
  beforeEach(() => {
    mocks.state.attributes = new Map();
    mocks.state.metricDocSet.mockClear();
    mocks.state.metricDocUpdate.mockClear();
    mocks.state.metricExisting = null;
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('persiste ownerClientId do corpo ao criar métrica de cliente', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'create');
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as { ownerClientId?: unknown };
    expect(saved.ownerClientId).toBe('brz');
  });

  it('403 quando authorizeMetricWrite nega', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    authMock.authorizeMetricWrite.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'conx' }));
    expect(res.status).toBe(403);
    expect(mocks.state.metricDocSet).not.toHaveBeenCalled();
  });

  /**
   * Procedência não é campo do formulário, e este handler reconstrói o
   * documento do zero (`merge: false`). Sem preservar, salvar pela admin uma
   * métrica criada na conversa apagaria a origem dela.
   */
  it('preserva origin e derivedFrom do documento existente', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = { ownerClientId: 'brz', origin: 'chat', derivedFrom: 'covenants.emp_estoque' };

    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));

    expect(res.status).toBe(200);
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.origin).toBe('chat');
    expect(saved.derivedFrom).toBe('covenants.emp_estoque');
  });

  /**
   * ADR-0026 — mesma razão do teste acima, campo diferente.
   *
   * `filterFields` diz o que o filtro de página compara nesta métrica e também
   * não é campo do formulário: quem o escreve é seed/admin de catálogo. Salvar
   * pela tela de administração uma das métricas migradas apagava a declaração,
   * e o seletor da página parava de recortar aquele bloco sem que nada
   * reclamasse. A tela é caminho de usuário real, não hipótese.
   */
  it('preserva filterFields do documento existente — o formulário não tem o campo', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = {
      ownerClientId: 'brz',
      filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } },
    };

    const res = await POST(postReq({
      ...baseMetric,
      requires: ['canonical.contratos.saldo_devedor'],
      ownerClientId: 'brz',
    }));

    expect(res.status).toBe(200);
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.filterFields).toEqual({
      banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
    });
  });

  /*
   * O par negativo: preservar o que o formulário não expressa não pode virar
   * preservar tudo. Campo que ESTÁ no formulário e veio vazio some — senão
   * "apaguei a unidade" viraria "a unidade voltou".
   */
  it('campo do formulário esvaziado continua esvaziado', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = {
      ownerClientId: 'brz',
      label: 'Rótulo antigo',
      unit: 'BRL',
      description: 'descrição antiga',
      filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco' } },
    };

    const res = await POST(postReq({
      ...baseMetric,
      requires: ['canonical.contratos.saldo_devedor'],
      ownerClientId: 'brz',
    }));

    expect(res.status).toBe(200);
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.unit).toBeNull();
    expect(saved.description).toBeNull();
    expect(saved.label).toBe('Inadimplência');
    // …e a declaração, que o formulário não expressa, continua lá.
    expect(saved.filterFields).toBeDefined();
  });

  /*
   * O preservado é validado junto com o formulário, e não costurado depois:
   * uma declaração malformada no documento antigo seria regravada sem passar
   * por schema nenhum. Recusar é o mesmo tratamento do caminho do chat — some
   * em silêncio nunca, nem por descarte, nem por regravação cega.
   */
  it('recusa a gravação quando a declaração preservada não valida', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = {
      ownerClientId: 'brz',
      // `--` é marcador de comentário: reprovado por MetricDoc.
      filterFields: { banco: { expr: 'b.nome_reduzido -- resto', field: 'banco' } },
    };

    const res = await POST(postReq({
      ...baseMetric,
      requires: ['canonical.contratos.saldo_devedor'],
      ownerClientId: 'brz',
    }));

    expect(res.status).toBe(400);
    const body = await res.json() as { issues?: Array<{ path?: unknown[] }> };
    expect(body.issues?.some((i) => i.path?.[0] === 'filterFields')).toBe(true);
    expect(mocks.state.metricDocSet).not.toHaveBeenCalled();
  });

  /** O histórico é da métrica, não do caminho que a alterou. */
  it('arquiva o documento anterior antes de sobrescrever', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = { ownerClientId: 'brz', label: 'Antes', version: '1.0.0' };

    await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));

    expect(mocks.state.revisionAdd).toHaveBeenCalledWith(
      expect.objectContaining({ doc: expect.objectContaining({ label: 'Antes' }), archivedBy: 'admin@askliquid.com' }),
    );
  });

  it('criação não arquiva — não há documento anterior', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = null;

    await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));

    expect(mocks.state.revisionAdd).not.toHaveBeenCalled();
  });

  it('anti-sequestro: update autoriza pelo dono do DOC existente e preserva o dono', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = { ownerClientId: null };
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', null, 'update');
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as { ownerClientId?: unknown };
    expect(saved.ownerClientId).toBeNull();
  });

  it('promote: flipa ownerClientId para null', async () => {
    mocks.state.metricExisting = { ownerClientId: 'brz', label: 'X', requires: ['canonical.contratos.saldo_devedor'] };
    const res = await POST(postReq({ action: 'promote', id: 'perf.inadimplencia' }));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'promote');
    expect(mocks.state.metricDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ ownerClientId: null }));
  });
});

describe('DELETE /api/metrics — permissão por dono', () => {
  beforeEach(() => {
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [];
    mocks.state.metricDocDelete.mockClear();
    mocks.state.metricDocUpdate.mockClear();
    mocks.state.metricExisting = { ownerClientId: 'brz' };
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('autoriza pelo dono do doc (soft delete)', async () => {
    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia'));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'delete');
  });

  it('403 quando authorize nega', async () => {
    authMock.authorizeMetricWrite.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia'));
    expect(res.status).toBe(403);
    expect(mocks.state.metricDocUpdate).not.toHaveBeenCalled();
    expect(mocks.state.metricDocDelete).not.toHaveBeenCalled();
  });
});

function getReq(qs = '') {
  return new NextRequest(`http://x/api/metrics${qs}`, { method: 'GET', headers: { authorization: 'Bearer token' } });
}

describe('GET /api/metrics — escopo por dono', () => {
  beforeEach(() => {
    mocks.state.metricsList = [
      { id: 'pdd.total', ownerClientId: null },
      { id: 'carteira.brz_kpi', ownerClientId: 'brz' },
      { id: 'carteira.conx_kpi', ownerClientId: 'conx' },
    ];
    runtimeMock.isAdminEmail.mockReturnValue(false);
    apiAuthMock.verifyClientAccess.mockReset().mockResolvedValue({ allowed: true });
  });

  it('clientId=brz (com acesso) → globais + métricas da brz', async () => {
    const body = await (await GET(getReq('?clientId=brz'))).json();
    const ids = body.data.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual(['carteira.brz_kpi', 'pdd.total']);
  });

  it('sem acesso ao cliente → só globais', async () => {
    apiAuthMock.verifyClientAccess.mockResolvedValue({ allowed: false, status: 403 });
    const body = await (await GET(getReq('?clientId=brz'))).json();
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(['pdd.total']);
  });

  it('admin sem clientId → todas', async () => {
    runtimeMock.isAdminEmail.mockReturnValue(true);
    const body = await (await GET(getReq())).json();
    expect(body.data).toHaveLength(3);
  });
});
