import { getBigQueryClient, formatTableRef } from './client';
import { resolveColumn, hasField } from './schema-resolver';
import type { ClientSchema } from '@/features/admin/model/types';
import { DEFAULT_FILTER_SOURCE, type FilterSource } from './filter-source';
import { quoteIdentifier } from './identifier';
import { maxBytesBilled } from './cost-guard';

type Schema = Record<string, Record<string, string | null>> | null | undefined;

function formatMonthOptionLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).replace('.', '').toLowerCase();
}

export async function queryFilterOptions(
  dataset?: string,
  schema?: Schema,
  source: FilterSource = DEFAULT_FILTER_SOURCE,
) {
  const bq = getBigQueryClient();

  const table = source.table;
  // Column names come from the client binding; without a legacy schema they reach
  // here unchecked, so they are validated and quoted before becoming SQL.
  const dateField = quoteIdentifier(resolveColumn(schema, table, source.dateField) ?? source.dateField, 'column');
  const projectColumn = source.projectField ? resolveColumn(schema, table, source.projectField) : null;
  const quotedProjectField = projectColumn ? quoteIdentifier(projectColumn, 'column') : null;

  const datesSql = `
    SELECT DISTINCT ${dateField} AS data_base_report
    FROM ${formatTableRef(dataset, table)}
    WHERE ${dateField} IS NOT NULL
    ORDER BY ${dateField} DESC
  `;

  const projectsSql = quotedProjectField ? `
    SELECT DISTINCT ${quotedProjectField} AS projeto
    FROM ${formatTableRef(dataset, table)}
    WHERE ${quotedProjectField} IS NOT NULL AND ${quotedProjectField} != ''
    ORDER BY ${quotedProjectField}
  ` : null;

  const [dateRows, projectRows] = await Promise.all([
    bq.query({ query: datesSql, maximumBytesBilled: String(maxBytesBilled()) }).then(([rows]) => rows as Array<{ data_base_report: Date | string }>),
    projectsSql
      ? bq.query({ query: projectsSql, maximumBytesBilled: String(maxBytesBilled()) }).then(([rows]) => rows as Array<{ projeto: string }>)
      : Promise.resolve([] as Array<{ projeto: string }>),
  ]);

  return {
    dataBases: dateRows.map((row) => {
      const raw = row.data_base_report;
      // BigQuery returns DATE columns as { value: "YYYY-MM-DD" } objects
      const dateStr = raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : typeof raw === 'string'
          ? raw
          : (raw as { value?: string })?.value ?? String(raw);
      const date = new Date(`${dateStr}T00:00:00Z`);
      const value = date.toISOString().slice(0, 10);
      return {
        value,
        label: formatMonthOptionLabel(date),
      };
    }),
    projetos: projectRows.map((row) => row.projeto).filter(Boolean),
  };
}

// ─── Benchmark aggregation ────────────────────────────────────────────────────

export interface BenchmarkClient {
  dataset: string;
  schema: ClientSchema;
}

export interface BenchmarkResult {
  resumo: {
    inadimplencia_pct: { p25: number; p50: number; p75: number; media: number };
    over_90_pct: { p25: number; p50: number; p75: number; media: number };
    ltv: { p25: number; p50: number; p75: number; media: number };
    elegibilidade_pct: number;
    pdd_sobre_saldo_pct: number;
    pdd_bacen_media: number;
    pdd_liquid_media: number;
    delta_pdd_media: number;
  };
  distribuicao_rating: Array<{ rating: string; pct: number }>;
  distribuicao_atraso: Array<{ faixa: string; pct: number }>;
  evolucao_mensal: Array<{
    mes: string;
    inadimplencia_pct: number;
    over_90_pct: number;
    ltv_medio: number;
    elegibilidade_pct: number;
    pdd_sobre_saldo_pct: number;
  }>;
}

const BENCHMARK_FIELDS = [
  'saldo_devedor', 'valor_atraso', 'valor_over_90', 'ltv',
  'rating_liquid', 'elegibilidade', 'pdd_liquid', 'pdd_minimo_bacen',
  'categoria_inadimplencia', 'data_base_report',
] as const;

/**
 * Mínimo de carteiras para que o agregado seja de fato um benchmark de mercado.
 *
 * Achado R20 da revisão de 2026-08-04, verificado: a suspeita registrada era de
 * vazamento cross-tenant, e NÃO é — tudo que sai daqui é agregado (médias,
 * quantis, distribuição percentual), nunca linha de cliente. A leitura de todos
 * os `clients` é intencional, é o que faz o benchmark ser de mercado.
 *
 * O problema real é outro e mais direto: só havia o guarda `eligible.length === 0`.
 * Com UM cliente ativo — a situação de hoje — o produto devolvia a carteira do
 * próprio usuário rotulada como "Agregado anonimizado de carteiras Liquid". Num
 * produto de risco de crédito, comparar-se consigo mesmo achando que é o mercado
 * é erro de interpretação de dado, não detalhe.
 *
 * Três também é o piso de k-anonimato: com dois, cada participante deduz o outro
 * a partir da média e da própria carteira.
 */
export const MIN_BENCHMARK_CLIENTS = 3;

