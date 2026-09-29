/**
 * Focused security test for /api/metrics/[id]/data
 *
 * Verifies multi-tenant isolation (ADR-0006): the route must call
 * verifyDatasetAccess with the resolved dataset.datasetId and block
 * requests when access is denied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be hoisted before any imports ─────────────────────────────────

const verifyAuthMock = vi.fn();
const verifyAccessMock = vi.fn();

const verifyRouteMock = vi.fn(async (..._a: unknown[]) => ({ allowed: true }));

vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: (...a: unknown[]) => verifyAuthMock(...a),
  verifyDatasetAccess: (...a: unknown[]) => verifyAccessMock(...a),
  // Toda métrica passa pelo gate de rota desde que a allowlist de 64 ids
  // virou regra. Antes, as métricas deste teste ficavam fora da lista e o
  // gate era pulado — o mock incompleto passava despercebido.
  verifyRouteAccess: (...a: unknown[]) => verifyRouteMock(...a),
}));

// Stub Firestore: metric doc + client doc + relations collection
const metricDocGetMock = vi.fn();
const clientDocGetMock = vi.fn();
const relationsGetMock = vi.fn(
  async (): Promise<{ docs: Array<{ id: string; data: () => unknown }> }> => ({ docs: [] }),
);

vi.mock('@/shared/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: (col: string) => ({
      doc: () => ({
        get: col === 'metrics' ? metricDocGetMock : clientDocGetMock,
      }),
      get: col === 'relations' ? relationsGetMock : async () => ({ docs: [] }),
    }),
  }),
  getDb: vi.fn(),
}));

vi.mock('@/shared/lib/runtime-config', () => ({
  DATAVIZ_DATABASE_ID: 'test-db',
  isAdminEmail: vi.fn(() => false),
  isDevAuthBypassEnabled: vi.fn(() => false),
  DEV_BYPASS_EMAIL: 'dev@local',
}));

// Stub DataSource repo
const getDataSourceMock = vi.fn();
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: (...a: unknown[]) => getDataSourceMock(...a),
}));

// Stub BQ client
const bqQueryMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClientFor: vi.fn(async () => ({ query: bqQueryMock })),
}));

// Stub resolveMetric + resolveDerivedMetric
vi.mock('@/shared/lib/metrics/resolve-metric', () => ({
  resolveMetric: vi.fn(() => ({ sql: 'SELECT 1', params: {}, outputColumns: ['v'] })),
  resolveDerivedMetric: vi.fn(() => ({
    sql: 'SELECT seg AS segmento, SUM(valor) / COUNT(*) AS value\nFROM `gcp-project.cred_ds.contratos`\nJOIN `gcp-project.cli_ds.proponentes` ON `cli_id` = `id`\nGROUP BY seg',
    params: {},
    outputColumns: ['segmento', 'value'],
  })),
  MetricResolutionError: class MetricResolutionError extends Error {},
}));

// Stub flattenLegacyBinding
vi.mock('@/shared/lib/semantic/flatten-binding', () => ({
  flattenLegacyBinding: vi.fn(() => ({})),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new Request('http://localhost/api/metrics/carteira.saldo/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = { clientId: 'client-om' };

/** A minimal valid metric doc from Firestore */
const METRIC_DOC = {
  exists: true,
  id: 'carteira.saldo',
  data: () => ({
    // MetricDoc required fields
    label: 'Test metric',
    requires: ['canonical.carteira.saldo'],
    recipe: {
      kind: 'aggregation',
      primaryEntity: 'carteira',
      aggregation: 'sum',
      valueAttribute: 'carteira.saldo',
      groupByAttributes: [],
      filters: [],
    },
    type: 'kpi',
    version: '1.0.0',
    status: 'active',
    createdAt: null,
    updatedAt: null,
  }),
};

