/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterValuesBody } from './schema';

describe('FilterValuesBody', () => {
  it('aceita payload válido', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo',
    }).success).toBe(true);
  });
  it('rejeita attribute sem entidade', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants', attribute: 'banco',
    }).success).toBe(false);
  });
  it('aceita labelAttribute opcional', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo',
      labelAttribute: 'transacoes.banco_nome',
    }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/metrics/filter-values
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  verifyClientAccess: vi.fn(),
  loadBindings: vi.fn(),
  executeMetric: vi.fn(),
  getMetricDoc: vi.fn(),
  getDataSource: vi.fn(),
  bqQuery: vi.fn(),
}));

vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: (...a: unknown[]) => h.verifyAuth(...a),
  verifyClientAccess: (...a: unknown[]) => h.verifyClientAccess(...a),
}));
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: (...a: unknown[]) => h.loadBindings(...a),
  executeMetric: (...a: unknown[]) => h.executeMetric(...a),
  newMetricExecCaches: () => ({}),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ DATAVIZ_DATABASE_ID: 'test-db' }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({ doc: () => ({ get: () => h.getMetricDoc() }) }),
  }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: (...a: unknown[]) => h.getDataSource(...a),
}));
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClientFor: vi.fn(async () => ({ query: h.bqQuery })),
}));

import { POST } from './route';

function req(body: unknown) {
  return { json: async () => body } as never;
}

const DATASET_MIGRATED = {
  id: 'ds-vr', dataSourceId: 'bq-main', datasetId: 'vr_dataset',
  contractRef: 'liquid-play-plus',
  schemaBindings: { 'transacoes.banco_codigo': 'cod_banco', 'transacoes.banco_nome': 'nome_banco' },
  schema: {}, isPrimary: true,
};

const BINDINGS_OK = [{ productId: 'covenants', datasets: [DATASET_MIGRATED], enabledIndicators: [] }];

beforeEach(() => {
  h.verifyAuth.mockReset().mockResolvedValue('u@e.com');
  h.verifyClientAccess.mockReset().mockResolvedValue({ allowed: true });
  h.loadBindings.mockReset().mockResolvedValue({ ok: true, bindings: BINDINGS_OK });
  h.getDataSource.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
  h.bqQuery.mockReset().mockResolvedValue([[{ value: 'Itaú' }, { value: 'Bradesco' }]]);
});