export async function queryBenchmarkAggregated(
  clients: BenchmarkClient[],
  startDate: string,
  endDate: string,
): Promise<BenchmarkResult | null> {
  const eligible = clients.filter(({ schema }) =>
    BENCHMARK_FIELDS.every((f) => hasField(schema, 'contratos', f)),
  );

  if (eligible.length < MIN_BENCHMARK_CLIENTS) return null;

  const arms = eligible.map(({ dataset, schema }) => {
    const fields = BENCHMARK_FIELDS.map((f) => {
      const resolved = resolveColumn(schema, 'contratos', f);
      if (resolved === null) return `0 AS ${f}`;
      if (resolved === f) return f;
      return `${resolved} AS ${f}`;
    }).join(', ');
    const dateCol = resolveColumn(schema, 'contratos', 'data_base_report') ?? 'data_base_report';
    return `SELECT ${fields} FROM ${formatTableRef(dataset, 'contratos')} WHERE ${dateCol} BETWEEN @startDate AND @endDate`;
  });

  const unionSql = arms.join('\n    UNION ALL\n    ');

  const sql = `
    WITH all_contracts AS (
      ${unionSql}
    ),
    resumo AS (
      SELECT
        SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_media,
        SAFE_DIVIDE(SUM(valor_over_90), SUM(saldo_devedor)) * 100 AS over_90_media,
        AVG(ltv) * 100 AS ltv_media,
        SAFE_DIVIDE(COUNTIF(elegibilidade IN ('Elegivel','Elegível')), COUNT(*)) * 100 AS elegibilidade_pct,
        SAFE_DIVIDE(SUM(pdd_liquid), SUM(saldo_devedor)) * 100 AS pdd_sobre_saldo_pct,
        AVG(pdd_minimo_bacen) AS pdd_bacen_media,
        AVG(pdd_liquid) AS pdd_liquid_media,
        AVG(pdd_liquid - pdd_minimo_bacen) AS delta_pdd_media,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(1)] AS inad_p25,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(2)] AS inad_p50,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(3)] AS inad_p75,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(1)] AS over90_p25,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(2)] AS over90_p50,
        APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(3)] AS over90_p75,
        APPROX_QUANTILES(ltv * 100, 4)[OFFSET(1)] AS ltv_p25,
        APPROX_QUANTILES(ltv * 100, 4)[OFFSET(2)] AS ltv_p50,
        APPROX_QUANTILES(ltv * 100, 4)[OFFSET(3)] AS ltv_p75
      FROM all_contracts
    ),
    dist_rating AS (
      SELECT
        rating_liquid AS rating,
        SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100 AS pct
      FROM all_contracts
      GROUP BY rating_liquid
      ORDER BY rating_liquid
    ),
    dist_atraso AS (
      SELECT
        categoria_inadimplencia AS faixa,
        SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100 AS pct
      FROM all_contracts
      GROUP BY categoria_inadimplencia
    ),
    evolucao AS (
      SELECT
        FORMAT_DATE('%Y-%m', data_base_report) AS mes,
        SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_pct,
        SAFE_DIVIDE(SUM(valor_over_90), SUM(saldo_devedor)) * 100 AS over_90_pct,
        AVG(ltv) * 100 AS ltv_medio,
        SAFE_DIVIDE(COUNTIF(elegibilidade IN ('Elegivel','Elegível')), COUNT(*)) * 100 AS elegibilidade_pct,
        SAFE_DIVIDE(SUM(pdd_liquid), SUM(saldo_devedor)) * 100 AS pdd_sobre_saldo_pct
      FROM all_contracts
      GROUP BY mes
      ORDER BY mes
    )
    SELECT 'resumo' AS _type, TO_JSON_STRING(r) AS data FROM resumo r
    UNION ALL
    SELECT 'rating' AS _type, TO_JSON_STRING(ARRAY_AGG(STRUCT(rating, pct))) AS data FROM dist_rating
    UNION ALL
    SELECT 'atraso' AS _type, TO_JSON_STRING(ARRAY_AGG(STRUCT(faixa, pct))) AS data FROM dist_atraso
    UNION ALL
    SELECT 'evolucao' AS _type, TO_JSON_STRING(ARRAY_AGG(STRUCT(mes, inadimplencia_pct, over_90_pct, ltv_medio, elegibilidade_pct, pdd_sobre_saldo_pct) ORDER BY mes)) AS data FROM evolucao
  `;

  const bq = getBigQueryClient();
  const [rows] = await bq.query({ query: sql, params: { startDate, endDate }, maximumBytesBilled: String(maxBytesBilled()) });

  if (!rows || rows.length === 0) return null;

  const byType = Object.fromEntries(
    rows.map((r: { _type: string; data: string }) => [r._type, JSON.parse(r.data)]),
  );

  const r = byType.resumo;
  if (!r) return null;

  return {
    resumo: {
      inadimplencia_pct: { p25: r.inad_p25, p50: r.inad_p50, p75: r.inad_p75, media: r.inadimplencia_media },
      over_90_pct: { p25: r.over90_p25, p50: r.over90_p50, p75: r.over90_p75, media: r.over_90_media },
      ltv: { p25: r.ltv_p25, p50: r.ltv_p50, p75: r.ltv_p75, media: r.ltv_media },
      elegibilidade_pct: r.elegibilidade_pct,
      pdd_sobre_saldo_pct: r.pdd_sobre_saldo_pct,
      pdd_bacen_media: r.pdd_bacen_media,
      pdd_liquid_media: r.pdd_liquid_media,
      delta_pdd_media: r.delta_pdd_media,
    },
    distribuicao_rating: byType.rating ?? [],
    distribuicao_atraso: byType.atraso ?? [],
    evolucao_mensal: byType.evolucao ?? [],
  };
}