/** A minimal valid client doc with one productBinding */
const CLIENT_DOC = {
  exists: true,
  data: () => ({
    productBindings: [
      {
        productId: 'play',
        datasets: [
          {
            id: 'ds-om',
            dataSourceId: 'bq-main',
            datasetId: 'om_dataset',
            contractRef: 'canonical',
            schemaBindings: {},
            schema: {},
            isPrimary: true,
          },
        ],
        enabledIndicators: [],
      },
    ],
  }),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/metrics/[id]/data — multi-tenant access guard', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset();
    verifyAccessMock.mockReset();
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset();
    getDataSourceMock.mockReset();
    bqQueryMock.mockReset();

    // Default: authenticated user
    verifyAuthMock.mockResolvedValue('user@example.com');
    // Firestore returns valid docs by default
    metricDocGetMock.mockResolvedValue(METRIC_DOC);
    clientDocGetMock.mockResolvedValue(CLIENT_DOC);
    // DataSource
    getDataSourceMock.mockResolvedValue({ projectId: 'gcp-project' });
    // BQ query result
    bqQueryMock.mockResolvedValue([[{ v: 42 }]]);
  });

  it('returns 403 when verifyDatasetAccess denies access', async () => {
    verifyAccessMock.mockResolvedValue({
      allowed: false,
      error: 'Sem permissão para este cliente',
      status: 403,
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Sem permissão para este cliente');
    // BigQuery must NOT have been called
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('calls verifyDatasetAccess with the resolved dataset.datasetId AND clientId', async () => {
    verifyAccessMock.mockResolvedValue({ allowed: false, error: 'denied', status: 403 });

    const { POST } = await import('./route');
    await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    // Must be called with the email, the datasetId from the binding, and the
    // clientId from the request body (new preferred path).
    expect(verifyAccessMock).toHaveBeenCalledWith('user@example.com', 'om_dataset', 'client-om');
  });

  it('returns 403 for a new-format client when the user has no clientAccess', async () => {
    // Simulates verifyDatasetAccess resolving the client via productBindings
    // (no legacy `dataset` field) and finding the user lacks access.
    verifyAccessMock.mockResolvedValue({
      allowed: false,
      error: 'Sem permissão para este cliente',
      status: 403,
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(403);
    expect(verifyAccessMock).toHaveBeenCalledWith('user@example.com', 'om_dataset', 'client-om');
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('proceeds to execute the BQ query for a new-format client when the user has clientAccess', async () => {
    verifyAccessMock.mockResolvedValue({ allowed: true });

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(200);
    expect(verifyAccessMock).toHaveBeenCalledWith('user@example.com', 'om_dataset', 'client-om');
    expect(bqQueryMock).toHaveBeenCalledOnce();
  });
});

describe('POST /api/metrics/[id]/data — contract → dataset coverage (A5)', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset();
    verifyAccessMock.mockReset();
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset();
    getDataSourceMock.mockReset();
    bqQueryMock.mockReset();

    verifyAuthMock.mockResolvedValue('user@example.com');
    metricDocGetMock.mockResolvedValue(METRIC_DOC); // requires: ['canonical.carteira.saldo']
    getDataSourceMock.mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockResolvedValue([[{ v: 42 }]]);
    verifyAccessMock.mockResolvedValue({ allowed: true });
  });

  /** Client whose only dataset is bound to a DIFFERENT contract than the metric. */
  const CLIENT_WRONG_CONTRACT = {
    exists: true,
    data: () => ({
      productBindings: [
        {
          productId: 'play-plus',
          datasets: [
            {
              id: 'ds-other',
              dataSourceId: 'bq-main',
              datasetId: 'other_dataset',
              contractRef: 'play_plus_contract', // does NOT match 'canonical'
              schemaBindings: {},
              schema: {},
              isPrimary: true,
            },
          ],
          enabledIndicators: [],
        },
      ],
    }),
  };

  it('returns 422 when no binding dataset covers the metric contract — no silent fallback', async () => {
    clientDocGetMock.mockResolvedValue(CLIENT_WRONG_CONTRACT);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Nenhum dataset do cliente cobre o contrato "canonical"');
    // Must NOT fall back and run a query against an incompatible dataset.
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('returns 422 listing ALL missing attributes when the migrated binding lacks coverage (G8)', async () => {
    // Cliente migrado (schemaBindings não-vazio) que cobre o contrato 'canonical'
    // mas NÃO mapeia o attribute exigido pela métrica (carteira.saldo).
    const CLIENT_MIGRATED_NO_COVERAGE = {
      exists: true,
      data: () => ({
        productBindings: [
          {
            productId: 'play',
            datasets: [
              {
                id: 'ds-om',
                dataSourceId: 'bq-main',
                datasetId: 'om_dataset',
                contractRef: 'canonical',
                schemaBindings: { 'carteira.outra_coluna': 'x' }, // migrado, mas sem carteira.saldo
                schema: {},
                isPrimary: true,
              },
            ],
            enabledIndicators: [],
          },
        ],
      }),
    };
    clientDocGetMock.mockResolvedValue(CLIENT_MIGRATED_NO_COVERAGE);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.missing).toEqual([
      { ref: 'canonical.carteira.saldo', reason: 'sem-mapping' },
    ]);
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('resolves and executes when the metric contract IS covered by a dataset', async () => {
    // Default CLIENT_DOC has a dataset with contractRef 'canonical' → matches.
    clientDocGetMock.mockResolvedValue(CLIENT_DOC);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq(BASE_BODY) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(200);
    expect(verifyAccessMock).toHaveBeenCalledWith('user@example.com', 'om_dataset', 'client-om');
    expect(bqQueryMock).toHaveBeenCalledOnce();
  });

  it('prefers the requested productId binding when it covers the contract', async () => {
    // Two bindings both covering 'canonical'; productId 'play-b' should win.
    const CLIENT_TWO = {
      exists: true,
      data: () => ({
        productBindings: [
          {
            productId: 'play-a',
            datasets: [
              {
                id: 'ds-a',
                dataSourceId: 'bq-main',
                datasetId: 'dataset_a',
                contractRef: 'canonical',
                schemaBindings: {},
                schema: {},
                isPrimary: true,
              },
            ],
          },
          {
            productId: 'play-b',
            datasets: [
              {
                id: 'ds-b',
                dataSourceId: 'bq-main',
                datasetId: 'dataset_b',
                contractRef: 'canonical',
                schemaBindings: {},
                schema: {},
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    };
    clientDocGetMock.mockResolvedValue(CLIENT_TWO);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om', productId: 'play-b' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(200);
    // Access check should run against dataset_b (the requested product's dataset).
    expect(verifyAccessMock).toHaveBeenCalledWith('user@example.com', 'dataset_b', 'client-om');
  });
});

describe('POST /api/metrics/[id]/data — recipe derived (cross-contract, R2)', () => {
  /** Derived metric crossing two contracts: contratos × clientes. */
  const DERIVED_METRIC_DOC = {
    exists: true,
    id: 'credito.ticket_segmento',
    data: () => ({
      label: 'Ticket por segmento',
      requires: ['contratos.contratos.valor', 'clientes.proponentes.segmento'],
      recipe: {
        kind: 'derived',
        primaryEntity: 'contratos.contratos',
        joins: [{ relationId: 'contrato-cliente' }],
        groupByRefs: ['clientes.proponentes.segmento'],
        terms: [
          { id: 'tot', aggregation: 'sum', valueRef: 'contratos.contratos.valor' },
          { id: 'n', aggregation: 'count' },
        ],
        expression: 'tot / n',
        filters: [],
      },
      type: 'kpi',
      version: '1.0.0',
      status: 'active',
      createdAt: null,
      updatedAt: null,
    }),
  };

  const REL_DATA = {
    label: 'Contrato → Cliente',
    leftRef: 'contratos.contratos.cliente_id',
    rightRef: 'clientes.proponentes.id',
    cardinality: 'many-to-one',
  };

  /** Client whose bindings cover BOTH 'contratos' and 'clientes' (same project). */
  const CLIENT_DOC_TWO_CONTRACTS = {
    exists: true,
    data: () => ({
      productBindings: [
        {
          productId: 'play',
          datasets: [
            {
              id: 'ds-c',
              dataSourceId: 'bq-main',
              datasetId: 'cred_ds',
              contractRef: 'contratos',
              schemaBindings: { 'contratos.valor': 'valor', 'contratos.cliente_id': 'cli_id' },
              schema: {},
              isPrimary: true,
            },
            {
              id: 'ds-cli',
              dataSourceId: 'bq-main',
              datasetId: 'cli_ds',
              contractRef: 'clientes',
              schemaBindings: { 'proponentes.id': 'id', 'proponentes.segmento': 'seg' },
              schema: {},
              isPrimary: false,
            },
          ],
          enabledIndicators: [],
        },
      ],
    }),
  };

  beforeEach(() => {
    verifyAuthMock.mockReset();
    verifyAccessMock.mockReset();
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset();
    getDataSourceMock.mockReset();
    bqQueryMock.mockReset();
    relationsGetMock.mockReset();

    verifyAuthMock.mockResolvedValue('user@example.com');
    metricDocGetMock.mockResolvedValue(DERIVED_METRIC_DOC);
    getDataSourceMock.mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockResolvedValue([[{ segmento: 'A', value: 10 }]]);
    verifyAccessMock.mockResolvedValue({ allowed: true });
    relationsGetMock.mockResolvedValue({
      docs: [{ id: 'contrato-cliente', data: () => REL_DATA }],
    });
  });

  it('resolve com múltiplos bindings e executa o JOIN', async () => {
    clientDocGetMock.mockResolvedValue(CLIENT_DOC_TWO_CONTRACTS);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'credito.ticket_segmento' }) },
    );

    expect(res.status).toBe(200);
    expect(bqQueryMock).toHaveBeenCalledOnce();
    expect(bqQueryMock.mock.calls[0][0].query).toContain('JOIN');
  });

  it('422 quando falta binding de um contrato exigido', async () => {
    // CLIENT_DOC cobre só 'canonical' — não cobre 'contratos'/'clientes'.
    clientDocGetMock.mockResolvedValue(CLIENT_DOC);

    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'credito.ticket_segmento' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/exigido pela métrica/i);
    expect(bqQueryMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/metrics/[id]/data — escopo de propriedade', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset().mockResolvedValue('user@example.com');
    verifyAccessMock.mockReset().mockResolvedValue({ allowed: true });
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset().mockResolvedValue(CLIENT_DOC);
    getDataSourceMock.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockReset().mockResolvedValue([[{ v: 1 }]]);
  });

  const ownedMetric = (owner: string | null) => ({
    exists: true,
    id: 'carteira.saldo',
    data: () => ({
      label: 'X',
      requires: ['canonical.carteira.saldo'],
      recipe: {
        kind: 'aggregation',
        primaryEntity: 'carteira',
        aggregation: 'sum',
        valueAttribute: 'carteira.saldo',
        groupByAttributes: [],
        filters: [],
      },
      type: 'kpi',
      version: '1.0.0',
      status: 'active',
      ownerClientId: owner,
      createdAt: null,
      updatedAt: null,
    }),
  });

  it('403 quando a métrica pertence a outro cliente', async () => {
    metricDocGetMock.mockResolvedValue(ownedMetric('outro-cliente'));
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );
    expect(res.status).toBe(403);
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('200 quando a métrica é global (ownerClientId null)', async () => {
    metricDocGetMock.mockResolvedValue(ownedMetric(null));
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/metrics/[id]/data — coverage gate p/ recipe sql (G4)', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset().mockResolvedValue('user@example.com');
    verifyAccessMock.mockReset().mockResolvedValue({ allowed: true });
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset();
    getDataSourceMock.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockReset().mockResolvedValue([[{ v: 1 }]]);
  });

  it('não aplica coverage 422 a métrica com recipe sql (requires é só roteamento)', async () => {
    const SQL_METRIC = {
      exists: true,
      id: 'chat.kpi_1',
      data: () => ({
        label: 'X',
        requires: ['canonical.carteira.saldo'],
        recipe: { kind: 'sql', template: 'SELECT 1' },
        type: 'kpi',
        version: '1.0.0',
        status: 'active',
        ownerClientId: null,
        createdAt: null,
        updatedAt: null,
      }),
    };
    // Cliente migrado SEM cobertura de carteira.saldo — coverage dispararia 422 p/ aggregation.
    const CLIENT_MIGRATED = {
      exists: true,
      data: () => ({
        productBindings: [
          {
            productId: 'play',
            datasets: [
              {
                id: 'ds',
                dataSourceId: 'bq-main',
                datasetId: 'om_dataset',
                contractRef: 'canonical',
                schemaBindings: { 'carteira.outra': 'x' },
                schema: {},
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    };
    metricDocGetMock.mockResolvedValue(SQL_METRIC);
    clientDocGetMock.mockResolvedValue(CLIENT_MIGRATED);
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'chat.kpi_1' }) },
    );
    expect(res.status).toBe(200);
    expect(bqQueryMock).toHaveBeenCalled();
  });
});

/**
 * ADR-0026 — o filtro declarado sobre o campo do indicador não manda
 * `attribute`: quem diz o que comparar é a métrica, em `filterFields`.
 *
 * Enquanto o schema exigia o campo, a requisição inteira caía em 400 e o bloco
 * ficava sem dado — o mesmo sintoma que a nota do `/api/metrics/batch`
 * descreve, aqui no caminho de um bloco só.
 */
describe('POST /api/metrics/[id]/data — filtro in sem attribute', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset().mockResolvedValue('user@example.com');
    verifyAccessMock.mockReset().mockResolvedValue({ allowed: true });
    metricDocGetMock.mockReset().mockResolvedValue(METRIC_DOC);
    clientDocGetMock.mockReset().mockResolvedValue(CLIENT_DOC);
    getDataSourceMock.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockReset().mockResolvedValue([[{ v: 42 }]]);
  });

  it('aceita a seleção do seletor e a repassa ao resolver', async () => {
    const pageFilters = { banco: { kind: 'in', values: ['BANCO INTER'] } };

    const { POST } = await import('./route');
    const { resolveMetric } = await import('@/shared/lib/metrics/resolve-metric');
    const res = await POST(
      makeReq({ clientId: 'client-om', pageFilters }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(resolveMetric)).toHaveBeenCalledWith(
      expect.objectContaining({ pageFilters }),
    );
  });
});

/**
 * Documento de catálogo que não valida é dado ruim, não falha de servidor. O
 * `/api/metrics/batch` já responde 422 e manda o motivo para o log; aqui a
 * mesma métrica dava 500 "Erro interno do servidor" — a rota que serve UM
 * bloco escondia o que a rota do lote explicava.
 *
 * Ficou mais fácil de encontrar depois da ADR-0026: `filterFields` é mais uma
 * coisa que pode reprovar no schema.
 */
describe('POST /api/metrics/[id]/data — métrica com documento inválido', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset().mockResolvedValue('user@example.com');
    verifyAccessMock.mockReset().mockResolvedValue({ allowed: true });
    clientDocGetMock.mockReset().mockResolvedValue(CLIENT_DOC);
    getDataSourceMock.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockReset().mockResolvedValue([[{ v: 42 }]]);
    metricDocGetMock.mockReset().mockResolvedValue({
      exists: true,
      id: 'carteira.saldo',
      // `expr` com marcador de comentário: reprovado por MetricDoc.
      data: () => ({
        label: 'Test metric',
        requires: ['canonical.carteira.saldo'],
        recipe: { kind: 'sql', template: 'SELECT 1 FROM {carteira} WHERE {filter.banco}' },
        filterFields: { banco: { expr: 'b.nome_reduzido --', field: 'banco' } },
      }),
    });
  });

  it('responde 422, não 500, e não chega ao BigQuery', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'carteira.saldo' }) },
    );

    expect(res.status).toBe(422);
    expect(bqQueryMock).not.toHaveBeenCalled();
  });
});
