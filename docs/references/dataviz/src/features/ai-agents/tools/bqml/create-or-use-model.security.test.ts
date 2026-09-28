import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Ataques ao `sourceQuery` do bqml_create_or_use_model.
 *
 * O `sourceQuery` vem do modelo e ia cru para `CREATE OR REPLACE MODEL … AS
 * <sourceQuery>`, num job sem `maximumBytesBilled`. O BigQuery roda script de
 * vários comandos num job só: `…; DROP TABLE x` executava com a service
 * account do app. Cada caso abaixo precisa ser recusado SEM que nenhum job
 * real (não dry-run) seja criado.
 */

vi.mock('./cache', () => ({
  lookupCachedModel: vi.fn(async () => null),
  recordModelInRegistry: vi.fn(async () => undefined),
  bumpUsage: vi.fn(async () => undefined),
  computeModelHash: () => 'hashabcdef123456',
  computeFeaturesCanonical: () => 'ltv|prazo_decorrido',
  computeSourceColumnsDdlHash: () => 'cols',
}));
vi.mock('./invocation-logger', () => ({ logBqmlInvocation: vi.fn() }));

vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async () => ({
    ok: true,
    bindings: [
      { productId: 'liquid-play', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_play' }] },
      { productId: 'liquid-play-plus', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_covenants' }] },
    ],
  }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => ({ projectId: 'proj-teste' }) }));

const createQueryJobMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => {
  const real = await orig<typeof import('@/shared/lib/bigquery/client')>();
  return {
    ...real,
    getBigQueryClient: () => ({ projectId: 'proj-teste', createQueryJob: createQueryJobMock }),
  };
});

const TENANT = 'proj-teste.vila_rosa_play';

const baseInput = {
  intent: 'clustering' as const,
  features: ['ltv', 'prazo_decorrido'],
  target: null,
  sourceQuery: 'SELECT ltv, prazo_decorrido FROM contratos',
  sourceColumns: [{ name: 'ltv', type: 'NUMERIC', mode: 'NULLABLE' }],
  safraWindowEnd: null,
  modelTypeOverride: null,
  ddlOptions: null,
};

function dryRun(opts: { statementType?: string; tables?: Array<[string, string, string]>; bytes?: string } = {}) {
  return [{
    metadata: {
      statistics: {
        totalBytesProcessed: opts.bytes ?? '1000',
        query: {
          statementType: opts.statementType ?? 'SELECT',
          referencedTables: (opts.tables ?? [['proj-teste', 'vila_rosa_play', 'contratos']]).map(
            ([projectId, datasetId, tableId]) => ({ projectId, datasetId, tableId }),
          ),
        },
      },
    },
  }];
}

const doneJob = () => [{
  getMetadata: async () => [{ status: { state: 'DONE' }, statistics: { totalBytesBilled: '1000' } }],
}];

/** Jobs que NÃO são dry-run: execução de verdade. */
const realJobs = () =>
  createQueryJobMock.mock.calls.filter(([opts]) => !(opts as { dryRun?: boolean }).dryRun);

async function run(input: Partial<typeof baseInput>) {
  const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
  const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: TENANT, sessionId: 's', agentId: 'a' });
  const gen = tool.execute!({ ...baseInput, ...input }, { toolCallId: 't', messages: [] } as never);
  const yields: Array<Record<string, unknown>> = [];
  for await (const y of gen as AsyncGenerator<Record<string, unknown>>) yields.push(y);
  return yields[yields.length - 1]!;
}

async function needsApproval(input: Partial<typeof baseInput>) {
  const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
  const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: TENANT, sessionId: 's', agentId: 'a' });
  return (tool as unknown as { needsApproval: (i: typeof baseInput) => Promise<boolean> })
    .needsApproval({ ...baseInput, ...input });
}

beforeEach(() => {
  createQueryJobMock.mockReset();
});

