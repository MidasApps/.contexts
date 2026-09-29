import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  access: vi.fn(),
  routeAccess: vi.fn(),
  getDS: vi.fn(),
  bqQuery: vi.fn(),
  bqJob: vi.fn(),
  resolve: vi.fn(),
  resolveDerived: vi.fn(),
}));

vi.mock('@/shared/lib/api-auth', () => ({
  verifyDatasetAccess: (...a: unknown[]) => h.access(...a),
  verifyRouteAccess: (...a: unknown[]) => h.routeAccess(...a),
  verifyAuthToken: vi.fn(),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: (...a: unknown[]) => h.getDS(...a),
}));
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClientFor: vi.fn(async () => ({ query: h.bqQuery, createQueryJob: h.bqJob })),
}));
vi.mock('@/shared/lib/metrics/resolve-metric', () => ({
  resolveMetric: (...a: unknown[]) => h.resolve(...a),
  resolveDerivedMetric: (...a: unknown[]) => h.resolveDerived(...a),
  MetricResolutionError: class MetricResolutionError extends Error {},
}));
vi.mock('@/shared/lib/semantic/flatten-binding', () => ({
  flattenLegacyBinding: vi.fn(() => ({})),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ DATAVIZ_DATABASE_ID: 'test-db' }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn() }));

