import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `dry_run_sql` diz ao modelo se a query DELE é válida e quanto custa. Sem
 * escopo de tenant, o dry-run virava um oráculo: o schema previsto de
 * `SELECT * FROM outro_tenant.tabela`, a contagem de bytes dela, e a mensagem
 * crua do BigQuery ("Not found: Table <projeto>:outro.x") respondiam se uma
 * tabela de outro cliente existe — e traziam o id do projeto.
 */

const createQueryJobMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({ projectId: 'white-smile-508914-q2', createQueryJob: createQueryJobMock }),
}));
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async (clientId: string) => clientId === 'vila-rosa'
    ? {
        ok: true,
        bindings: [
          { productId: 'liquid-play', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_monitor' }] },
          { productId: 'liquid-play-plus', datasets: [{ dataSourceId: 'bq-main', datasetId: 'vila_rosa_covenants' }] },
        ],
      }
    : { ok: false, status: 404, error: 'não encontrado' },
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: async () => ({ projectId: 'white-smile-508914-q2' }),
}));

const ctx = {
  dataset: 'vila_rosa_monitor',
  filters: { dateRange: { start: '', end: '' } },
  sessionId: 's',
  clientId: 'vila-rosa',
} as never;

function dryRun(opts: {
  statementType?: string;
  tables?: Array<[string, string, string]>;
  bytes?: string;
  fields?: Array<{ name: string; type: string; mode: string }>;
}) {
  return [{
    metadata: {
      statistics: {
        totalBytesProcessed: opts.bytes ?? '1024',
        query: {
          statementType: opts.statementType ?? 'SELECT',
          schema: { fields: opts.fields ?? [{ name: 'id', type: 'STRING', mode: 'NULLABLE' }] },
          referencedTables: (opts.tables ?? []).map(([projectId, datasetId, tableId]) => ({ projectId, datasetId, tableId })),
        },
      },
    },
  }];
}

type Out = {
  valid: boolean;
  schema?: unknown[];
  bytesProcessed?: number;
  statementType?: string;
  code?: string;
  error?: string;
  errorClass?: string;
};

async function run(sql: string, c: unknown = ctx): Promise<Out> {
  const { createBqDryRunSqlTool } = await import('./bq-dry-run-sql');
  return (await createBqDryRunSqlTool(c as never).execute!({ sql }, { toolCallId: 'tc', messages: [] } as never)) as Out;
}

beforeEach(() => {
  createQueryJobMock.mockReset();
});

describe('dry_run_sql — query do próprio cliente', () => {
  it('returns the predicted schema and bytes for a SELECT over the client tables', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['white-smile-508914-q2', 'vila_rosa_monitor', 'contratos']] }));

    const out = await run('SELECT id FROM contratos');

    expect(out).toMatchObject({
      valid: true,
      schema: [{ name: 'id', type: 'STRING', mode: 'NULLABLE' }],
      bytesProcessed: 1024,
      statementType: 'SELECT',
    });
  });

  it('dry-runs with the route dataset as the default dataset', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['white-smile-508914-q2', 'vila_rosa_monitor', 'contratos']] }));

    await run('SELECT id FROM contratos');

    const opts = createQueryJobMock.mock.calls[0]![0] as { dryRun?: boolean; defaultDataset?: unknown };
    expect(opts).toMatchObject({ dryRun: true, defaultDataset: { datasetId: 'vila_rosa_monitor' } });
  });

  it('accepts a join between two datasets bound to the same client', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [
      ['white-smile-508914-q2', 'vila_rosa_monitor', 'contratos'],
      ['white-smile-508914-q2', 'vila_rosa_covenants', 'certidoes'],
    ] }));

    const out = await run('SELECT 1 AS x FROM contratos, vila_rosa_covenants.certidoes');

    expect(out.valid).toBe(true);
  });

  it('flags a query whose estimate is over the byte cap, since execute_sql would refuse it', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({
      tables: [['white-smile-508914-q2', 'vila_rosa_monitor', 'contratos']],
      bytes: String(50 * 1024 ** 3),
    }));

    const out = (await run('SELECT * FROM contratos')) as Out & { exceedsByteCap?: boolean };

    expect(out).toMatchObject({ valid: true, exceedsByteCap: true });
  });
});

