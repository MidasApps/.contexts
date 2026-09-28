# Real Market Benchmarks — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Replace hardcoded `get-market-benchmarks` tool with real aggregated data from all client portfolios, anonymized.

## Context

The `get-market-benchmarks` AI tool currently returns hardcoded market reference values (e.g., "inadimplência média: 2-4%"). These are static and disconnected from the actual portfolios managed on the platform.

The Liquid platform manages multiple client datasets (OM, BRZ, CONX, IMCASA) in BigQuery. By aggregating metrics across all clients anonymously, we can produce real, dynamic benchmarks that reflect the actual state of the portfolios — without revealing any client-specific information.

## Requirements

- Any authenticated user can access benchmarks (no per-client restriction)
- No minimum number of clients required to publish aggregates
- All data fully anonymized — no client identifiers in queries or results
- Metrics: complete set with percentiles (P25, P50, P75) and temporal evolution
- Date range: dynamic, respects the user's active dateRange filter
- Performance: cache server-side with 1h TTL; first hit ≤ 5s

## Architecture

### 1. Query Builder — `queryBenchmarkAggregated()`

New function in `src/shared/lib/bigquery/queries.ts`.

**Inputs:**
- `clients`: Array of `{ dataset: string, schema: ClientSchema }` (all clients from Firestore)
- `dateRange`: `{ start: string, end: string }`

**UNION ALL generation — per-client schema resolution:**

Each client may have different physical column names. The query builder iterates all clients, resolves column names via `col()` (from `schema-resolver.ts`), and aliases them to canonical names. Clients missing required columns (where `resolveColumn()` returns `null`) are excluded from the UNION.

```typescript
const BENCHMARK_FIELDS = [
  'saldo_devedor', 'valor_atraso', 'valor_over_90', 'ltv',
  'rating_liquid', 'elegibilidade', 'pdd_liquid', 'pdd_minimo_bacen',
  'categoria_inadimplencia', 'data_base_report',
] as const;

const arms = clients
  .filter(({ schema }) => {
    // Only include clients whose schema supports all required columns
    return BENCHMARK_FIELDS.every(f => resolveColumn(schema, 'contratos', f) !== null);
  })
  .map(({ dataset, schema }) => {
    const fields = BENCHMARK_FIELDS.map(f => {
      const resolved = col(schema, 'contratos', f);
      return `${resolved} AS ${f}`;
    }).join(', ');
    return `SELECT ${fields} FROM \`${formatTableRef(dataset, 'contratos')}\` WHERE data_base_report BETWEEN '${start}' AND '${end}'`;
  });