describe('POST /api/metrics/filter-values', () => {
  it('sem token → 401', async () => {
    h.verifyAuth.mockResolvedValue(null);
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));
    expect(res.status).toBe(401);
  });

  it('body inválido → 400', async () => {
    const res = await POST(req({ clientId: 'vila-rosa', attribute: 'banco' }));
    expect(res.status).toBe(400);
  });

  it('sem acesso ao cliente → repassa status/erro de verifyClientAccess', async () => {
    h.verifyClientAccess.mockResolvedValue({ allowed: false, error: 'Sem permissão para este cliente', status: 403 });
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Sem permissão para este cliente');
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('cliente sem productBindings → repassa erro de loadClientBindings', async () => {
    h.loadBindings.mockResolvedValue({ ok: false, status: 422, error: 'sem bindings' });
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));
    expect(res.status).toBe(422);
  });

  it('nenhum dataset cobre a entidade → 422', async () => {
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'pagamentos.valor' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('pagamentos');
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('attribute sem mapping em schemaBindings (ausente) → 422, sem fallback legado', async () => {
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.categoria' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('transacoes.categoria');
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('attribute mapeado como null (indisponível) → 422', async () => {
    h.loadBindings.mockResolvedValue({
      ok: true,
      bindings: [{
        productId: 'covenants',
        datasets: [{ ...DATASET_MIGRATED, schemaBindings: { ...DATASET_MIGRATED.schemaBindings, 'transacoes.banco_codigo': null } }],
      }],
    });
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));
    expect(res.status).toBe(422);
  });

  it('200: monta SELECT DISTINCT com coluna resolvida, IS NOT NULL, ORDER BY, LIMIT 200', async () => {
    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values).toEqual([{ value: 'Itaú' }, { value: 'Bradesco' }]);

    const [call] = h.bqQuery.mock.calls;
    const sql = (call[0] as { query: string }).query;
    expect(sql).toContain('SELECT DISTINCT `cod_banco` AS value');
    expect(sql).toContain('IS NOT NULL');
    expect(sql).toContain('ORDER BY 1');
    expect(sql).toContain('LIMIT 200');
    expect(sql).toContain('`gcp-project.vr_dataset.transacoes`');
  });

  // O DISTINCT varre a coluna inteira, e qualquer usuário o dispara ao abrir
  // um seletor: rules/cost.md exige o teto aqui também.
  it('passa o teto de bytes no DISTINCT do atributo', async () => {
    await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo' }));

    const opts = h.bqQuery.mock.calls[0][0] as { maximumBytesBilled?: string };
    expect(Number(opts.maximumBytesBilled)).toBeGreaterThan(0);
  });

  it('com labelAttribute mapeado: seleciona par (value, label)', async () => {
    h.bqQuery.mockResolvedValue([[{ value: 'itau', label: 'Itaú Unibanco' }]]);
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      attribute: 'transacoes.banco_codigo', labelAttribute: 'transacoes.banco_nome',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values).toEqual([{ value: 'itau', label: 'Itaú Unibanco' }]);
    const sql = (h.bqQuery.mock.calls[0][0] as { query: string }).query;
    expect(sql).toContain('`nome_banco` AS label');
  });

  it('labelAttribute sem mapping neste cliente: degrada para só value (best-effort)', async () => {
    h.bqQuery.mockResolvedValue([[{ value: 'Itaú' }]]);
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      attribute: 'transacoes.banco_codigo', labelAttribute: 'transacoes.inexistente',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values).toEqual([{ value: 'Itaú' }]);
  });

  it('regressão a2-metricas-01: resolve dataset por schemaBindings (não por contractRef === entidade), shape real Vila Rosa/Galli', async () => {
    const multiEntityDataset = {
      id: 'ds-vr-multi', dataSourceId: 'bq-main', datasetId: 'vr_dataset',
      contractRef: 'liquid-play-plus',
      schemaBindings: {
        'transacoes.categoria': 'categoria_transacao',
        'covenants_calculo.algo': 'algo_calculado',
      },
      schema: {}, isPrimary: true,
    };
    h.loadBindings.mockResolvedValue({
      ok: true,
      bindings: [{ productId: 'covenants', datasets: [multiEntityDataset], enabledIndicators: [] }],
    });
    h.bqQuery.mockResolvedValue([[{ value: 'Aluguel' }, { value: 'Condomínio' }]]);

    const res = await POST(req({ clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.categoria' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values).toEqual([{ value: 'Aluguel' }, { value: 'Condomínio' }]);
    const sql = (h.bqQuery.mock.calls[0][0] as { query: string }).query;
    expect(sql).toContain('SELECT DISTINCT `categoria_transacao` AS value');
  });
});

/**
 * ADR-0026 — as opções saem do resultado do indicador, não da tabela da
 * entidade. É o modo que existe porque `SELECT DISTINCT banco_codigo FROM
 * transacoes` oferecia `77` para uma tela que mostra "BANCO INTER".
 */
describe('POST /api/metrics/filter-values — modo campo do indicador', () => {
  const METRIC = {
    id: 'covenants.extrato_table',
    label: 'Extrato Detalhado',
    requires: ['liquid-play-plus.transacoes.valor'],
    type: 'table',
    version: '1.0.0',
    status: 'active',
    ownerClientId: null,
    createdAt: null,
    updatedAt: null,
    recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco}' },
    filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } },
  };

  beforeEach(() => {
    h.getMetricDoc.mockReset().mockResolvedValue({
      exists: true, id: METRIC.id, data: () => METRIC,
    });
    h.executeMetric.mockReset().mockResolvedValue({
      ok: true, metricId: METRIC.id, data: [{ value: 'BANCO INTER' }], sql: 'x', outputColumns: ['value'],
    });
  });

  it('aceita metricId + field no body', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field: 'banco',
    }).success).toBe(true);
  });

  it('recusa body sem attribute e sem metricId/field', () => {
    expect(FilterValuesBody.safeParse({ clientId: 'vila-rosa', productId: 'covenants' }).success).toBe(false);
  });

  it('200: devolve os valores do campo do indicador', async () => {
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field: 'banco',
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).values).toEqual([{ value: 'BANCO INTER' }]);
    expect(h.executeMetric).toHaveBeenCalledWith(
      expect.objectContaining({ distinctField: 'banco', clientId: 'vila-rosa' }),
    );
    // A tabela da entidade não é mais consultada por fora.
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('métrica inexistente → 404', async () => {
    h.getMetricDoc.mockResolvedValue({ exists: false });
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants', metricId: 'covenants.sumida', field: 'banco',
    }));
    expect(res.status).toBe(404);
  });

  /*
   * Campo que a métrica não declara como filtrável não vira dropdown: ela pode
   * até ter a coluna no SELECT, mas sem `filterFields` o WHERE não a compara —
   * e o seletor nasceria decorativo, que é o defeito da ADR-0025 de volta.
   */
  it('campo não declarado como filtrável → 422, sem consultar o BigQuery', async () => {
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field: 'descricao',
    }));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('descricao');
    expect(h.executeMetric).not.toHaveBeenCalled();
  });

  it('erro do executeMetric vira status dele', async () => {
    h.executeMetric.mockResolvedValue({ ok: false, metricId: METRIC.id, status: 403, error: 'Sem permissão' });
    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field: 'banco',
    }));
    expect(res.status).toBe(403);
  });
});

