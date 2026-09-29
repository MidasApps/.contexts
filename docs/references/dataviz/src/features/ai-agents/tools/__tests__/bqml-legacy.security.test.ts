import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanSql } from '@/features/ai-agents/lib/sql-guard';

/**
 * Tools BQML legados (forecast_timeseries, detect_anomalies, run_causal_analysis
 * e os demais que usam `bqml-utils`): os pontos onde texto do modelo entra no
 * SQL que eles montam, e o teto de bytes dos jobs que eles rodam.
 */

const queryMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({ projectId: 'proj-teste', query: queryMock }),
}));

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue([[]]);
});

describe('safeWhereClause', () => {
  it.each([
    ['comentário partindo SELECT (subquery em outro dataset)', 'id_contrato IN (SEL/**/ECT id_contrato FROM `p.outro.contratos`)'],
    ['comentário de linha', 'projeto = 1 --'],
    ['fecha o parêntese para escapar do AND', '1=1) OR (1=1'],
    ['parêntese sobrando', 'projeto = 1)'],
    ['segundo comando', "projeto = 'x'; DROP TABLE contratos"],
    ['literal sem fechamento', "projeto = 'x"],
    ['nome qualificado entre crases', 'projeto IN UNNEST(`p.outro.t`)'],
    ['UNION', '1=1 UNION ALL SELECT 1'],
    ['DML', 'DELETE FROM contratos'],
    ['função de IA escalar com conexão', "AI.GENERATE_BOOL(CONCAT('é fraude? ', nome_cliente), connection_id => 'us.conn').result"],
    ['OBJ.* com conexão', "OBJ.MAKE_REF('gs://b/o', 'us.conn') IS NOT NULL"],
    ['ML escalar', 'ML.DISTANCE([ltv], [0.5]) < 1'],
  ])('recusa: %s', async (_n, clause) => {
    const { safeWhereClause } = await import('../bqml-utils');
    expect(() => safeWhereClause(clause)).toThrow();
  });

  it('filtro legítimo volta entre parênteses (não altera a precedência do AND)', async () => {
    const { safeWhereClause } = await import('../bqml-utils');
    expect(safeWhereClause("projeto = 'Residencial; Norte' AND ltv > 0.8")).toBe(
      "(projeto = 'Residencial; Norte' AND ltv > 0.8)",
    );
    expect(safeWhereClause('(ltv > 0.8 OR dias_atraso > 90) AND safra >= 2020')).toBe(
      '((ltv > 0.8 OR dias_atraso > 90) AND safra >= 2020)',
    );
  });
});

describe('safeWhereClause — EXTRACT(<parte> FROM coluna) é filtro, não subquery', () => {
  it.each([
    'EXTRACT(YEAR FROM data_emissao) = 2020',
    'EXTRACT(MONTH FROM data_base_report) = 6',
    'ltv > 0.8 AND EXTRACT(YEAR FROM data_contrato) BETWEEN 2019 AND EXTRACT(YEAR FROM data_base_report)',
    '(EXTRACT(MONTH FROM data_base_report) + 1) > EXTRACT(DAY FROM data_contrato)',
    'extract ( week(monday) from data_base_report ) = 10',
  ])('aceita %s', async (clause) => {
    const { safeWhereClause } = await import('../bqml-utils');
    expect(safeWhereClause(clause)).toBe(`(${clause})`);
  });

  it.each([
    ['subquery dentro do EXTRACT', 'EXTRACT(YEAR FROM (SELECT MAX(data_base_report) FROM `p.outro.contratos`)) = 2020'],
    ['FROM fora de EXTRACT', 'id_contrato IN (FROM contratos |> SELECT id_contrato)'],
    ['FROM solto depois de um EXTRACT legítimo', 'EXTRACT(YEAR FROM data_emissao) = 2020 AND x IN (FROM t)'],
  ])('recusa %s', async (_n, clause) => {
    const { safeWhereClause } = await import('../bqml-utils');
    expect(() => safeWhereClause(clause)).toThrow();
  });

  it.each(['(TABLE imobiliaria_demo.vendas) IS NOT NULL', 'EXISTS(TABLE imobiliaria_demo.vendas)'])(
    'recusa a palavra TABLE (%s)',
    async (clause) => {
      const { safeWhereClause } = await import('../bqml-utils');
      expect(() => safeWhereClause(clause)).toThrow(/TABLE/);
    },
  );

  it('a mensagem de FROM solto não diz "subquery" quando não há SELECT', async () => {
    const { safeWhereClause } = await import('../bqml-utils');
    expect(() => safeWhereClause('x IN (FROM t)')).toThrow(/FROM fora de EXTRACT/);
  });
});