describe('bqml_create_or_use_model — sourceQuery recusado antes do BigQuery', () => {
  it.each([
    ['segundo comando', 'SELECT ltv FROM contratos; DROP TABLE contratos'],
    ['INSERT', "INSERT INTO contratos (ltv) VALUES (1)"],
    ['DELETE', 'DELETE FROM contratos WHERE TRUE'],
    ['CREATE', 'CREATE TABLE x AS SELECT 1'],
    ['MERGE', 'MERGE INTO contratos t USING s ON FALSE WHEN NOT MATCHED THEN INSERT ROW'],
    ['DECLARE', 'DECLARE x INT64; SELECT x'],
    ['BEGIN…END', 'BEGIN SELECT 1; END'],
    ['EXECUTE IMMEDIATE', "EXECUTE IMMEDIATE 'DROP TABLE contratos'"],
    ['comentário escondendo o segundo comando', 'SELECT 1 --\n; DROP TABLE contratos'],
    ['EXPORT DATA', "EXPORT DATA OPTIONS(uri='gs://x/*', format='CSV') AS SELECT * FROM contratos"],
    ['ML.* sobre modelo de outro tenant', 'SELECT * FROM ML.PREDICT(MODEL `proj-teste.dataviz_bqml_outro.bqml_x`, TABLE contratos)'],
    ['AI.* com conexão', "SELECT AI.GENERATE(CONCAT('x', CAST(ltv AS STRING)), connection_id => 'us.conn') AS r FROM contratos"],
  ])('%s', async (_name, sourceQuery) => {
    const out = await run({ sourceQuery });
    expect(out.status).toBe('refused');
    expect(out.code).toBe('SQL_RECUSADO');
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });
});

describe('bqml_create_or_use_model — escopo e tipo verificados pelo dry-run', () => {
  it('recusa sourceQuery que lê o dataset de outro cliente', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['proj-teste', 'outro_cliente_play', 'contratos']] }));
    const out = await run({ sourceQuery: 'SELECT ltv, prazo_decorrido FROM `proj-teste.outro_cliente_play.contratos`' });
    expect(out.status).toBe('refused');
    expect(out.code).toBe('FORA_DO_TENANT');
    expect(realJobs()).toHaveLength(0);
  });

  it('recusa tabela de mesmo nome de dataset em outro projeto', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['outro-projeto', 'vila_rosa_play', 'contratos']] }));
    const out = await run({ sourceQuery: 'SELECT ltv, prazo_decorrido FROM `outro-projeto.vila_rosa_play.contratos`' });
    expect(out.code).toBe('FORA_DO_TENANT');
    expect(realJobs()).toHaveLength(0);
  });

  it('recusa quando o BigQuery diz que não é um SELECT (script)', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ statementType: 'SCRIPT' }));
    const out = await run({});
    expect(out.code).toBe('NAO_E_SELECT');
    expect(realJobs()).toHaveLength(0);
  });

  it('falha do dry-run recusa a execução (não vira "0 bytes")', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('dry-run indisponível'));
    const out = await run({});
    expect(out.status).toBe('refused');
    expect(out.code).toBe('FORA_DO_TENANT');
    expect(realJobs()).toHaveLength(0);
  });

  it('falha do dry-run exige aprovação em vez de liberar como custo zero', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('dry-run indisponível'));
    expect(await needsApproval({})).toBe(true);
  });
});

describe('bqml_create_or_use_model — identificadores e opções', () => {
  it('schema recusa dataset de override (o dataset do modelo é derivado do tenant)', async () => {
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: TENANT, sessionId: 's', agentId: 'a' });
    const schema = tool.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ ...baseInput, dataset: 'dataviz_bqml_outro_cliente' }).success).toBe(false);
  });

  it('schema recusa modelTypeOverride fora da lista', async () => {
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: TENANT, sessionId: 's', agentId: 'a' });
    const schema = tool.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ ...baseInput, modelTypeOverride: "KMEANS') AS SELECT 1; DROP TABLE t; --" }).success).toBe(false);
    expect(schema.safeParse({ ...baseInput, modelTypeOverride: 'KMEANS' }).success).toBe(true);
  });

  it('feature com crase, ponto ou espaço é recusada sem job', async () => {
    for (const f of ['ltv`', 'contratos.ltv', 'ltv x']) {
      createQueryJobMock.mockReset();
      createQueryJobMock.mockResolvedValue(dryRun());
      const out = await run({ features: [f] });
      expect(out.status, f).toBe('refused');
      expect(realJobs(), f).toHaveLength(0);
    }
  });
});