/**
 * ADR-0026 — o `field` vira `SELECT DISTINCT <field>` sobre a query da métrica.
 * Ele vem do documento da página, que o assistente escreve, então a rota é a
 * primeira das três barreiras (schema → declaração em `filterFields` →
 * `quoteIdentifier`). Aqui se prova a primeira: nada que não seja identificador
 * chega a tocar o Firestore.
 */
describe('POST /api/metrics/filter-values — o campo é identificador ou não passa', () => {
  it.each([
    ['crase', 'banco` FROM x --'],
    ['ponto', 't.banco'],
    ['ponto-e-vírgula', 'banco; SELECT 1'],
    ['comentário de linha', 'banco --'],
    ['cerquilha', 'banco #'],
    ['espaço', 'banco OR 1=1'],
    ['string vazia', ''],
  ])('%s no field → 400, sem ler métrica nem executar', async (_case, field) => {
    h.getMetricDoc.mockReset();
    h.executeMetric.mockReset();

    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field,
    }));

    expect(res.status).toBe(400);
    expect(h.getMetricDoc).not.toHaveBeenCalled();
    expect(h.executeMetric).not.toHaveBeenCalled();
  });
});

/**
 * Documento de catálogo que não valida é dado ruim, não falha de servidor — e
 * `filterFields` acabou de virar mais uma coisa que pode não validar. O
 * `/api/metrics/batch` já trata assim: 422 para quem chamou, motivo no log
 * (mensagem "inválida" não vaza shape de schema, e quem investiga precisa saber
 * qual campo).
 */
describe('POST /api/metrics/filter-values — métrica com documento inválido', () => {
  it('422, não 500, e sem chegar ao BigQuery', async () => {
    h.getMetricDoc.mockReset().mockResolvedValue({
      exists: true,
      id: 'covenants.extrato_table',
      // `expr` com marcador de comentário: reprovado por MetricDoc.
      data: () => ({
        label: 'Extrato Detalhado',
        requires: ['liquid-play-plus.transacoes.valor'],
        recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco}' },
        filterFields: { banco: { expr: 'b.nome_reduzido --', field: 'banco' } },
      }),
    });
    h.executeMetric.mockReset();

    const res = await POST(req({
      clientId: 'vila-rosa', productId: 'covenants',
      metricId: 'covenants.extrato_table', field: 'banco',
    }));

    expect(res.status).toBe(422);
    expect(h.executeMetric).not.toHaveBeenCalled();
  });
});
