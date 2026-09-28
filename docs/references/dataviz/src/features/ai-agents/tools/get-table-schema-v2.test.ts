import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMetadataMock = vi.fn();
const createQueryJobMock = vi.fn();
const tableMock = vi.fn(() => ({ getMetadata: getMetadataMock }));
const datasetMock = vi.fn(() => ({ table: tableMock }));

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    dataset: datasetMock,
    createQueryJob: createQueryJobMock,
  }),
  parseDatasetRef: (s: string) => ({ datasetId: s, projectId: undefined }),
  TABLES: { contratos: 'contratos_t', pagamentos: 'pagamentos_t', fluxo_caixa: 'fluxo_t' },
}));

const baseCtx = { dataset: 'OM', filters: { dateRange: { start: '', end: '' }, projetos: [] }, sessionId: 's' } as never;

function makeFields(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `c${i}`, type: 'STRING', mode: 'NULLABLE', description: `col ${i}` }));
}

function makeStatsRow(n: number, prefix = 'c') {
  const row: Record<string, unknown> = { total_rows: 1000 };
  for (let i = 0; i < n; i++) {
    row[`null_ratio_${prefix}${i}`] = 0.1;
    row[`distinct_${prefix}${i}`] = 42;
    row[`sample_${prefix}${i}`] = ['a', 'b', 'c'];
  }
  return row;
}