const unionSql = arms.join('\n  UNION ALL\n  ');
```

**SQL structure (after UNION ALL):**

```sql
WITH all_contracts AS (
  ${unionSql}
),
resumo AS (
  SELECT
    SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_pct,
    SAFE_DIVIDE(SUM(valor_over_90), SUM(saldo_devedor)) * 100 AS over_90_pct,
    AVG(ltv) * 100 AS ltv_medio,
    SAFE_DIVIDE(COUNTIF(elegibilidade IN ('Elegivel','Elegível')), COUNT(*)) * 100 AS elegibilidade_pct,
    SAFE_DIVIDE(SUM(pdd_liquid), SUM(saldo_devedor)) * 100 AS pdd_sobre_saldo_pct,
    AVG(pdd_minimo_bacen) AS pdd_bacen_media,
    AVG(pdd_liquid) AS pdd_liquid_media,
    AVG(pdd_liquid - pdd_minimo_bacen) AS delta_pdd_media,
    APPROX_QUANTILES(ltv * 100, 4)[OFFSET(1)] AS ltv_p25,
    APPROX_QUANTILES(ltv * 100, 4)[OFFSET(2)] AS ltv_p50,
    APPROX_QUANTILES(ltv * 100, 4)[OFFSET(3)] AS ltv_p75,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(1)] AS inad_p25,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(2)] AS inad_p50,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_atraso, saldo_devedor) * 100, 4)[OFFSET(3)] AS inad_p75,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(1)] AS over90_p25,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(2)] AS over90_p50,
    APPROX_QUANTILES(SAFE_DIVIDE(valor_over_90, saldo_devedor) * 100, 4)[OFFSET(3)] AS over90_p75
  FROM all_contracts
),
distribuicao_rating AS (
  SELECT rating_liquid AS rating, COUNT(*) AS cnt,
    SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100 AS pct
  FROM all_contracts GROUP BY rating_liquid
),
distribuicao_atraso AS (
  SELECT categoria_inadimplencia AS faixa, COUNT(*) AS cnt,
    SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100 AS pct
  FROM all_contracts GROUP BY categoria_inadimplencia
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
```

Uses `resolveColumn()` per client schema to handle column name differences in the UNION ALL.

### 2. API Endpoint — `/api/benchmark`

New route at `app/api/benchmark/route.ts`.

**POST** with body `{ dateRange: { start, end } }` and Firebase auth token in header.

**Flow:**
1. Validate Firebase auth token (same as `/api/bigquery`)
2. Check cache: `Map<string, { data, expiresAt }>` keyed by `${start}:${end}`, TTL 1h
3. If cache hit → return cached data
4. Load all clients from Firestore, filtering to only those with valid `dataset` and `schema` fields: `snap.docs.filter(d => d.data().dataset && d.data().schema)`
5. Call `queryBenchmarkAggregated()` with valid clients and dateRange
6. Store in cache, return result

**No `canAccessDataset` check** — endpoint is open to any authenticated user. No client-specific data is exposed.

**Cache:** Simple in-memory `Map`. No eviction strategy needed — finite set of dateRange combinations from the app's global filter. TTL 1h. Note: if a new client is onboarded, cached entries become stale until TTL expires. Acceptable given the 1h window.

**Query style:** Uses string interpolation for date range values (consistent with existing `buildFilterClause` pattern in the codebase), not BigQuery parameterized queries. Date values are validated upstream.

### 3. Tool Refactor — `get-market-benchmarks`

Replace `src/features/ai-agents/tools/get-market-benchmarks.ts`.

The tool changes from a plain `tool()` export to a **factory function** `createGetMarketBenchmarksTool(ctx: ToolContext)` to access `ToolContext.filters.dateRange`. This follows the established pattern used by `createExecuteSqlTool`, `createCalculateHhiTool`, etc.

**New input schema:**
```typescript
z.object({
  metricas: z.array(z.enum([
    'inadimplencia', 'over_90', 'ltv', 'elegibilidade',
    'pdd', 'rating', 'atraso', 'evolucao'
  ])).optional().describe('Métricas específicas. Se omitido, retorna todas.'),
})
```

`dateRange` is extracted from `ToolContext.filters` — not passed by the agent.

**Execute:** Calls `queryBenchmarkAggregated()` directly (not via HTTP fetch), with caching logic co-located in a shared module. This avoids the anti-pattern of self-referencing `fetch()` in server-side Next.js code. The `/api/benchmark` endpoint exists as a thin wrapper over the same function for potential future frontend consumers.

**Return structure:**
```typescript
{
  success: true,
  periodo: { start: string, end: string },
  resumo: {
    inadimplencia_pct: { p25, p50, p75, media },
    over_90_pct: { p25, p50, p75, media },
    ltv: { p25, p50, p75, media },
    elegibilidade_pct: number,
    pdd_sobre_saldo_pct: number,
    pdd_bacen_media: number,
    pdd_liquid_media: number,
    delta_pdd_media: number,
  },
  distribuicao_rating: Array<{ rating: string, pct: number }>,
  distribuicao_atraso: Array<{ faixa: string, pct: number }>,
  evolucao_mensal: Array<{ mes: string, inadimplencia_pct, over_90_pct, ltv_medio, elegibilidade_pct, pdd_sobre_saldo_pct }>,
  fonte: 'Agregado anonimizado de carteiras Liquid',
  cached: boolean,
}
```

**Fallback:** If the `/api/benchmark` call fails, return current hardcoded values with `fonte: 'fallback_estatico'`.

### 4. Integration

**ToolContext:** No changes to `tool-context.ts`. The tool reads `filters.dateRange` from the existing context.

**External Agent:** `external-agent.ts` changes to use the factory pattern:
```typescript
// Before: get_market_benchmarks: getMarketBenchmarksTool,
// After:  get_market_benchmarks: createGetMarketBenchmarksTool(toolCtx),
```

**Canvas Orchestrator:** `src/features/canvas-orchestrator/tools/analyze.ts` also imports this tool and needs the same factory update.

**External Agent Prompt:** Update `buildExternalAgentPrompt` to instruct the agent to:
- Use `get_market_benchmarks` for comparing portfolio metrics against the aggregated benchmark
- Interpret percentiles contextually (e.g., "above median means worse than 50% of the market")
- Cross-reference with `get_bcb_indicator` for macro context

### 5. Performance

- **Query cost:** UNION ALL over ~4 datasets × ~50k contracts = ~200k rows. Lightweight aggregations. Estimated < 3s, negligible BigQuery cost.
- **Cache:** Server-side Map with 1h TTL per dateRange key. No frontend cache (tool is called by AI agent, not UI hooks).
- **Rate limiting:** Not needed — agent has `maxSteps: 5`, cache absorbs repeated calls.

## Files Changed

| File | Change |
|------|--------|
| `src/shared/lib/bigquery/queries.ts` | Add `queryBenchmarkAggregated()` |
| `src/shared/lib/bigquery/benchmark-cache.ts` | New — shared cache + orchestration (loads clients, calls query, caches) |
| `app/api/benchmark/route.ts` | New endpoint (POST) — thin wrapper over benchmark-cache |
| `src/features/ai-agents/tools/get-market-benchmarks.ts` | Rewrite: factory function with real data, calls benchmark-cache directly |
| `src/features/ai-agents/agents/external-agent.ts` | Update to use `createGetMarketBenchmarksTool(toolCtx)` factory |
| `src/features/canvas-orchestrator/tools/analyze.ts` | Update to use factory pattern |
| `src/shared/config/agents/external-agent.ts` | Update external agent prompt |

## Security & Privacy

- No client identifiers in UNION ALL queries or results
- No `id_contrato`, `projeto`, or any granular field in output
- Only aggregate statistics (sums, averages, percentiles, distributions)
- Authentication required (Firebase token)
- No per-client access control needed (data is already anonymized by aggregation)