describe('helpers de job do bqml-utils passam o teto de bytes', () => {
  it('trainModel, queryBQML e dropModel', async () => {
    const { trainModel, queryBQML, dropModel } = await import('../bqml-utils');
    const { maxBytesBilled } = await import('@/shared/lib/bigquery/cost-guard');
    await trainModel('vila_rosa_play', 'CREATE OR REPLACE MODEL `vila_rosa_play.bqml_x` AS SELECT 1');
    await queryBQML('vila_rosa_play', 'SELECT 1');
    await dropModel('vila_rosa_play', '`vila_rosa_play.bqml_x`');
    expect(queryMock).toHaveBeenCalledTimes(3);
    for (const [opts] of queryMock.mock.calls) {
      expect((opts as { maximumBytesBilled?: string }).maximumBytesBilled).toBe(String(maxBytesBilled()));
    }
  });
});

describe('run_causal_analysis — treatmentValue vira literal, nunca código', () => {
  const ctx = {
    dataset: 'vila_rosa_play',
    sessionId: 'sessao-123',
    filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' } },
  } as never;

  it.each([
    ['barra antes da aspa', "\\' ; DROP TABLE contratos; --"],
    ['barra + quebra de linha', "\\'\n; DROP TABLE contratos; SELECT '"],
    ['aspa simples', "x' OR TRUE OR 'y"],
  ])('%s', async (_n, treatmentValue) => {
    const { createRunCausalAnalysisTool } = await import('../run-causal-analysis');
    await createRunCausalAnalysisTool(ctx).execute!(
      {
        metrica: 'dias_atraso',
        // `safeColumn` do tool só aceita coluna numérica (limitação existente).
        tratamentoColuna: 'restricoes',
        tratamentoValor: treatmentValue,
        dataCortePre: '2025-06-01',
        aggregation: 'AVG',
      },
      { toolCallId: 't', messages: [] } as never,
    );
    expect(queryMock).toHaveBeenCalled();
    for (const [opts] of queryMock.mock.calls) {
      const { normalized, unterminated } = scanSql((opts as { query: string }).query);
      // Com o léxico do BigQuery, o valor precisa ficar INTEIRO dentro do literal.
      expect(unterminated).toBe(false);
      expect(normalized).not.toMatch(/DROP|;|\bOR TRUE\b/);
    }
  });

  it('valor com aspa e acento legítimo continua funcionando', async () => {
    const { createRunCausalAnalysisTool } = await import('../run-causal-analysis');
    await createRunCausalAnalysisTool(ctx).execute!(
      {
        metrica: 'dias_atraso',
        // `safeColumn` do tool só aceita coluna numérica (limitação existente).
        tratamentoColuna: 'restricoes',
        tratamentoValor: "Residencial D'Ávila",
        dataCortePre: '2025-06-01',
        aggregation: 'AVG',
      },
      { toolCallId: 't', messages: [] } as never,
    );
    const sql = (queryMock.mock.calls[0]![0] as { query: string }).query;
    expect(sql).toContain("'Residencial D\\'Ávila'");
  });
});

describe('fallback sem BQML também passa o teto de bytes', () => {
  const ctx = {
    dataset: 'vila_rosa_play',
    sessionId: 'sessao-123',
    filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' } },
  } as never;
  const opts = { toolCallId: 't', messages: [] } as never;

  it.each([
    ['forecast_timeseries', async () => {
      const { createForecastTimeseriesTool } = await import('../forecast-timeseries');
      await createForecastTimeseriesTool(ctx).execute!({ metric: 'saldo_devedor', aggregation: 'SUM', horizonte: 6, confidenceLevel: 0.9 }, opts);
    }],
    ['detect_anomalies', async () => {
      const { createDetectAnomaliesTool } = await import('../detect-anomalies');
      await createDetectAnomaliesTool(ctx).execute!({ metric: 'saldo_devedor', aggregation: 'SUM', anomalyThreshold: 0.05 }, opts);
    }],
  ])('%s', async (_n, run) => {
    // Treino falha → cai no fallback SQL puro.
    queryMock.mockReset().mockRejectedValueOnce(new Error('BQML indisponível')).mockResolvedValue([[]]);
    await run();
    expect(queryMock.mock.calls.length).toBeGreaterThan(1);
    for (const [o] of queryMock.mock.calls) {
      expect((o as { maximumBytesBilled?: string }).maximumBytesBilled).toBeDefined();
    }
  });
});
