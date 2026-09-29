import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `execute_sql` roda SQL escrito pelo modelo com a service account do app, e
 * `bigquery.query` executa script de vários comandos num job só. A guarda de
 * texto é um modelo do léxico do BigQuery e já divergiu dele (comentário
 * terminado em `\r`). Por isso o tool exige, antes de executar, um dry-run em
 * que o PRÓPRIO BigQuery classifique a query como um único SELECT.
 */

const queryMock = vi.fn();
const createQueryJobMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({ projectId: 'proj-teste', query: queryMock, createQueryJob: createQueryJobMock }),
}));
// Bindings do cliente resolvidos no servidor (Firestore), nunca do input do modelo.
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
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => ({ projectId: 'proj-teste' }) }));
vi.mock('@/shared/lib/memory/persist-sql', () => ({ persistSqlGeneration: vi.fn(async () => undefined) }));
vi.mock('@/features/sql-catalog/use-count-hook', () => ({ incrementCatalogUse: vi.fn(async () => undefined) }));

const ctx = {
  dataset: 'vila_rosa_monitor',
  filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' } },
  sessionId: 's',
  clientId: 'vila-rosa',
} as never;

function dryRun(statementType: string, tables: Array<[string, string, string]> = []) {
  return [{
    metadata: {
      statistics: {
        totalBytesProcessed: '10',
        query: {
          statementType,
          referencedTables: tables.map(([projectId, datasetId, tableId]) => ({ projectId, datasetId, tableId })),
        },
      },
    },
  }];
}

async function run(query: string) {
  const { createExecuteSqlTool } = await import('./execute-sql');
  return (await createExecuteSqlTool(ctx).execute!({ query }, { toolCallId: 't', messages: [] } as never)) as {
    success: boolean;
    code?: string;
  };
}

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue([[]]);
  createQueryJobMock.mockReset();
});