describe('bqml_create_or_use_model — caminho legítimo', () => {
  it('SELECT no dataset do tenant monta o DDL no dataset BQML com teto de bytes', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun()).mockResolvedValueOnce(doneJob());
    const out = await run({ sourceQuery: 'SELECT ltv, prazo_decorrido FROM contratos;' });
    expect(out.status).toBe('ready');

    const [ddlJob] = realJobs();
    const opts = ddlJob![0] as {
      query: string;
      maximumBytesBilled?: string;
      defaultDataset?: { datasetId: string; projectId?: string };
    };
    expect(opts.query).toMatch(/^CREATE OR REPLACE MODEL `dataviz_bqml_vila_rosa\.bqml_clustering_hashabcd`/);
    expect(opts.query).toContain('SELECT ltv, prazo_decorrido FROM contratos');
    expect(opts.query).not.toMatch(/contratos;/);
    const { maxBytesBilled } = await import('@/shared/lib/bigquery/cost-guard');
    expect(opts.maximumBytesBilled).toBe(String(maxBytesBilled()));
    expect(opts.defaultDataset).toEqual({ datasetId: 'vila_rosa_play', projectId: 'proj-teste' });
  });

  it('needsApproval usa os bytes do dry-run e libera job pequeno', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ bytes: '1000' }));
    expect(await needsApproval({})).toBe(false);
  });

  it('needsApproval pede aprovação entre o limiar e o teto — faixa em que o job ainda roda', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ bytes: String(4 * 1024 ** 3) }));

    expect(await needsApproval({})).toBe(true);
  });

  // O gate em US$ (ADR-0007) usava 100 000 linhas × 100 bytes fixos: nunca
  // passava de centavos, e nunca disparava. Agora vem dos bytes do dry-run.
  it('needsApproval pede aprovação quando o custo dos bytes do dry-run passa de US$ 5', async () => {
    const TiB = 1024 ** 4;
    process.env.BQ_MAX_BYTES_BILLED = String(4 * TiB); // limiar de bytes = 2 TiB
    try {
      createQueryJobMock.mockResolvedValueOnce(dryRun({ bytes: String(TiB) })); // KMEANS: ~US$ 6,9

      expect(await needsApproval({})).toBe(true);
    } finally {
      delete process.env.BQ_MAX_BYTES_BILLED;
    }
  });

  it('estimativa acima do teto não pede aprovação: a execução recusa sem criar job', async () => {
    createQueryJobMock.mockResolvedValue(dryRun({ bytes: String(6 * 1024 ** 3) }));

    const need = await needsApproval({});
    const out = await run({});

    expect(need).toBe(false);
    expect(out).toMatchObject({ status: 'refused', code: 'ACIMA_DO_TETO' });
    expect(out.error).toMatch(/teto de bytes/);
    expect(realJobs()).toHaveLength(0);
  });

  it('needsApproval não pede aprovação para o que a execução vai recusar de qualquer jeito', async () => {
    expect(await needsApproval({ sourceQuery: 'SELECT 1; DROP TABLE t' })).toBe(false);
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });
});

describe('bqml_create_or_use_model — escopo são os datasets vinculados ao cliente', () => {
  it('aceita sourceQuery que junta os dois datasets do mesmo cliente', async () => {
    createQueryJobMock
      .mockResolvedValueOnce(dryRun({ tables: [['proj-teste', 'vila_rosa_play', 'contratos'], ['proj-teste', 'vila_rosa_covenants', 'certidoes']] }))
      .mockResolvedValueOnce(doneJob());
    const out = await run({ sourceQuery: 'SELECT ltv, prazo_decorrido FROM contratos JOIN vila_rosa_covenants.certidoes USING (id)' });
    expect(out.status).toBe('ready');
  });
});
