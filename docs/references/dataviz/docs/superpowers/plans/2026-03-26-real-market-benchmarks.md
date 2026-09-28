# Real Market Benchmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `get-market-benchmarks` AI tool with real aggregated cross-client data from BigQuery, anonymized with percentiles and temporal evolution.

**Architecture:** New query builder creates UNION ALL across all client datasets with per-client schema resolution. A shared cache module orchestrates client loading, query execution, and 1h TTL caching. The tool becomes a factory function for ToolContext access. A thin API endpoint exposes the same data for future consumers.

**Tech Stack:** BigQuery (APPROX_QUANTILES, UNION ALL), Next.js API routes, Firebase Admin (auth + Firestore), Zod, Vercel AI SDK `tool()`.

**Spec:** `docs/superpowers/specs/2026-03-26-real-market-benchmarks-design.md`

**Note:** This project has no automated test infrastructure. Verification uses `pnpm build` (type checking) and manual functional testing via the AI chat sidebar.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/lib/bigquery/queries.ts` | Modify | Add `queryBenchmarkAggregated()` function |
| `src/shared/lib/bigquery/benchmark-cache.ts` | Create | Cache + orchestration: load clients, call query, cache results |
| `app/api/benchmark/route.ts` | Create | POST endpoint — auth + thin wrapper over benchmark-cache |
| `src/features/ai-agents/tools/get-market-benchmarks.ts` | Rewrite | Factory function calling benchmark-cache directly |
| `src/features/ai-agents/agents/external-agent.ts` | Modify | Use factory `createGetMarketBenchmarksTool(toolCtx)` |
| `src/features/canvas-orchestrator/tools/analyze.ts` | Modify | Use factory pattern for get-market-benchmarks |
| `src/shared/config/agents/external-agent.ts` | Modify | Update prompt to reference new benchmark capabilities |

---

### Task 1: Query Builder — `queryBenchmarkAggregated()`

**Files:**
- Modify: `src/shared/lib/bigquery/queries.ts` (append new function at end of file)

**Reference:**
- `src/shared/lib/bigquery/schema-resolver.ts` — `resolveColumn()`, `hasField()`, `col()` pattern
- `src/shared/lib/bigquery/client.ts` — `formatTableRef()`, `getBigQueryClient()`

- [ ] **Step 1: Add imports and define types**

First, add `hasField` to the existing import from `schema-resolver.ts` at the top of `queries.ts`:

```typescript
// Find the existing import line:
// import { resolveColumn, safeColumnName } from './schema-resolver';
// Change to:
import { resolveColumn, safeColumnName, hasField } from './schema-resolver';
```

Also add the `ClientSchema` type import:

```typescript
import type { ClientSchema } from '@/features/admin/model/types';
```

Then add at the end of `queries.ts`:

```typescript
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
```

- [ ] **Step 2: Build the UNION ALL generation logic**

```typescript
const BENCHMARK_FIELDS = [
  'saldo_devedor', 'valor_atraso', 'valor_over_90', 'ltv',
  'rating_liquid', 'elegibilidade', 'pdd_liquid', 'pdd_minimo_bacen',
  'categoria_inadimplencia', 'data_base_report',
] as const;

