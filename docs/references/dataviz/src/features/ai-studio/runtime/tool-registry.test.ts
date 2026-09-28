import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/ai-agents/tools/execute-sql', () => ({ createExecuteSqlTool: (c: unknown) => ({ tool: 'execute_sql', c }) }));
vi.mock('@/features/ai-agents/tools/bq-dry-run-sql', () => ({ createBqDryRunSqlTool: () => ({ tool: 'dry' }) }));
vi.mock('@/features/ai-agents/tools/get-table-schema-v2', () => ({ createGetTableSchemaV2Tool: () => ({ tool: 'schema' }) }));
vi.mock('@/features/ai-agents/tools/get-sample-data', () => ({ createGetSampleDataTool: () => ({ tool: 'sample' }) }));
vi.mock('@/features/ai-agents/tools/calculate-statistics', () => ({ createCalculateStatisticsTool: () => ({ tool: 'stats' }) }));
vi.mock('@/features/ai-agents/tools/build-vintage-curves', () => ({ createBuildVintageCurvesTool: () => ({ tool: 'vintage' }) }));
vi.mock('@/features/ai-agents/tools/lookup-glossary', () => ({ lookupGlossaryTool: { tool: 'glossary' } }));
vi.mock('@/features/ai-agents/tools/vector-query', () => ({ createVectorQueryTool: (c: { clientId: string }) => ({ tool: 'vector', c }) }));
vi.mock('@/features/ai-agents/tools/recall-similar-sql', () => ({ createRecallSimilarSqlTool: (c: unknown) => ({ tool: 'recall', c }) }));
vi.mock('@/features/ai-agents/tools/bq-list-validated-queries', () => ({ createBqListValidatedQueriesTool: () => ({ tool: 'list' }) }));
vi.mock('@/features/ai-agents/tools/bqml/forecast', () => ({ createBqmlForecastTool: (c: { agentId: string; clientId: string }) => ({ tool: 'bqml_forecast', c }) }));
vi.mock('@/features/ai-agents/tools/calculate-wal', () => ({ createCalculateWalTool: () => ({ tool: 'wal' }) }));

import { buildToolsFromKeys } from './tool-registry';

const ctxFull = { dataset: 'om', filters: {}, sessionId: 's', clientId: 'OM', personaId: 'p' } as never;
const ctxNoTenant = { dataset: 'om', filters: {}, sessionId: 's' } as never;

describe('tool-registry (systemKey + canonical keys)', () => {
  it('resolve dry_run_sql (chave canônica) e lookup_glossary', () => {
    const out = buildToolsFromKeys(['dry_run_sql', 'lookup_glossary'], ctxFull, 'descriptive');
    expect(out.dry_run_sql).toBeDefined();
    expect(out.lookup_glossary).toBeDefined();
  });
  it('pula key desconhecida sem lançar', () => {
    const out = buildToolsFromKeys(['execute_sql', 'fantasma'], ctxFull, 'descriptive');
    expect(out.execute_sql).toBeDefined();
    expect(out.fantasma).toBeUndefined();
  });
  it('tenancy: vector_query/recall_similar_sql ausentes sem clientId/persona', () => {
    const no = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxNoTenant, 'descriptive');
    expect(no.vector_query).toBeUndefined();
    expect(no.recall_similar_sql).toBeUndefined();
    const yes = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxFull, 'descriptive');
    expect(yes.vector_query).toBeDefined();
    expect(yes.recall_similar_sql).toBeDefined();
  });
  it('list_validated_queries (chave canônica) sob tenancy', () => {
    expect(buildToolsFromKeys(['list_validated_queries'], ctxFull, 'diagnostic').list_validated_queries).toBeDefined();
    expect(buildToolsFromKeys(['list_validated_queries'], ctxNoTenant, 'diagnostic').list_validated_queries).toBeUndefined();
  });
  it('BQML recebe agentId derivado do systemKey e clientId=ctx.dataset', () => {
    const out = buildToolsFromKeys(['bqml_forecast'], { dataset: 'om', filters: {}, sessionId: 's' } as never, 'monitoring') as Record<string, { c: { agentId: string; clientId: string } }>;
    expect(out.bqml_forecast.c.agentId).toBe('monitoring_agent');
    expect(out.bqml_forecast.c.clientId).toBe('om');
  });
  it('resolve uma key de cashflow', () => {
    expect(buildToolsFromKeys(['calculate_wal'], { dataset: 'om', filters: {}, sessionId: 's' } as never, 'cashflow').calculate_wal).toBeDefined();
  });
});