describe('dry_run_sql — nada de outro tenant chega ao modelo', () => {
  it('refuses a table of another tenant without returning its schema or bytes', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({
      tables: [['white-smile-508914-q2', 'imobiliaria_demo', 'vendas']],
      fields: [{ name: 'cpf_comprador', type: 'STRING', mode: 'NULLABLE' }],
      bytes: '987654321',
    }));

    const out = await run('SELECT * FROM imobiliaria_demo.vendas');

    expect(out).toMatchObject({ valid: false, code: 'FORA_DO_TENANT' });
    expect(out.schema).toBeUndefined();
    expect(out.bytesProcessed).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/imobiliaria_demo|vendas|cpf_comprador|987654321/);
  });

  it('answers a missing table and an existing out-of-scope table exactly alike', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('Not found: Table white-smile-508914-q2:imobiliaria_demo.nao_existe was not found in location US'));
    const missing = await run('SELECT * FROM imobiliaria_demo.nao_existe');
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['white-smile-508914-q2', 'imobiliaria_demo', 'vendas']] }));

    const existing = await run('SELECT * FROM imobiliaria_demo.nao_existe');

    expect(missing).toEqual(existing);
  });

  it('never shows the project id to the model', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('Access Denied: Table white-smile-508914-q2:outro.x: User does not have permission to query table white-smile-508914-q2:outro.x'));

    const out = await run('SELECT * FROM outro.x');

    expect(out.valid).toBe(false);
    expect(JSON.stringify(out)).not.toContain('white-smile-508914-q2');
  });

  it('refuses INFORMATION_SCHEMA of the region and public datasets', async () => {
    for (const t of [
      ['white-smile-508914-q2', 'region-us', 'INFORMATION_SCHEMA.TABLES'],
      ['bigquery-public-data', 'samples', 'shakespeare'],
    ] as Array<[string, string, string]>) {
      createQueryJobMock.mockReset().mockResolvedValueOnce(dryRun({ tables: [t] }));

      const out = await run('SELECT 1 AS x');

      expect(out, t.join('.')).toMatchObject({ valid: false, code: 'FORA_DO_TENANT' });
    }
  });

  it('without a client, only the route dataset is in scope', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [['white-smile-508914-q2', 'vila_rosa_covenants', 'certidoes']] }));

    const out = await run('SELECT 1 AS x FROM vila_rosa_covenants.certidoes', { ...(ctx as object), clientId: undefined });

    expect(out).toMatchObject({ valid: false, code: 'FORA_DO_TENANT' });
  });
});

describe('dry_run_sql — erros com código estável', () => {
  it('reports a syntax error with its position, without the raw BigQuery message', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('Syntax error: Expected end of input but got keyword FROM at [1:8]'));

    const out = await run('SELECT FROM contratos');

    expect(out).toMatchObject({ valid: false, code: 'DRY_RUN_FALHOU', errorClass: 'syntax' });
    expect(out.error).toContain('[1:8]');
    expect(out.error).not.toContain('Expected end of input');
  });

  it('refuses writes without calling BigQuery', async () => {
    const out = await run('DROP TABLE contratos');

    expect(out).toMatchObject({ valid: false, code: 'SQL_RECUSADO', errorClass: 'forbidden' });
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });

  it('refuses ML models and external connections, which referencedTables does not list', async () => {
    for (const sql of [
      'SELECT * FROM ML.PREDICT(MODEL `outro_bqml.m`, TABLE contratos)',
      "SELECT * FROM EXTERNAL_QUERY('us.conn', 'SELECT 1')",
    ]) {
      const out = await run(sql);

      expect(out, sql).toMatchObject({ valid: false, code: 'SQL_RECUSADO', errorClass: 'forbidden' });
    }
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });

  it('refuses what BigQuery classifies as a script', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun({ statementType: 'SCRIPT' }));

    const out = await run('SELECT 1 AS x');

    expect(out).toMatchObject({ valid: false, code: 'NAO_E_SELECT', errorClass: 'forbidden' });
  });

  it('refuses a comment-split second statement that the raw-text regex let through', async () => {
    const out = await run("SELECT 1 AS x --\r; EXPORT DATA OPTIONS(uri='gs://b/*', format='CSV') AS SELECT 1");

    expect(out.valid).toBe(false);
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });
});