describe('createGetTableSchemaV2Tool', () => {
  beforeEach(() => {
    getMetadataMock.mockReset();
    createQueryJobMock.mockReset();
    tableMock.mockClear();
    datasetMock.mockClear();
  });

  it('returns columns with stats for sampleable types', async () => {
    getMetadataMock.mockResolvedValueOnce([{ schema: { fields: makeFields(3) } }]);
    createQueryJobMock.mockResolvedValueOnce([
      { getQueryResults: () => Promise.resolve([[makeStatsRow(3)]]) },
    ]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const tool = createGetTableSchemaV2Tool(baseCtx);
    const out = (await tool.execute!({ table: 'contratos' }, { toolCallId: 'tc', messages: [] } as never)) as {
      success: boolean;
      columns: { name: string; nullRatio: number; distinctCount: number | null; sampleValues: string[] }[];
    };
    expect(out.success).toBe(true);
    expect(out.columns).toHaveLength(3);
    expect(out.columns[0]!.nullRatio).toBe(0.1);
    expect(out.columns[0]!.distinctCount).toBe(42);
    expect(out.columns[0]!.sampleValues).toEqual(['a', 'b', 'c']);
  });

  it('caches results: second call within TTL returns from cache', async () => {
    getMetadataMock.mockResolvedValue([{ schema: { fields: makeFields(2) } }]);
    createQueryJobMock.mockResolvedValue([{ getQueryResults: () => Promise.resolve([[makeStatsRow(2)]]) }]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache, getCacheStats } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const tool = createGetTableSchemaV2Tool(baseCtx);
    await tool.execute!({ table: 'contratos' }, { toolCallId: 'tc', messages: [] } as never);
    await tool.execute!({ table: 'contratos' }, { toolCallId: 'tc', messages: [] } as never);
    expect(createQueryJobMock).toHaveBeenCalledTimes(1);
    const stats = getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('skips non-sampleable types (BYTES) without sampleValues/distinctCount', async () => {
    getMetadataMock.mockResolvedValueOnce([
      {
        schema: {
          fields: [
            { name: 'a', type: 'STRING', mode: 'NULLABLE' },
            { name: 'b', type: 'BYTES', mode: 'NULLABLE' },
          ],
        },
      },
    ]);
    createQueryJobMock.mockResolvedValueOnce([
      { getQueryResults: () => Promise.resolve([[{ total_rows: 100, null_ratio_a: 0, distinct_a: 10, sample_a: ['x'], null_ratio_b: 0.5 }]]) },
    ]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const tool = createGetTableSchemaV2Tool(baseCtx);
    const out = (await tool.execute!({ table: 'contratos' }, { toolCallId: 'tc', messages: [] } as never)) as {
      success: boolean;
      columns: { name: string; type: string; nullRatio: number; distinctCount: number | null; sampleValues: string[] }[];
    };
    const b = out.columns.find((c) => c.name === 'b')!;
    expect(b.distinctCount).toBeNull();
    expect(b.sampleValues).toEqual([]);
    expect(b.nullRatio).toBe(0.5);
  });

  it('returns success:false on BQ error', async () => {
    getMetadataMock.mockRejectedValueOnce(new Error('BQ down'));
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const tool = createGetTableSchemaV2Tool(baseCtx);
    const out = (await tool.execute!({ table: 'contratos' }, { toolCallId: 'tc', messages: [] } as never)) as {
      success: boolean;
      columns: unknown[];
    };
    expect(out.success).toBe(false);
    expect(out.columns).toEqual([]);
  });

  /** Tabela de outro domínio (a `vendas` da imobiliária) no dataset autorizado. */
  it('reads any table of the authorized dataset, not only the credit ones', async () => {
    getMetadataMock.mockResolvedValueOnce([{ schema: { fields: makeFields(1) } }]);
    createQueryJobMock.mockResolvedValueOnce([{ getQueryResults: () => Promise.resolve([[makeStatsRow(1)]]) }]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const tool = createGetTableSchemaV2Tool(baseCtx);
    const out = (await tool.execute!({ table: 'vendas' }, { toolCallId: 'tc', messages: [] } as never)) as { success: boolean };
    expect(out.success).toBe(true);
    expect(datasetMock).toHaveBeenCalledWith('OM', undefined);
    expect(tableMock).toHaveBeenCalledWith('vendas');
  });

  it('does not take an inherited Object name (constructor) as a mapped table', async () => {
    getMetadataMock.mockResolvedValueOnce([{ schema: { fields: [] } }]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    await createGetTableSchemaV2Tool(baseCtx).execute!({ table: 'constructor' }, { toolCallId: 'tc', messages: [] } as never);
    expect(tableMock).toHaveBeenCalledWith('constructor');
  });

  it('keeps mapping the legacy logical names to their physical table', async () => {
    getMetadataMock.mockResolvedValueOnce([{ schema: { fields: makeFields(1) } }]);
    createQueryJobMock.mockResolvedValueOnce([{ getQueryResults: () => Promise.resolve([[makeStatsRow(1)]]) }]);
    const { createGetTableSchemaV2Tool, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    await createGetTableSchemaV2Tool(baseCtx).execute!({ table: 'pagamentos' }, { toolCallId: 'tc', messages: [] } as never);
    expect(tableMock).toHaveBeenCalledWith('pagamentos_t');
  });

  it.each([['outro.vendas'], ['`p.ds.t`'], ['INFORMATION_SCHEMA.TABLES'], ['INFORMATION_SCHEMA'], ['__TABLES__'], ['__TABLES_SUMMARY__'], ['vendas; DROP'], ['']])(
    'refuses a table name that is not a plain identifier: %s',
    async (table) => {
      const { createGetTableSchemaV2Tool } = await import('./get-table-schema-v2');
      const schema = (createGetTableSchemaV2Tool(baseCtx) as unknown as { inputSchema: { safeParse: (i: unknown) => { success: boolean } } }).inputSchema;
      expect(schema.safeParse({ table }).success).toBe(false);
    },
  );

  it('refuses a metadata table even when execute is called directly', async () => {
    const { createGetTableSchemaV2Tool } = await import('./get-table-schema-v2');
    const out = (await createGetTableSchemaV2Tool(baseCtx).execute!({ table: '__TABLES__' }, { toolCallId: 'tc', messages: [] } as never)) as { success: boolean };
    expect(out.success).toBe(false);
    expect(tableMock).not.toHaveBeenCalled();
  });

  it('getCacheStats returns shape', async () => {
    const { getCacheStats, clearSchemaV2Cache } = await import('./get-table-schema-v2');
    clearSchemaV2Cache();
    const s = getCacheStats();
    expect(s).toMatchObject({ hits: 0, misses: 0, size: 0 });
    expect(typeof s.hitRate).toBe('number');
  });
});