describe('execute_sql — payloads do review (comentário terminado em CR)', () => {
  it.each([
    ['--c\\r + SELECT', 'SELECT 1 AS x --c\r; SELECT 2 AS y'],
    ['#c\\r + SELECT', 'SELECT 1 AS x #c\r; SELECT 2 AS y'],
    ['--\\r + EXPORT DATA', "SELECT 1 AS x --\r; EXPORT DATA OPTIONS(uri='gs://b/*', format='CSV') AS SELECT * FROM contratos"],
    ['#\\r + EXPORT DATA cross-tenant', "SELECT 1 AS x #\r; EXPORT DATA OPTIONS(uri='gs://b/*', format='CSV') AS SELECT * FROM imobiliaria_demo.vendas"],
    ['--\\r + DROP', 'SELECT 1 AS x --\r; DROP TABLE contratos'],
    ['--\\r + DELETE', 'SELECT 1 AS x --\r; DELETE FROM contratos WHERE TRUE'],
  ])('%s: recusado sem executar', async (_n, query) => {
    const out = await run(query);
    expect(out.success).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('execute_sql — dry-run SELECT antes de executar', () => {
  it('recusa quando o BigQuery classifica como SCRIPT, mesmo que a guarda de texto aceite', async () => {
    // Simula um furo de léxico ainda desconhecido: texto aceito, BigQuery vê script.
    createQueryJobMock.mockResolvedValueOnce(dryRun('SCRIPT'));
    const out = await run('SELECT 1 AS x');
    expect(out).toMatchObject({ success: false, code: 'NAO_E_SELECT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('falha do dry-run recusa (fail closed)', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('indisponível'));
    const out = await run('SELECT 1 AS x');
    // Falha não reconhecida recebe a resposta genérica (uma só para todo erro semântico).
    expect(out).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('caminho legítimo: dry-run SELECT, depois execução com teto e dataset do tenant', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [['proj-teste', 'vila_rosa_monitor', 'contratos']]));
    queryMock.mockResolvedValueOnce([[{ n: 1 }]]);
    const out = await run('SELECT COUNT(*) AS n FROM contratos');
    expect(out.success).toBe(true);
    const dry = createQueryJobMock.mock.calls[0]![0] as { dryRun?: boolean; defaultDataset?: unknown };
    expect(dry.dryRun).toBe(true);
    expect(dry.defaultDataset).toEqual({ datasetId: 'vila_rosa_monitor' });
    const exec = queryMock.mock.calls[0]![0] as { maximumBytesBilled?: string };
    expect(exec.maximumBytesBilled).toBeDefined();
  });
});

describe('execute_sql — só lê os datasets vinculados ao cliente', () => {
  it('recusa leitura de dataset de outro tenant (mesmo projeto)', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [['proj-teste', 'imobiliaria_demo', 'vendas']]));
    const out = await run('SELECT COUNT(*) AS n FROM imobiliaria_demo.vendas');
    expect(out).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('recusa INFORMATION_SCHEMA de região e dataset público', async () => {
    for (const t of [['proj-teste', 'region-us', 'INFORMATION_SCHEMA.SCHEMATA'], ['bigquery-public-data', 'samples', 'shakespeare']] as Array<[string, string, string]>) {
      createQueryJobMock.mockReset().mockResolvedValueOnce(dryRun('SELECT', [t]));
      const out = await run('SELECT 1 AS x');
      expect(out, t.join('.')).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('aceita join entre os dois datasets do mesmo cliente', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [
      ['proj-teste', 'vila_rosa_monitor', 'contratos'],
      ['proj-teste', 'vila_rosa_covenants', 'certidoes'],
    ]));
    const out = await run('SELECT COUNT(*) AS n FROM contratos, vila_rosa_covenants.certidoes');
    expect(out.success).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('aceita as tabelas de referência compartilhadas e recusa o resto do dataset delas', async () => {
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [['proj-teste', 'dataviz_aux', 'ba_bancos']]));
    expect((await run('SELECT * FROM dataviz_aux.ba_bancos')).success).toBe(true);
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [['proj-teste', 'dataviz_aux', 'outra_tabela']]));
    expect(await run('SELECT * FROM dataviz_aux.outra_tabela')).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
  });

  it('recusa rotina (UDF/TVF) fora dos datasets do cliente, inclusive no dataset de referência', async () => {
    for (const ds of ['imobiliaria_demo', 'dataviz_aux']) {
      createQueryJobMock.mockReset().mockResolvedValueOnce([{
        metadata: { statistics: { query: {
          statementType: 'SELECT',
          referencedTables: [],
          referencedRoutines: [{ projectId: 'proj-teste', datasetId: ds, routineId: 'f' }],
        } } },
      }]);
      expect(await run('SELECT 1 AS x'), ds).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    }
    createQueryJobMock.mockReset().mockResolvedValueOnce([{
      metadata: { statistics: { query: {
        statementType: 'SELECT',
        referencedRoutines: [{ projectId: 'proj-teste', datasetId: 'vila_rosa_monitor', routineId: 'f' }],
      } } },
    }]);
    expect((await run('SELECT 1 AS x')).success).toBe(true);
  });
});

/**
 * O que volta ao modelo quando a checagem recusa. A mensagem crua do BigQuery
 * trazia o id do projeto e dizia se uma tabela existe ("Not found" vs. "fora do
 * tenant") — um oráculo de existência de tabela de outro cliente. Agora: código
 * estável + mensagem genérica; o detalhe vai para o log do servidor.
 */
describe('execute_sql — erros estáveis, sem detalhe do BigQuery', () => {
  const PROJ = 'white-smile-508914-q2';
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });

  async function failure(err: Error) {
    createQueryJobMock.mockRejectedValueOnce(err);
    return (await run('SELECT 1 AS x')) as { success: boolean; code?: string; error?: string };
  }

  it('tabela inexistente e tabela de outro tenant respondem IGUAL (sem oráculo de existência)', async () => {
    const missing = await failure(new Error(`Not found: Table ${PROJ}:imobiliaria_demo.nao_existe was not found in location US`));
    createQueryJobMock.mockResolvedValueOnce(dryRun('SELECT', [[PROJ, 'imobiliaria_demo', 'vendas']]));
    const exists = (await run('SELECT 1 AS x')) as { code?: string; error?: string };
    const noAccess = await failure(new Error('Access Denied: Table bigquery-public-data:x.y: User does not have permission to query table'));

    expect(missing.code).toBe('FORA_DO_TENANT');
    expect(exists.code).toBe('FORA_DO_TENANT');
    expect(noAccess.code).toBe('FORA_DO_TENANT');
    expect(missing.error).toBe(exists.error);
    expect(noAccess.error).toBe(exists.error);
    for (const r of [missing, exists, noAccess]) {
      expect(r.error).not.toMatch(/white-smile|imobiliaria_demo|nao_existe|vendas|bigquery-public-data/);
    }
  });

  it('erro de sintaxe devolve só o tipo e a posição', async () => {
    const r = await failure(new Error(`Syntax error: Expected end of input but got keyword FROM at [1:10] in ${PROJ}`));
    expect(r.code).toBe('DRY_RUN_FALHOU');
    expect(r.error).toMatch(/sintaxe/);
    expect(r.error).toContain('[1:10]');
    expect(r.error).not.toContain(PROJ);
  });

  it('erro de nome/tipo recebe a resposta genérica, sem posição (a posição era oráculo)', async () => {
    const r = await failure(new Error('Unrecognized name: saldo_devedr at [1:8]'));
    expect(r.code).toBe('FORA_DO_TENANT');
    expect(r.error).not.toMatch(/\[\d+:\d+\]|saldo_devedr/);
  });

  it('erro qualquer vira mensagem genérica, sem o texto do BigQuery', async () => {
    const r = await failure(new Error(`Internal error in ${PROJ}: backend unavailable`));
    expect(r.code).toBe('FORA_DO_TENANT');
    expect(r.error).not.toMatch(/white-smile|backend/);
  });

  it('o detalhe completo vai para o log do servidor', async () => {
    await failure(new Error(`Not found: Table ${PROJ}:imobiliaria_demo.nao_existe`));
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('nao_existe');
    expect(logged).toContain('FORA_DO_TENANT');
  });
});