import {
  executeMetric,
  loadClientBindings,
  newMetricExecCaches,
} from '../execute-metric';
import { MetricResolutionError } from '@/shared/lib/metrics/resolve-metric';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metric(over: Record<string, unknown> = {}): any {
  return {
    id: 'm',
    label: 'M',
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
    ownerClientId: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binding(datasets?: unknown[]): any {
  return {
    productId: 'play',
    datasets: datasets ?? [
      {
        id: 'ds',
        dataSourceId: 'bq',
        datasetId: 'om_ds',
        contractRef: 'canonical',
        schemaBindings: {},
        schema: {},
        isPrimary: true,
      },
    ],
  };
}

function call(over: Record<string, unknown> = {}) {
  return executeMetric({
    metric: metric(),
    parsedBindings: [binding()],
    clientId: 'vila-rosa',
    email: 'u@e.com',
    relations: [],
    caches: newMetricExecCaches(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(over as any),
  });
}

beforeEach(() => {
  h.access.mockReset().mockResolvedValue({ allowed: true });
  h.routeAccess.mockReset().mockResolvedValue({ allowed: true });
  h.getDS.mockReset().mockResolvedValue({ projectId: 'gcp' });
  h.bqQuery.mockReset().mockResolvedValue([[{ value: 42 }]]);
  // O dry-run agora precisa dizer que é SELECT: é o BigQuery quem decide se o
  // template virou um comando só de leitura (o léxico da guarda já errou uma vez).
  h.bqJob.mockReset().mockResolvedValue([
    { metadata: { statistics: { query: { statementType: 'SELECT', schema: { fields: [{ name: 'bucket' }, { name: 'value' }] } } } } },
  ]);
  h.resolve.mockReset().mockReturnValue({ sql: 'SELECT 1', params: {}, outputColumns: ['value'] });
  h.resolveDerived.mockReset().mockReturnValue({ sql: 'SELECT 1', params: {}, outputColumns: ['value'] });
});

describe('executeMetric — dryRun', () => {
  it('não executa a query e devolve as colunas que o BigQuery prevê', async () => {
    const r = await call({ dryRun: true });

    expect(h.bqQuery).not.toHaveBeenCalled();
    expect(h.bqJob).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual([]);
      // O resolver devolve `[]` para recipe `sql`; quem sabe os nomes é o dry-run.
      expect(r.outputColumns).toEqual(['bucket', 'value']);
    }
  });

  /*
   * A compilação devolvia o texto cru do BigQuery ao assistente: "Not found:
   * Table <projeto>:imobiliaria_demo.nao_existe_xyz", "argument types: STRING,
   * INT64", "Did you mean <coluna>?" — um oráculo de schema de outro tenant
   * pela autoria de métrica. Agora: sintaxe devolve a posição; todo erro
   * semântico e toda leitura fora do escopo, a MESMA resposta.
   */
  it('devolve só a posição quando o template tem erro de sintaxe', async () => {
    h.bqJob.mockRejectedValue(new Error('Syntax error: Unexpected end of script at [3:14]'));

    const r = await call({ dryRun: true });

    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) {
      expect(r.error).toContain('[3:14]');
      expect(r.error).not.toContain('Unexpected');
    }
  });

  it('responde igual a todo erro semântico e a toda leitura fora do escopo', async () => {
    const errors = [
      'Unrecognized name: zzz at [1:8]',
      'Not found: Table gcp-proj:imobiliaria_demo.nao_existe_xyz was not found in location US',
      'No matching signature for operator = for argument types: STRING, INT64 at [1:109]',
      'Unrecognized name: venda_idd; Did you mean venda_id? at [1:8]',
      'Access Denied: Table gcp-proj:outro.x',
      'socket hang up',
    ];
    const responses = new Set<string>();
    for (const e of errors) {
      h.bqJob.mockRejectedValueOnce(new Error(e));
      responses.add(JSON.stringify(await call({ dryRun: true })));
    }
    h.bqJob.mockResolvedValueOnce(dryRunReading([['gcp', 'om_ds', 'contratos'], ['gcp', 'imobiliaria_demo', 'vendas']]));
    responses.add(JSON.stringify(await call({ dryRun: true })));

    expect(responses.size).toBe(1);
    const [single] = [...responses];
    expect(single).not.toMatch(/\[\d+:\d+\]|zzz|STRING|venda_id|imobiliaria|nao_existe|gcp-proj/);
  });

  it('manda o detalhe do erro semântico só para o log do servidor', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.bqJob.mockRejectedValue(new Error('Unrecognized name: saldo_devedr at [3:14]'));

    await call({ dryRun: true });

    expect(JSON.stringify(spy.mock.calls)).toContain('saldo_devedr');
  });

  it('recusa quando o BigQuery classifica a query como algo além de um SELECT (script)', async () => {
    h.bqJob.mockResolvedValue([{ metadata: { statistics: { query: { statementType: 'SCRIPT', schema: { fields: [] } } } } }]);

    const r = await call({ dryRun: true });

    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.error).toMatch(/SELECT/);
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('recusa quando o dry-run não informa o tipo do comando', async () => {
    h.bqJob.mockResolvedValue([{ metadata: { statistics: { query: { schema: { fields: [] } } } } }]);

    const r = await call({ dryRun: true });

    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it('as guardas valem igual: métrica de outro cliente nem chega a compilar', async () => {
    const r = await call({ dryRun: true, metric: metric({ ownerClientId: 'outro' }) });

    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqJob).not.toHaveBeenCalled();
  });
});

/**
 * I3 (review N2): template de métrica escrito por LLM lia dataset de outro
 * tenant. A guarda de texto só olha o token depois de FROM/JOIN; quem sabe o que
 * a query lê é o dry-run. Cada payload abaixo vem com os `referencedTables` que
 * o BigQuery devolveu para ele no dry-run real (n2-review-metric-scope.out).
 */
function dryRunReading(tables: Array<[string, string, string]>, routines: Array<[string, string, string]> = []) {
  return [{
    metadata: { statistics: { query: {
      statementType: 'SELECT',
      schema: { fields: [{ name: 'value' }] },
      referencedTables: tables.map(([projectId, datasetId, tableId]) => ({ projectId, datasetId, tableId })),
      referencedRoutines: routines.map(([projectId, datasetId, routineId]) => ({ projectId, datasetId, routineId })),
    } } },
  }];
}

describe('executeMetric — dryRun confere o escopo do cliente (I3)', () => {
  it.each([
    ['comma join com outro tenant ({contratos}, imobiliaria_demo.vendas)', [['gcp', 'om_ds', 'contratos'], ['gcp', 'imobiliaria_demo', 'vendas']]],
    ['ponto com espaço (imobiliaria_demo . vendas)', [['gcp', 'imobiliaria_demo', 'vendas']]],
    ['comentário no ponto (imobiliaria_demo/**/.vendas)', [['gcp', 'imobiliaria_demo', 'vendas']]],
    ['quebra de linha antes do ponto', [['gcp', 'imobiliaria_demo', 'vendas']]],
    ['APPENDS(TABLE imobiliaria_demo.vendas, NULL, NULL)', [['gcp', 'imobiliaria_demo', 'vendas']]],
    ['comma join com dataset público', [['gcp', 'om_ds', 'contratos'], ['bigquery-public-data', 'samples', 'shakespeare']]],
  ] as Array<[string, Array<[string, string, string]>]>)('recusa %s', async (_n, tables) => {
    h.bqJob.mockResolvedValue(dryRunReading(tables));

    const r = await call({ dryRun: true });

    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.error).toMatch(/fora dos datasets do cliente/);
    if (!r.ok) expect(r.error).not.toMatch(/imobiliaria_demo|shakespeare|bigquery-public-data/);
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('recusa rotina (UDF) fora dos datasets do cliente', async () => {
    h.bqJob.mockResolvedValue(dryRunReading([['gcp', 'om_ds', 'contratos']], [['bqutil', 'fn', 'int']]));
    const r = await call({ dryRun: true });
    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it('aceita o dataset do binding e as tabelas de referência compartilhadas', async () => {
    h.bqJob.mockResolvedValue(dryRunReading([['gcp', 'om_ds', 'transacoes'], ['gcp', 'dataviz_aux', 'ba_bancos']]));
    const r = await call({ dryRun: true });
    expect(r.ok).toBe(true);
  });

  it('aceita dataset de OUTRO binding do mesmo cliente (produto diferente)', async () => {
    const twoBindings = [binding(), {
      productId: 'plus',
      datasets: [{ id: 'ds2', dataSourceId: 'bq', datasetId: 'om_cov', contractRef: 'outro', schemaBindings: {}, schema: {}, isPrimary: true }],
    }];
    h.bqJob.mockResolvedValue(dryRunReading([['gcp', 'om_ds', 'contratos'], ['gcp', 'om_cov', 'certidoes']]));
    const r = await call({ dryRun: true, parsedBindings: twoBindings });
    expect(r.ok).toBe(true);
  });

  it('render (sem dryRun) não ganha round trip extra: nenhum dry-run', async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    expect(h.bqJob).not.toHaveBeenCalled();
    expect(h.bqQuery).toHaveBeenCalledTimes(1);
  });
});

describe('executeMetric', () => {
  it('sucesso (aggregation) → ok:true com data/sql/outputColumns', async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual([{ value: 42 }]);
      expect(r.outputColumns).toEqual(['value']);
      expect(r.metricId).toBe('m');
    }
  });

  it('métrica de outro cliente → ok:false 403', async () => {
    const r = await call({ metric: metric({ ownerClientId: 'outro' }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('nenhum dataset cobre o contrato → ok:false 422', async () => {
    const r = await call({
      parsedBindings: [binding([
        { id: 'd', dataSourceId: 'bq', datasetId: 'x', contractRef: 'outro', schemaBindings: {}, schema: {}, isPrimary: true },
      ])],
    });
    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.error).toBe('Nenhum dataset do cliente cobre o contrato "canonical"');
  });

  it('lacuna de cobertura (G8) → ok:false 422 com missing', async () => {
    const r = await call({
      parsedBindings: [binding([
        { id: 'd', dataSourceId: 'bq', datasetId: 'om_ds', contractRef: 'canonical', schemaBindings: { 'carteira.outra': 'x' }, schema: {}, isPrimary: true },
      ])],
    });
    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.missing).toEqual([{ ref: 'canonical.carteira.saldo', reason: 'sem-mapping' }]);
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('tenant negado → ok:false 403', async () => {
    h.access.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('MetricResolutionError → ok:false 422', async () => {
    h.resolve.mockImplementation(() => { throw new MetricResolutionError('boom', 'm'); });
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it('erro inesperado no BQ → ok:false 500 genérico', async () => {
    h.bqQuery.mockRejectedValue(new Error('SELECT ... FROM secret.table'));
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).not.toContain('secret');
  });

  it('repassa ambientFilters para resolveMetric', async () => {
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    await call({ ambientFilters });
    expect(h.resolve).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });

  it('repassa ambientFilters para resolveDerivedMetric (ramo derived)', async () => {
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    const derivedMetric = metric({
      requires: ['canonical.contratos.valor_atraso', 'canonical.contratos.saldo_devedor'],
      recipe: {
        kind: 'derived', primaryEntity: 'canonical.contratos', joins: [],
        terms: [
          { id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' },
          { id: 'n', aggregation: 'sum', valueRef: 'canonical.contratos.saldo_devedor' },
        ],
        expression: 'tot / n', filters: [],
      },
    });
    await call({ metric: derivedMetric, ambientFilters });
    expect(h.resolveDerived).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });

  it('caches deduplicam access-check e DataSource entre métricas', async () => {
    const caches = newMetricExecCaches();
    await executeMetric({ metric: metric({ id: 'a' }), parsedBindings: [binding()], clientId: 'vila-rosa', email: 'u', relations: [], caches });
    await executeMetric({ metric: metric({ id: 'b' }), parsedBindings: [binding()], clientId: 'vila-rosa', email: 'u', relations: [], caches });
    expect(h.access).toHaveBeenCalledTimes(1);
    expect(h.getDS).toHaveBeenCalledTimes(1);
  });

  it('rota negada (métrica com rota mapeada) → ok:false 403 antes do tenant', async () => {
    h.routeAccess.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão para esta página' });
    const r = await call({ metric: metric({ id: 'covenants.indice_recebivel' }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    if (!r.ok) expect(r.error).toBe('Sem permissão para esta página');
    expect(h.access).not.toHaveBeenCalled();   // nem chega no tenant-check
    expect(h.bqQuery).not.toHaveBeenCalled();
    expect(h.routeAccess).toHaveBeenCalledWith('u@e.com', 'vila-rosa', '/g');
  });

  it('rota permitida → segue para tenant e executa', async () => {
    const r = await call({ metric: metric({ id: 'covenants.indice_recebivel' }) });
    expect(r.ok).toBe(true);
    expect(h.routeAccess).toHaveBeenCalledWith('u@e.com', 'vila-rosa', '/g');
    expect(h.bqQuery).toHaveBeenCalled();
  });

  // Este teste afirmava o contrário: métrica fora da allowlist NÃO checava
  // rota. Era o fail-open do achado R5 — cadastrar métrica pela admin, ou
  // deixar a IA criar uma pelo chat, abria acesso sem gate de página. Com a
  // allowlist de 64 ids substituída por regra, toda métrica é checada.
  it('métrica não catalogada TAMBÉM checa rota — cadastrar pela admin não abre buraco', async () => {
    const r = await call({ metric: metric({ id: 'chat.criada_pelo_usuario' }) });
    expect(r.ok).toBe(true);
    expect(h.routeAccess).toHaveBeenCalledWith('u@e.com', 'vila-rosa', '/g');
  });

  it('rota negada vale para métrica não catalogada também', async () => {
    h.routeAccess.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão para esta página' });
    const r = await call({ metric: metric({ id: 'chat.criada_pelo_usuario' }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('cacheia route-access entre métricas da mesma rota (1 verifyRouteAccess)', async () => {
    const caches = newMetricExecCaches();
    await executeMetric({ metric: metric({ id: 'covenants.indice_recebivel' }), parsedBindings: [binding()], clientId: 'vila-rosa', email: 'u@e.com', relations: [], caches });
    await executeMetric({ metric: metric({ id: 'covenants.contratos_total' }), parsedBindings: [binding()], clientId: 'vila-rosa', email: 'u@e.com', relations: [], caches });
    expect(h.routeAccess).toHaveBeenCalledTimes(1);
  });
});

describe('loadClientBindings', () => {
  it('ok:true parseando productBindings', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ productBindings: [binding()] }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('vila-rosa');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindings).toHaveLength(1);
  });

  it('cliente inexistente → ok:false 404', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('x');
    expect(r).toEqual({ ok: false, status: 404, error: 'Cliente "x" não encontrado' });
  });

  it('sem productBindings → ok:false 422', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('y');
    expect(r).toMatchObject({ ok: false, status: 422 });
  });
});

/**
 * ADR-0026 — as opções do seletor saem do resultado do PRÓPRIO indicador.
 *
 * Antes, o dropdown lia `SELECT DISTINCT <coluna> FROM <tabela da entidade>` e
 * não enxergava os JOINs da métrica: a tabela mostrava "BANCO INTER" e o
 * seletor oferecia `77`. Envolvendo a query resolvida, o que se oferece é, por
 * construção, o que está na tela.
 */
describe('executeMetric — distinctField', () => {
  it('envolve a query resolvida num DISTINCT do campo pedido', async () => {
    h.resolve.mockReturnValue({
      sql: 'SELECT b.nome_reduzido AS banco FROM t LEFT JOIN ba_bancos b ON 1=1',
      params: {},
      outputColumns: [],
    });
    h.bqQuery.mockResolvedValue([[{ value: 'BANCO INTER' }]]);

    const r = await call({ distinctField: 'banco' });

    const sql = (h.bqQuery.mock.calls[0][0] as { query: string }).query;
    expect(sql).toContain('SELECT DISTINCT `banco` AS value');
    expect(sql).toContain('LEFT JOIN ba_bancos');
    expect(sql).toContain('`banco` IS NOT NULL');
    expect(sql).toContain('ORDER BY 1');
    expect(sql).toContain('LIMIT 200');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([{ value: 'BANCO INTER' }]);
  });

  /*
   * O campo vem do documento da página, que a IA escreve. Um nome de campo com
   * crase fechando o identificador emendaria SQL na cláusula — o mesmo
   * `quoteIdentifier` do resto do resolver barra isso.
   */
  it.each([
    ['crase que fecha o identificador', 'banco` FROM x --'],
    ['ponto (coluna qualificada)', 't.banco'],
    ['ponto-e-vírgula', 'banco; SELECT 1'],
    ['comentário de linha', 'banco --'],
    ['cerquilha', 'banco #'],
    ['espaço', 'banco OR 1=1'],
    ['parêntese', 'banco)'],
  ])('recusa campo com %s', async (_case, field) => {
    const r = await call({ distinctField: field });

    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  /*
   * O seletor varre o DOMÍNIO INTEIRO do campo: a métrica é resolvida sem
   * filtro de período (ADR-0026), então o DISTINCT passa por tudo que a query
   * alcança. É o caminho mais caro do produto e o mais fácil de disparar —
   * basta abrir a página com o dropdown. O ramo single-contract já tinha teto;
   * o derived saía sem nenhum.
   */
  it('põe teto de bytes no caminho do seletor também em métrica derived', async () => {
    const derived = metric({
      requires: ['canonical.contratos.valor_atraso'],
      recipe: {
        kind: 'derived', primaryEntity: 'canonical.contratos', joins: [],
        terms: [{ id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' }],
        expression: 'tot', filters: [],
      },
    });

    const r = await call({ metric: derived, distinctField: 'banco' });

    expect(r.ok).toBe(true);
    const queryCall = h.bqQuery.mock.calls[0][0] as { query: string; maximumBytesBilled?: string };
    expect(queryCall.query).toContain('SELECT DISTINCT `banco` AS value');
    expect(Number(queryCall.maximumBytesBilled)).toBeGreaterThan(0);
  });

  /*
   * rules/cost.md: todo caminho que executa SQL passa o teto, sem exceção. O
   * render de métrica derived (`/api/metrics/batch`, `/api/metrics/[id]/data`)
   * saía sem teto; não há métrica derived no Firestore que pudesse regredir.
   */
  it('põe teto de bytes na execução normal de métrica derived', async () => {
    const derived = metric({
      requires: ['canonical.contratos.valor_atraso'],
      recipe: {
        kind: 'derived', primaryEntity: 'canonical.contratos', joins: [],
        terms: [{ id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' }],
        expression: 'tot', filters: [],
      },
    });

    const r = await call({ metric: derived });

    expect(r.ok).toBe(true);
    const queryCall = h.bqQuery.mock.calls[0][0] as { maximumBytesBilled?: string };
    expect(Number(queryCall.maximumBytesBilled)).toBeGreaterThan(0);
  });
});