export async function queryBenchmarkAggregated(
  clients: BenchmarkClient[],
  startDate: string,
  endDate: string,
): Promise<BenchmarkResult | null> {
  // Filter clients that support all required columns
  const eligible = clients.filter(({ schema }) =>
    BENCHMARK_FIELDS.every((f) => hasField(schema, 'contratos', f)),
  );

  if (eligible.length === 0) return null;

  const arms = eligible.map(({ dataset, schema }) => {
    const fields = BENCHMARK_FIELDS.map((f) => {
      const resolved = resolveColumn(schema, 'contratos', f);
      if (resolved === f) return f;
      return `${resolved} AS ${f}`;
    }).join(', ');
    const dateCol = resolveColumn(schema, 'contratos', 'data_base_report') ?? 'data_base_report';
    return `SELECT ${fields} FROM ${formatTableRef(dataset, 'contratos')} WHERE ${dateCol} BETWEEN '${startDate}' AND '${endDate}'`;
  });

  const unionSql = arms.join('\n    UNION ALL\n    ');
```

- [ ] **Step 3: Build the full SQL with CTEs**

Continue inside the function:

```typescript
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
```

- [ ] **Step 4: Execute and parse results**

```typescript
  const bq = getBigQueryClient();
  const [rows] = await bq.query({ query: sql });

  if (!rows || rows.length === 0) return null;

  const byType = Object.fromEntries(
    rows.map((r: { _type: string; data: string }) => [r._type, JSON.parse(r.data)]),
  );

  const r = byType.resumo;
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
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/bigquery/queries.ts
git commit -m "feat(benchmark): add queryBenchmarkAggregated cross-client query builder"
```

---

### Task 2: Benchmark Cache Module

**Files:**
- Create: `src/shared/lib/bigquery/benchmark-cache.ts`

**Reference:**
- `app/api/bigquery/route.ts` — Firestore client loading pattern
- `src/shared/lib/bigquery/queries.ts` — `queryBenchmarkAggregated()` from Task 1

- [ ] **Step 1: Create the cache module**

```typescript
import { getFirestore } from 'firebase-admin/firestore';
import { FIRESTORE_DATABASE_ID } from '@/shared/lib/runtime-config';
import { queryBenchmarkAggregated, type BenchmarkClient, type BenchmarkResult } from './queries';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: BenchmarkResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(start: string, end: string): string {
  return `${start}:${end}`;
}

async function loadAllClients(): Promise<BenchmarkClient[]> {
  const db = FIRESTORE_DATABASE_ID ? getFirestore(FIRESTORE_DATABASE_ID) : getFirestore();
  const snap = await db.collection('clients').get();
  return snap.docs
    .map((doc) => doc.data())
    .filter((d) => d.dataset && d.schema)
    .map((d) => ({ dataset: d.dataset as string, schema: d.schema }));
}

export async function getBenchmarkData(
  startDate: string,
  endDate: string,
): Promise<{ data: BenchmarkResult | null; cached: boolean }> {
  const key = getCacheKey(startDate, endDate);
  const entry = cache.get(key);

  if (entry && Date.now() < entry.expiresAt) {
    return { data: entry.data, cached: true };
  }

  const clients = await loadAllClients();
  if (clients.length === 0) {
    return { data: null, cached: false };
  }

  const result = await queryBenchmarkAggregated(clients, startDate, endDate);

  if (result) {
    cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return { data: result, cached: false };
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/bigquery/benchmark-cache.ts
git commit -m "feat(benchmark): add benchmark cache module with Firestore client loading"
```

---

### Task 3: API Endpoint — `/api/benchmark`

**Files:**
- Create: `app/api/benchmark/route.ts`

**Reference:**
- `app/api/bigquery/route.ts` — Auth pattern (`verifyAuth`, Firebase init)

- [ ] **Step 1: Create the API route**

Mirror the Firebase Admin initialization and auth pattern from `app/api/bigquery/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { DEV_BYPASS_EMAIL, isDevAuthBypassEnabled } from '@/shared/lib/runtime-config';
import { getBenchmarkData } from '@/shared/lib/bigquery/benchmark-cache';

// Firebase Admin init — same pattern as app/api/bigquery/route.ts
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    initializeApp();
  }
}

async function verifyAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return isDevAuthBypassEnabled() ? DEV_BYPASS_EMAIL : null;
  }
  try {
    const token = authHeader.slice(7);
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.email ?? null;
  } catch {
    return isDevAuthBypassEnabled() ? DEV_BYPASS_EMAIL : null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await verifyAuth(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { dateRange } = body;

    if (!dateRange?.start || !dateRange?.end) {
      return NextResponse.json(
        { error: 'dateRange with start and end is required' },
        { status: 400 },
      );
    }

    const { data, cached } = await getBenchmarkData(dateRange.start, dateRange.end);

    if (!data) {
      return NextResponse.json(
        { error: 'No benchmark data available' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      periodo: dateRange,
      ...data,
      fonte: 'Agregado anonimizado de carteiras Liquid',
      cached,
    });
  } catch (err) {
    console.error('[/api/benchmark] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/benchmark/route.ts
git commit -m "feat(benchmark): add /api/benchmark POST endpoint"
```

---

### Task 4: Rewrite `get-market-benchmarks` Tool

**Files:**
- Rewrite: `src/features/ai-agents/tools/get-market-benchmarks.ts`

**Reference:**
- `src/features/ai-agents/tools/tool-context.ts` — ToolContext interface
- `src/shared/lib/bigquery/benchmark-cache.ts` — `getBenchmarkData()` from Task 2

- [ ] **Step 1: Rewrite the tool as a factory function**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './tool-context';
import { getBenchmarkData } from '@/shared/lib/bigquery/benchmark-cache';
import type { BenchmarkResult } from '@/shared/lib/bigquery/queries';

const STATIC_FALLBACK = {
  cri: {
    inadimplencia_media: '2-4%',
    over90_media: '1-3%',
    ltv_medio: '50-65%',
    rating_predominante: 'A-C',
    spread_cdi: '1.5-3.0% a.a.',
  },
  geral: {
    inadimplencia_saudavel: '< 3%',
    over90_saudavel: '< 2%',
    ltv_saudavel: '< 60%',
    elegibilidade_saudavel: '> 90%',
    pdd_sobre_saldo_saudavel: '< 2%',
  },
};

const METRICAS_ENUM = z.enum([
  'inadimplencia', 'over_90', 'ltv', 'elegibilidade',
  'pdd', 'rating', 'atraso', 'evolucao',
]);

function filterResult(
  result: BenchmarkResult,
  metricas?: z.infer<typeof METRICAS_ENUM>[],
) {
  if (!metricas || metricas.length === 0) return result;

  const s = new Set(metricas);
  return {
    resumo: {
      ...(s.has('inadimplencia') ? { inadimplencia_pct: result.resumo.inadimplencia_pct } : {}),
      ...(s.has('over_90') ? { over_90_pct: result.resumo.over_90_pct } : {}),
      ...(s.has('ltv') ? { ltv: result.resumo.ltv } : {}),
      ...(s.has('elegibilidade') ? { elegibilidade_pct: result.resumo.elegibilidade_pct } : {}),
      ...(s.has('pdd') ? {
        pdd_sobre_saldo_pct: result.resumo.pdd_sobre_saldo_pct,
        pdd_bacen_media: result.resumo.pdd_bacen_media,
        pdd_liquid_media: result.resumo.pdd_liquid_media,
        delta_pdd_media: result.resumo.delta_pdd_media,
      } : {}),
    },
    ...(s.has('rating') ? { distribuicao_rating: result.distribuicao_rating } : {}),
    ...(s.has('atraso') ? { distribuicao_atraso: result.distribuicao_atraso } : {}),
    ...(s.has('evolucao') ? { evolucao_mensal: result.evolucao_mensal } : {}),
  };
}

export function createGetMarketBenchmarksTool(ctx: ToolContext) {
  return tool({
    description:
      'Retorna benchmarks reais agregados e anonimizados de todas as carteiras Liquid. ' +
      'Inclui percentis (P25, P50, P75), distribuições de rating e atraso, e evolução mensal. ' +
      'Use para comparar métricas da carteira atual com o mercado Liquid.',
    inputSchema: z.object({
      metricas: z.array(METRICAS_ENUM).optional().describe(
        'Métricas específicas a retornar. Se omitido, retorna todas.',
      ),
    }),
    execute: async ({ metricas }) => {
      try {
        const dateRange = ctx.filters?.dateRange;
        if (!dateRange?.start || !dateRange?.end) {
          return {
            success: false,
            error: 'dateRange não disponível no contexto.',
            fonte: 'fallback_estatico',
            benchmarks: STATIC_FALLBACK.geral,
          };
        }

        const { data, cached } = await getBenchmarkData(dateRange.start, dateRange.end);

        if (!data) {
          return {
            success: true,
            fonte: 'fallback_estatico',
            nota: 'Dados reais indisponíveis. Valores de referência estáticos.',
            benchmarks: STATIC_FALLBACK.cri,
          };
        }

        const filtered = filterResult(data, metricas);

        return {
          success: true,
          periodo: { start: dateRange.start, end: dateRange.end },
          ...filtered,
          fonte: 'Agregado anonimizado de carteiras Liquid',
          cached,
        };
      } catch (err) {
        console.error('[get_market_benchmarks] Error:', err);
        return {
          success: true,
          fonte: 'fallback_estatico',
          nota: 'Erro ao buscar dados reais. Valores de referência estáticos.',
          benchmarks: STATIC_FALLBACK.cri,
        };
      }
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build FAILS — `external-agent.ts` and `analyze.ts` still import the old `getMarketBenchmarksTool` export.

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/get-market-benchmarks.ts
git commit -m "feat(benchmark): rewrite get-market-benchmarks as factory with real data"
```

---

### Task 5: Update Consumers — External Agent + Canvas Orchestrator

**Files:**
- Modify: `src/features/ai-agents/agents/external-agent.ts`
- Modify: `src/features/canvas-orchestrator/tools/analyze.ts`

- [ ] **Step 1: Update external-agent.ts**

Change import and tool registration:

```typescript
// Before:
// import { getMarketBenchmarksTool } from '../tools/get-market-benchmarks';
// After:
import { createGetMarketBenchmarksTool } from '../tools/get-market-benchmarks';
```

In the tools object:

```typescript
// Before:
// get_market_benchmarks: getMarketBenchmarksTool,
// After:
get_market_benchmarks: createGetMarketBenchmarksTool(toolCtx),
```

- [ ] **Step 2: Update canvas-orchestrator/tools/analyze.ts**

Change import:

```typescript
// Before:
// import { getMarketBenchmarksTool } from '@/features/ai-agents/tools/get-market-benchmarks';
// After:
import { createGetMarketBenchmarksTool } from '@/features/ai-agents/tools/get-market-benchmarks';
```

In the `'external'` case, update usage. Note: `analyze.ts` already has a `toolCtx` variable in the same scope (check context). Replace:

```typescript
// Before:
// get_market_benchmarks: getMarketBenchmarksTool,
// After:
get_market_benchmarks: createGetMarketBenchmarksTool(toolCtx),
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds — all references now use factory pattern.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/agents/external-agent.ts src/features/canvas-orchestrator/tools/analyze.ts
git commit -m "feat(benchmark): update consumers to use factory pattern"
```

---

### Task 6: Update External Agent Prompt

**Files:**
- Modify: `src/shared/config/agents/external-agent.ts`

- [ ] **Step 1: Update the prompt to reference new benchmark capabilities**

In `buildExternalAgentPrompt`, add guidance about the new benchmark tool. Locate the tool documentation section and update the `get_market_benchmarks` entry:

```
### get_market_benchmarks

Retorna benchmarks **reais** agregados e anonimizados de todas as carteiras gerenciadas na plataforma Liquid.

**Dados disponíveis:**
- Resumo com percentis (P25, P50, P75) e média: inadimplência %, over 90 %, LTV
- Métricas pontuais: elegibilidade %, PDD/saldo %, PDD Bacen vs Liquid, delta PDD
- Distribuição de rating (A-H) com % de cada faixa
- Distribuição por faixa de atraso com % de cada faixa
- Evolução mensal de todas as métricas no período selecionado

**Como usar para comparações:**
- Compare a métrica da carteira atual com o P50 (mediana) do benchmark
- Se a carteira está acima do P75, está no quartil superior (pior) do mercado
- Se está abaixo do P25, está no quartil inferior (melhor) do mercado
- Cruze com get_bcb_indicator para contextualizar com cenário macroeconômico
- Use o parâmetro `metricas` para pedir apenas o que precisa (reduz payload)

**Exemplo:** "A inadimplência da carteira é 3.2%, enquanto a mediana do mercado Liquid é 2.5% (P50). Isso posiciona a carteira no quartil superior, acima de 75% das carteiras."
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/external-agent.ts
git commit -m "feat(benchmark): update external agent prompt with benchmark guidance"
```

---

### Task 7: Functional Verification

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test /api/benchmark endpoint directly**

Using curl or the browser console, test the endpoint with a valid dateRange:

```bash
curl -X POST http://localhost:3000/api/benchmark \
  -H "Content-Type: application/json" \
  -d '{"dateRange":{"start":"2025-01-01","end":"2025-12-31"}}'
```

Expected: JSON response with `success: true`, real aggregated data, `fonte: 'Agregado anonimizado de carteiras Liquid'`.

- [ ] **Step 3: Test via AI chat sidebar**

Open the app, navigate to any client dashboard, open the AI sidebar, and ask:

> "Compare a inadimplência da carteira com o benchmark de mercado"

Expected: The external agent calls `get_market_benchmarks`, receives real data, and provides a comparison with percentiles.

- [ ] **Step 4: Test cache behavior**

Repeat step 2. Second call should return `cached: true`.

- [ ] **Step 5: Test fallback**

Temporarily break the BigQuery connection (e.g., invalid credentials) and verify the tool returns `fonte: 'fallback_estatico'` with hardcoded values.

- [ ] **Step 6: Final build check**

Run: `pnpm build`
Expected: Production build succeeds with no errors.