/**
 * Revisões do PR P: o CÓDIGO e a POSIÇÃO do erro eram um oráculo. Coluna
 * inexistente numa tabela de outro tenant dava `DRY_RUN_FALHOU [1:8]`, tabela
 * inexistente dava `FORA_DO_TENANT` — existência de tabela, de coluna e tipo
 * de coluna vazavam. A primeira correção enumerava as posições de tabela e
 * ainda deixou passar o JOIN entre parênteses e o hint `@{…}`.
 *
 * Agora a regra é pela CLASSE do erro: todo erro semântico (nome, tipo, "not
 * found", acesso, o que não se classificar) tem UMA resposta, igual à da query
 * que compila mas lê fora do escopo — dentro ou fora do escopo, exista ou não
 * o objeto. Só o erro de sintaxe, que o BigQuery acusa ANTES de resolver nomes,
 * mantém a posição.
 */
describe('dry_run_sql — uma resposta só para todo erro semântico', () => {
  const PID = 'white-smile-508914-q2';
  const rejects = (msg: string) => () => createQueryJobMock.mockRejectedValueOnce(new Error(msg));
  const cases: Array<[string, string, () => void]> = [
    ['tabela não existe', 'SELECT zzz FROM imobiliaria_demo.nao_existe',
      rejects(`Not found: Table ${PID}:imobiliaria_demo.nao_existe was not found in location US`)],
    ['tabela existe, coluna não', 'SELECT zzz FROM imobiliaria_demo.vendas', rejects('Unrecognized name: zzz at [1:8]')],
    ['tabela e coluna existem', 'SELECT venda_id FROM imobiliaria_demo.vendas',
      () => createQueryJobMock.mockResolvedValueOnce(dryRun({ tables: [[PID, 'imobiliaria_demo', 'vendas']] }))],
    ['tipo da coluna', 'SELECT 1 FROM imobiliaria_demo.vendas WHERE venda_id = 1',
      rejects('No matching signature for operator = for argument types: STRING, INT64 at [1:45]')],
    ['subquery escalar', 'SELECT (SELECT zzz FROM imobiliaria_demo.vendas LIMIT 1) AS x FROM contratos',
      rejects('Unrecognized name: zzz at [1:16]')],
    ['JOIN entre parênteses, coluna não existe', 'SELECT zzz FROM (imobiliaria_demo.vendas JOIN contratos ON TRUE)',
      rejects('Unrecognized name: zzz at [1:8]')],
    ['JOIN entre parênteses, tabela não existe', 'SELECT zzz FROM (imobiliaria_demo.nao_existe_xyz JOIN contratos ON TRUE)',
      rejects(`Not found: Table ${PID}:imobiliaria_demo.nao_existe_xyz was not found in location US`)],
    ['JOIN entre parênteses, tipo', 'SELECT 1 FROM (imobiliaria_demo.vendas JOIN contratos ON TRUE) WHERE venda_id = 1',
      rejects('No matching signature for operator = for argument types: STRING, INT64 at [1:70]')],
    ['JOIN entre parênteses aninhado', 'SELECT 1 FROM contratos c1 JOIN (imobiliaria_demo.vendas CROSS JOIN contratos c2) ON TRUE WHERE zzz = 1',
      rejects('Unrecognized name: zzz at [1:8]')],
    ['JOIN entre parênteses em EXISTS', 'SELECT 1 FROM contratos WHERE EXISTS (SELECT zzz FROM (imobiliaria_demo.vendas CROSS JOIN contratos))',
      rejects('Unrecognized name: zzz at [1:46]')],
    ['hint de JOIN', 'SELECT zzz FROM contratos CROSS JOIN @{JOIN_METHOD=HASH_JOIN} imobiliaria_demo.vendas',
      rejects('Unrecognized name: zzz at [1:8]')],
    ['hint de JOIN, tipo', 'SELECT 1 FROM contratos JOIN @{JOIN_METHOD=HASH_JOIN} imobiliaria_demo.vendas ON TRUE WHERE venda_id = 1',
      rejects('No matching signature for operator = for argument types: STRING, INT64 at [1:93]')],
    ['campo de alias de outro tenant', 'SELECT v.zzz FROM imobiliaria_demo.vendas v', rejects('Name zzz not found inside v at [1:10]')],
    ['acesso negado', 'SELECT 1 FROM outro.x', rejects(`Access Denied: Table ${PID}:outro.x: User does not have permission`)],
    ['dry-run indisponível', 'SELECT zzz FROM imobiliaria_demo.vendas', rejects('socket hang up')],
    // Dentro do escopo: mesma resposta — senão a diferença volta a ser oráculo.
    ['coluna inexistente, tabela do cliente', 'SELECT zzz FROM contratos', rejects('Unrecognized name: zzz at [1:8]')],
    ['campo de alias, tabela do cliente', 'SELECT c.zzz FROM contratos c', rejects('Name zzz not found inside c at [1:10]')],
    ['tipo, tabela do cliente', "SELECT 1 FROM contratos WHERE saldo_devedor = 'a'",
      rejects('No matching signature for operator = for argument types: NUMERIC, STRING at [1:31]')],
    ['tabela do cliente que não existe', 'SELECT 1 FROM contratos_x', rejects(`Not found: Table ${PID}:vila_rosa_monitor.contratos_x`)],
  ];

  it('answers every semantic failure and every out-of-scope read byte for byte alike', async () => {
    const responses = new Map<string, string[]>();
    for (const [name, sql, arrange] of cases) {
      arrange();
      const r = JSON.stringify(await run(sql));
      responses.set(r, [...(responses.get(r) ?? []), name]);
    }

    expect([...responses.values()]).toHaveLength(1);
    const [single] = [...responses.keys()];
    expect(JSON.parse(single!)).toMatchObject({ valid: false, code: 'FORA_DO_TENANT' });
    expect(single).not.toMatch(/\[\d+:\d+\]|STRING|INT64|zzz|vendas|imobiliaria|white-smile/);
  });

  it.each([
    ['tabela do cliente', 'SELECT x FROM contratos WHERE', 'Syntax error: Unexpected end of script at [1:30]', '[1:30]'],
    ['tabela de outro tenant', 'SELECT zzz FROM imobiliaria_demo.vendas WHERE', 'Syntax error: Unexpected end of script at [1:46]', '[1:46]'],
    ['JOIN entre parênteses', 'SELECT zzz FROM (imobiliaria_demo.vendas JOIN contratos ON TRUE) WHERE', 'Syntax error: Unexpected end of script at [1:71]', '[1:71]'],
  ])('keeps the syntax error position (parse runs before name resolution): %s', async (_n, sql, msg, pos) => {
    createQueryJobMock.mockRejectedValueOnce(new Error(msg));

    const out = await run(sql);

    expect(out).toMatchObject({ valid: false, code: 'DRY_RUN_FALHOU', errorClass: 'syntax' });
    expect(out.error).toContain(pos);
    expect(out.error).not.toMatch(/Unexpected|vendas|imobiliaria/);
  });
});
