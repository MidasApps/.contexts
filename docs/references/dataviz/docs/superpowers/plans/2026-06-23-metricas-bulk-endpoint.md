# Endpoint semântico bulk de métricas (G9-B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver N métricas de uma página numa única chamada (`POST /api/metrics/batch`), fazendo o trabalho compartilhável (bindings, metrics, relations, DataSource, access-check) uma vez, e ligar o `useReportData` nele (N→1).

**Architecture:** Extrai o núcleo de execução por-métrica do route 1-a-1 para `src/shared/lib/metrics/execute-metric.ts` (`executeMetric` + `loadClientBindings` + caches), retornando um `MetricExecResult` discriminado. O route bulk carrega os recursos uma vez e fan-out `executeMetric` (queries BQ em paralelo); o route 1-a-1 vira wrapper fino sobre o mesmo núcleo; o `useReportData` faz 1 chamada bulk.

**Tech Stack:** TypeScript, Next.js App Router, Zod, Vitest (happy-dom p/ hook, node p/ rotas), firebase-admin/Firestore, BigQuery.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor, commit por task.
- **Falha parcial → resultados por métrica @ HTTP 200**: o bulk sempre responde 200 quando autenticado; cada `results[metricId]` é `{ ok:true }` ou `{ ok:false }`. Só falta de token é 401 no topo. Cliente ausente/sem `productBindings` é erro de topo (404/422) — afeta o batch inteiro.
- **Mensagens de erro seguras**: erro inesperado (BQ/Firestore) → mensagem genérica, sem vazar SQL/topologia. `MetricResolutionError` (refs semânticas `entity.attr`) e nomes de contrato/dataset-id são OK.
- **Comportamento do 1-a-1 preservado**: os testes de `app/api/metrics/[id]/data/route.test.ts` devem ficar verdes após o refator (mesmos status/mensagens/`missing`).
- **`useReportData`**: falha por-métrica vira rows vazias + `console.error` (sem derrubar a página) — comportamento atual mantido.
- Cap do batch: `metricIds` 1..50.
- Spec: `docs/superpowers/specs/2026-06-23-metricas-bulk-endpoint-design.md`.

## File Structure

- `src/shared/lib/metrics/execute-metric.ts` — **criar**: núcleo `server-only` (`MetricExecResult`, `MetricExecCaches`, `newMetricExecCaches`, `loadClientBindings`, `executeMetric`). (Task 1)
- `src/shared/lib/metrics/__tests__/execute-metric.test.ts` — **criar**: unit tests do núcleo. (Task 1)
- `app/api/metrics/[id]/data/route.ts` — **modificar**: delega ao núcleo. (Task 1)
- `app/api/metrics/batch/route.ts` — **criar**: route bulk. (Task 2)
- `app/api/metrics/batch/__tests__/route.test.ts` — **criar**: route tests. (Task 2)
- `src/shared/hooks/useReportData.ts` — **modificar**: 1 chamada bulk. (Task 3)
- `src/shared/hooks/__tests__/useReportData.test.ts` — **modificar**: mock bulk + N→1 + falha parcial. (Task 3)

---

## Task 1: Núcleo `execute-metric.ts` + delega o route 1-a-1

Extrai a orquestração por-métrica (~250 linhas hoje inline em `app/api/metrics/[id]/data/route.ts`) para um módulo reutilizável e religa o route a ele. Deliverable único: o módulo (com unit tests) + o 1-a-1 delegando (testes existentes verdes).

**Files:**
- Create: `src/shared/lib/metrics/execute-metric.ts`
- Create: `src/shared/lib/metrics/__tests__/execute-metric.test.ts`
- Modify: `app/api/metrics/[id]/data/route.ts`

**Interfaces:**
- Produces:
  - `type MetricExecResult = { ok:true; metricId:string; data:unknown[]; sql:string; outputColumns:string[] } | { ok:false; metricId:string; status:number; error:string; missing?:CoverageGap[] }`
  - `interface MetricExecCaches { dataSources: Map<string, DataSource|null>; accessChecked: Map<string, AccessResult> }`
  - `function newMetricExecCaches(): MetricExecCaches`
  - `function loadClientBindings(clientId:string): Promise<{ok:true; bindings:ClientProductBinding[]} | {ok:false; status:number; error:string}>`
  - `function executeMetric(args:{ metric:Metric; parsedBindings:ClientProductBinding[]; clientId:string; productId?:string; email:string; relations:Relation[]; pageFilters?:Record<string,PageFilterValue>; caches:MetricExecCaches }): Promise<MetricExecResult>`
- Consumes (inalterados): `resolveMetric`/`resolveDerivedMetric`/`MetricResolutionError`/`PageFilterValue` de `@/shared/lib/metrics/resolve-metric`; `getDataSource`; `verifyDatasetAccess`; `getBigQueryClientFor`; `flattenLegacyBinding`; `collectBindingGaps`/`CoverageGap`.

- [ ] **Step 1: Write the failing unit test** — criar `src/shared/lib/metrics/__tests__/execute-metric.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  access: vi.fn(),
  getDS: vi.fn(),
  bqQuery: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('@/shared/lib/api-auth', () => ({
  verifyDatasetAccess: (...a: unknown[]) => h.access(...a),
  verifyAuthToken: vi.fn(),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({
  getDataSource: (...a: unknown[]) => h.getDS(...a),
}));
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClientFor: vi.fn(async () => ({ query: h.bqQuery })),
}));
vi.mock('@/shared/lib/metrics/resolve-metric', () => ({
  resolveMetric: (...a: unknown[]) => h.resolve(...a),
  resolveDerivedMetric: vi.fn(),
  MetricResolutionError: class MetricResolutionError extends Error {},
}));
vi.mock('@/shared/lib/semantic/flatten-binding', () => ({
  flattenLegacyBinding: vi.fn(() => ({})),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ DATAVIZ_DATABASE_ID: 'test-db' }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn() }));

import {
  executeMetric,
  loadClientBindings,
  newMetricExecCaches,
} from '../execute-metric';
import { MetricResolutionError } from '@/shared/lib/metrics/resolve-metric';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metric(over: Record<string, unknown> = {}): any {
  return {
    id: 'm',
    label: 'M',
    requires: ['canonical.carteira.saldo'],
    recipe: {
      kind: 'aggregation',
      primaryEntity: 'carteira',
      aggregation: 'sum',
      valueAttribute: 'carteira.saldo',
      groupByAttributes: [],
      filters: [],
    },
    type: 'kpi',
    version: '1.0.0',
    status: 'active',
    ownerClientId: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binding(datasets?: unknown[]): any {
  return {
    productId: 'play',
    datasets: datasets ?? [
      {
        id: 'ds',
        dataSourceId: 'bq',
        datasetId: 'om_ds',
        contractRef: 'canonical',
        schemaBindings: {},
        schema: {},
        isPrimary: true,
      },
    ],
  };
}

function call(over: Record<string, unknown> = {}) {
  return executeMetric({
    metric: metric(),
    parsedBindings: [binding()],
    clientId: 'om',
    email: 'u@e.com',
    relations: [],
    caches: newMetricExecCaches(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(over as any),
  });
}

beforeEach(() => {
  h.access.mockReset().mockResolvedValue({ allowed: true });
  h.getDS.mockReset().mockResolvedValue({ projectId: 'gcp' });
  h.bqQuery.mockReset().mockResolvedValue([[{ value: 42 }]]);
  h.resolve.mockReset().mockReturnValue({ sql: 'SELECT 1', params: {}, outputColumns: ['value'] });
});

describe('executeMetric', () => {
  it('sucesso (aggregation) → ok:true com data/sql/outputColumns', async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual([{ value: 42 }]);
      expect(r.outputColumns).toEqual(['value']);
      expect(r.metricId).toBe('m');
    }
  });

  it('métrica de outro cliente → ok:false 403', async () => {
    const r = await call({ metric: metric({ ownerClientId: 'outro' }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('nenhum dataset cobre o contrato → ok:false 422', async () => {
    const r = await call({
      parsedBindings: [binding([
        { id: 'd', dataSourceId: 'bq', datasetId: 'x', contractRef: 'outro', schemaBindings: {}, schema: {}, isPrimary: true },
      ])],
    });
    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.error).toBe('Nenhum dataset do cliente cobre o contrato "canonical"');
  });

  it('lacuna de cobertura (G8) → ok:false 422 com missing', async () => {
    const r = await call({
      parsedBindings: [binding([
        { id: 'd', dataSourceId: 'bq', datasetId: 'om_ds', contractRef: 'canonical', schemaBindings: { 'carteira.outra': 'x' }, schema: {}, isPrimary: true },
      ])],
    });
    expect(r).toMatchObject({ ok: false, status: 422 });
    if (!r.ok) expect(r.missing).toEqual([{ ref: 'canonical.carteira.saldo', reason: 'sem-mapping' }]);
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('tenant negado → ok:false 403', async () => {
    h.access.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.bqQuery).not.toHaveBeenCalled();
  });

  it('MetricResolutionError → ok:false 422', async () => {
    h.resolve.mockImplementation(() => { throw new MetricResolutionError('boom'); });
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it('erro inesperado no BQ → ok:false 500 genérico', async () => {
    h.bqQuery.mockRejectedValue(new Error('SELECT ... FROM secret.table'));
    const r = await call();
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).not.toContain('secret');
  });

  it('caches deduplicam access-check e DataSource entre métricas', async () => {
    const caches = newMetricExecCaches();
    await executeMetric({ metric: metric({ id: 'a' }), parsedBindings: [binding()], clientId: 'om', email: 'u', relations: [], caches });
    await executeMetric({ metric: metric({ id: 'b' }), parsedBindings: [binding()], clientId: 'om', email: 'u', relations: [], caches });
    expect(h.access).toHaveBeenCalledTimes(1);
    expect(h.getDS).toHaveBeenCalledTimes(1);
  });
});

describe('loadClientBindings', () => {
  it('ok:true parseando productBindings', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ productBindings: [binding()] }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('om');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindings).toHaveLength(1);
  });

  it('cliente inexistente → ok:false 404', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('x');
    expect(r).toEqual({ ok: false, status: 404, error: 'Cliente "x" não encontrado' });
  });

  it('sem productBindings → ok:false 422', async () => {
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const r = await loadClientBindings('y');
    expect(r).toMatchObject({ ok: false, status: 422 });
  });
});
```

- [ ] **Step 2: Run unit test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: FAIL — `../execute-metric` não existe (erro de import).

- [ ] **Step 3: Write the module** — criar `src/shared/lib/metrics/execute-metric.ts`:

```ts
import 'server-only';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { verifyDatasetAccess } from '@/shared/lib/api-auth';
import { ClientProductBinding, type Metric } from '@/shared/schemas';
import { getDataSource } from '@/shared/repositories/data-source-repo';
import { getBigQueryClientFor } from '@/shared/lib/bigquery/client';
import {
  resolveMetric,
  resolveDerivedMetric,
  MetricResolutionError,
  type PageFilterValue,
} from '@/shared/lib/metrics/resolve-metric';
import { flattenLegacyBinding } from '@/shared/lib/semantic/flatten-binding';
import { collectBindingGaps, type CoverageGap } from '@/shared/lib/metrics/coverage';
import type { Relation } from '@/shared/schemas/relation';

/**
 * Resultado da execução de UMA métrica. Erros de negócio (cobertura, tenant,
 * propriedade, resolução) nunca lançam: viram `ok:false`. Erros inesperados
 * (BQ/Firestore) viram `ok:false` 500 com mensagem genérica (sem vazar SQL/topologia).
 */
export type MetricExecResult =
  | { ok: true; metricId: string; data: unknown[]; sql: string; outputColumns: string[] }
  | { ok: false; metricId: string; status: number; error: string; missing?: CoverageGap[] };

type DataSourceResult = Awaited<ReturnType<typeof getDataSource>>;
type AccessResult = Awaited<ReturnType<typeof verifyDatasetAccess>>;

/** Recursos compartilhados entre métricas de um mesmo request (dedupe de I/O). */
export interface MetricExecCaches {
  dataSources: Map<string, DataSourceResult>;
  accessChecked: Map<string, AccessResult>;
}

export function newMetricExecCaches(): MetricExecCaches {
  return { dataSources: new Map(), accessChecked: new Map() };
}

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

export type LoadBindingsResult =
  | { ok: true; bindings: ClientProductBinding[] }
  | { ok: false; status: number; error: string };

/** Carrega + parseia os productBindings do cliente (uma vez por request). */
export async function loadClientBindings(clientId: string): Promise<LoadBindingsResult> {
  const snap = await firestore().collection('clients').doc(clientId).get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: `Cliente "${clientId}" não encontrado` };
  }
  const data = snap.data() as { productBindings?: unknown };
  const raw = Array.isArray(data.productBindings) ? data.productBindings : [];
  if (raw.length === 0) {
    return { ok: false, status: 422, error: `Cliente "${clientId}" sem productBindings configurado` };
  }
  const bindings = raw
    .map((b) => {
      const r = ClientProductBinding.safeParse(b);
      return r.success ? r.data : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
  return { ok: true, bindings };
}

async function cachedDataSource(caches: MetricExecCaches, id: string): Promise<DataSourceResult> {
  const hit = caches.dataSources.get(id);
  if (hit !== undefined) return hit;
  const src = await getDataSource(id);
  caches.dataSources.set(id, src);
  return src;
}

async function cachedAccess(
  caches: MetricExecCaches,
  email: string,
  datasetId: string,
  clientId: string,
): Promise<AccessResult> {
  const hit = caches.accessChecked.get(datasetId);
  if (hit !== undefined) return hit;
  const ac = await verifyDatasetAccess(email, datasetId, clientId);
  caches.accessChecked.set(datasetId, ac);
  return ac;
}

export interface ExecuteMetricArgs {
  metric: Metric;
  parsedBindings: ClientProductBinding[];
  clientId: string;
  productId?: string;
  email: string;
  /** Relações conhecidas (vazio quando nenhuma métrica é derived). */
  relations: Relation[];
  pageFilters?: Record<string, PageFilterValue>;
  caches: MetricExecCaches;
}

export async function executeMetric(args: ExecuteMetricArgs): Promise<MetricExecResult> {
  const { metric, parsedBindings, clientId, productId, email, relations, pageFilters, caches } = args;
  type DatasetBinding = (typeof parsedBindings)[number]['datasets'][number];

  const fail = (status: number, error: string, missing?: CoverageGap[]): MetricExecResult => ({
    ok: false,
    metricId: metric.id,
    status,
    error,
    ...(missing ? { missing } : {}),
  });
  const okResult = (r: { sql: string; outputColumns: string[] }, rows: unknown[]): MetricExecResult => ({
    ok: true,
    metricId: metric.id,
    data: rows,
    sql: r.sql,
    outputColumns: r.outputColumns,
  });

  // Escopo de propriedade: global (null) visível a todos; de cliente só no próprio.
  const owner = (metric as { ownerClientId?: string | null }).ownerClientId ?? null;
  if (owner !== null && owner !== clientId) {
    return fail(403, 'Métrica pertence a outro cliente');
  }
  if (!metric.recipe) {
    return fail(422, `Métrica "${metric.id}" sem recipe — não é executável`);
  }

  try {
    // ── Recipe derived (cross-contract, multi-binding) ──────────────────────
    if (metric.recipe.kind === 'derived') {
      const recipe = metric.recipe;
      const contractIds = new Set<string>();
      contractIds.add(recipe.primaryEntity.split('.')[0]);
      recipe.terms.forEach((t) => { if (t.valueRef) contractIds.add(t.valueRef.split('.')[0]); });
      (recipe.groupByRefs ?? []).forEach((r) => contractIds.add(r.split('.')[0]));
      (recipe.filters ?? []).forEach((f) => contractIds.add(f.attribute.split('.')[0]));
      if (recipe.timeRef) contractIds.add(recipe.timeRef.split('.')[0]);
      for (const j of recipe.joins) {
        const rel = relations.find((r) => r.id === j.relationId);
        if (!rel) return fail(422, `Relação "${j.relationId}" não encontrada`);
        contractIds.add(rel.leftRef.split('.')[0]);
        contractIds.add(rel.rightRef.split('.')[0]);
      }

      const primaryContractId = recipe.primaryEntity.split('.')[0];
      const bindingsByContract: Record<string, DatasetBinding> = {};
      const projectIdByContract: Record<string, string> = {};
      let bqDataSourceId: string | undefined;

      for (const contractId of contractIds) {
        let found: DatasetBinding | undefined;
        for (const b of parsedBindings) {
          const d = b.datasets.find((ds) => ds.contractRef === contractId);
          if (d) { found = d; break; }
        }
        if (!found) return fail(422, `Cliente não cobre o contrato "${contractId}" exigido pela métrica`);

        const ac = await cachedAccess(caches, email, found.datasetId, clientId);
        if (!ac.allowed) return fail(ac.status ?? 403, ac.error ?? 'Sem permissão');

        const hasFlat = found.schemaBindings && Object.keys(found.schemaBindings).length > 0;
        const resolvedDs = hasFlat ? found : { ...found, schemaBindings: flattenLegacyBinding(found.schema) };

        const src = await cachedDataSource(caches, found.dataSourceId);
        if (!src) return fail(422, `DataSource "${found.dataSourceId}" não encontrada`);

        bindingsByContract[contractId] = resolvedDs;
        projectIdByContract[contractId] = src.projectId;
        if (contractId === primaryContractId) bqDataSourceId = found.dataSourceId;
      }

      if (new Set(Object.values(projectIdByContract)).size > 1) {
        return fail(422, 'Métrica cross-contract exige datasets no mesmo projeto BigQuery');
      }

      const resolved = resolveDerivedMetric({ metric, bindingsByContract, relations, projectIdByContract, pageFilters });
      const bqd = await getBigQueryClientFor(bqDataSourceId ?? bindingsByContract[primaryContractId].dataSourceId);
      const [rows] = await bqd.query({ query: resolved.sql, params: resolved.params });
      return okResult(resolved, rows as unknown[]);
    }

    // ── Recipe single-contract (aggregation | sql) ──────────────────────────
    const metricContractId = metric.requires[0]?.split('.')[0];
    const pickByContract = (b: (typeof parsedBindings)[number]): DatasetBinding | null =>
      metricContractId ? b.datasets.find((d) => d.contractRef === metricContractId) ?? null : null;

    let binding: (typeof parsedBindings)[number] | undefined;
    let dataset: DatasetBinding | null | undefined;
    if (metricContractId) {
      const ordered = productId
        ? [...parsedBindings.filter((b) => b.productId === productId), ...parsedBindings.filter((b) => b.productId !== productId)]
        : parsedBindings;
      for (const b of ordered) {
        const d = pickByContract(b);
        if (d) { binding = b; dataset = d; break; }
      }
      if (!dataset) return fail(422, `Nenhum dataset do cliente cobre o contrato "${metricContractId}"`);
    }

    if (!binding) {
      binding = (productId && parsedBindings.find((b) => b.productId === productId)) || parsedBindings[0];
    }
    if (!binding) return fail(422, 'Cliente sem productBindings utilizáveis');
    if (!dataset) dataset = binding.datasets.find((d) => d.isPrimary) ?? binding.datasets[0];
    if (!dataset) return fail(422, 'Product binding sem dataset');

    const ac = await cachedAccess(caches, email, dataset.datasetId, clientId);
    if (!ac.allowed) return fail(ac.status ?? 403, ac.error ?? 'Sem permissão');

    const hasFlat = dataset.schemaBindings && Object.keys(dataset.schemaBindings).length > 0;
    const resolvedDataset = hasFlat ? dataset : { ...dataset, schemaBindings: flattenLegacyBinding(dataset.schema) };

    if (metricContractId && metric.recipe.kind !== 'sql') {
      const gaps = collectBindingGaps(metric.requires, resolvedDataset, metricContractId);
      if (gaps.length > 0) {
        return fail(422, `Cliente não cobre todos os atributos exigidos pela métrica no contrato "${metricContractId}"`, gaps);
      }
    }

    const source = await cachedDataSource(caches, dataset.dataSourceId);
    if (!source) return fail(422, `DataSource "${dataset.dataSourceId}" não encontrada`);

    const resolved = resolveMetric({ metric, binding: resolvedDataset, projectId: source.projectId, pageFilters });
    const bq = await getBigQueryClientFor(resolvedDataset.dataSourceId);
    const [rows] = await bq.query({ query: resolved.sql, params: resolved.params });
    return okResult(resolved, rows as unknown[]);
  } catch (err) {
    if (err instanceof MetricResolutionError) return fail(422, err.message);
    // Mensagem genérica: ApiError do BQ/Firestore vazaria SQL/topologia.
    return fail(500, 'Erro ao executar métrica');
  }
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Refator o route 1-a-1 para delegar** — substituir o corpo de `app/api/metrics/[id]/data/route.ts` por (mantendo os imports `NextRequest/NextResponse`, `z`, e os schemas Zod `PageFilterValueSchema`/`RequestSchema` existentes):

Trocar o bloco de imports (linhas ~1-17) por:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { Metric } from '@/shared/schemas';
import {
  loadClientBindings,
  executeMetric,
  newMetricExecCaches,
} from '@/shared/lib/metrics/execute-metric';
import type { PageFilterValue } from '@/shared/lib/metrics/resolve-metric';
import type { Relation } from '@/shared/schemas/relation';
```

Manter `function firestore()`, `PageFilterValueSchema`, `RequestSchema` como estão. **Remover** a `interface ClientDoc { ... }` (linhas ~55-58 — não é mais usada; o load do cliente foi para `loadClientBindings`).

Substituir o **segundo** bloco `try { ... } catch (err) { ... }` do `POST` — o que começa no comentário `// 1. Carrega metric.` e termina no `return NextResponse.json({ error: message }, { status: 500 });` final (inclui as próprias linhas `try {`/`} catch`) — pelo bloco abaixo (que já traz seu próprio `try/catch`). NÃO mexer no primeiro try/catch (o do `RequestSchema.parse`):

```ts
  try {
    // Carrega a métrica.
    const metricSnap = await firestore().collection('metrics').doc(metricId).get();
    if (!metricSnap.exists) {
      return NextResponse.json({ error: `Métrica "${metricId}" não encontrada` }, { status: 404 });
    }
    const metric = Metric.parse({ id: metricSnap.id, ...metricSnap.data() });

    // Carrega os bindings do cliente.
    const bindings = await loadClientBindings(body.clientId);
    if (!bindings.ok) {
      return NextResponse.json({ error: bindings.error }, { status: bindings.status });
    }

    // Relations só quando a métrica é derived.
    let relations: Relation[] = [];
    if (metric.recipe?.kind === 'derived') {
      const relSnap = await firestore().collection('relations').get();
      relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
    }

    const result = await executeMetric({
      metric,
      parsedBindings: bindings.bindings,
      clientId: body.clientId,
      productId: body.productId,
      email,
      relations,
      pageFilters: body.pageFilters as Record<string, PageFilterValue> | undefined,
      caches: newMetricExecCaches(),
    });

    if (result.ok) {
      return NextResponse.json({ data: result.data, sql: result.sql, outputColumns: result.outputColumns });
    }
    return NextResponse.json(
      { error: result.error, ...(result.missing ? { missing: result.missing } : {}) },
      { status: result.status },
    );
  } catch (err) {
    console.error('[Metric Data API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
```

- [ ] **Step 6: Run the 1-a-1 route test (must stay green)**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: PASS (todos os describes: multi-tenant, coverage A5, derived R2, escopo de propriedade, coverage sql G4). Se algo falhar, ajustar o mapeamento no núcleo/route para preservar status/mensagem/`missing` exatos.

- [ ] **Step 7: Verify no regression + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/execute-metric.ts src/shared/lib/metrics/__tests__/execute-metric.test.ts "app/api/metrics/[id]/data/route.ts"
git commit -m "refactor(metrics): extrai executeMetric/loadClientBindings; 1-a-1 delega ao núcleo (G9-B)"
```

---

## Task 2: Route bulk `POST /api/metrics/batch`

**Files:**
- Create: `app/api/metrics/batch/route.ts`
- Create: `app/api/metrics/batch/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `loadClientBindings`, `executeMetric`, `newMetricExecCaches`, `MetricExecResult` (Task 1).
- Produces: `POST /api/metrics/batch` → 200 `{ results: Record<metricId, MetricExecResult> }`.

- [ ] **Step 1: Write the failing route test** — criar `app/api/metrics/batch/__tests__/route.test.ts`:

```ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  loadBindings: vi.fn(),
  execMetric: vi.fn(),
  getAll: vi.fn(),
  relationsGet: vi.fn(async () => ({ docs: [] as unknown[] })),
}));

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: (...a: unknown[]) => h.verifyAuth(...a) }));
vi.mock('@/shared/lib/runtime-config', () => ({ DATAVIZ_DATABASE_ID: 'test-db' }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({ doc: (id: string) => ({ id }), get: (...a: unknown[]) => h.relationsGet(...a) }),
    getAll: (...refs: Array<{ id: string }>) => h.getAll(refs),
  }),
}));
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: (...a: unknown[]) => h.loadBindings(...a),
  executeMetric: (...a: unknown[]) => h.execMetric(...a),
  newMetricExecCaches: () => ({ dataSources: new Map(), accessChecked: new Map() }),
}));

import { POST } from '../route';

function req(body: unknown) {
  return { json: async () => body } as never;
}

// Doc Firestore de métrica válida (aggregation → não dispara load de relations).
function snap(id: string, exists = true) {
  return {
    id,
    exists,
    data: () => ({
      label: id,
      requires: ['canonical.carteira.saldo'],
      recipe: { kind: 'aggregation', primaryEntity: 'carteira', aggregation: 'sum', valueAttribute: 'carteira.saldo', groupByAttributes: [], filters: [] },
      type: 'kpi',
      version: '1.0.0',
      status: 'active',
      ownerClientId: null,
      createdAt: null,
      updatedAt: null,
    }),
  };
}

beforeEach(() => {
  h.verifyAuth.mockReset().mockResolvedValue('u@e.com');
  h.loadBindings.mockReset().mockResolvedValue({ ok: true, bindings: [{ productId: 'p', datasets: [] }] });
  h.execMetric.mockReset();
  h.getAll.mockReset();
  h.relationsGet.mockReset().mockResolvedValue({ docs: [] });
});

describe('POST /api/metrics/batch', () => {
  it('mix ok + fail numa chamada → 200 com results misto', async () => {
    h.getAll.mockResolvedValue([snap('good'), snap('bad')]);
    h.execMetric.mockImplementation(async ({ metric }: { metric: { id: string } }) =>
      metric.id === 'bad'
        ? { ok: false, metricId: 'bad', status: 422, error: 'lacuna' }
        : { ok: true, metricId: metric.id, data: [{ value: 1 }], sql: 's', outputColumns: ['value'] },
    );
    const res = await POST(req({ clientId: 'c', metricIds: ['good', 'bad'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.good.ok).toBe(true);
    expect(body.results.bad).toMatchObject({ ok: false, status: 422 });
  });

  it('deduplica metricIds repetidos (1 entrada, 1 getAll ref)', async () => {
    h.getAll.mockResolvedValue([snap('good')]);
    h.execMetric.mockResolvedValue({ ok: true, metricId: 'good', data: [], sql: '', outputColumns: [] });
    const res = await POST(req({ clientId: 'c', metricIds: ['good', 'good'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.results)).toEqual(['good']);
    expect(h.getAll.mock.calls[0][0]).toHaveLength(1);
    expect(h.execMetric).toHaveBeenCalledTimes(1);
  });

  it('metricId inexistente → results[id] ok:false 404', async () => {
    h.getAll.mockResolvedValue([snap('missing', false)]);
    const res = await POST(req({ clientId: 'c', metricIds: ['missing'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.missing).toMatchObject({ ok: false, status: 404 });
    expect(h.execMetric).not.toHaveBeenCalled();
  });

  it('sem token → 401', async () => {
    h.verifyAuth.mockResolvedValue(null);
    const res = await POST(req({ clientId: 'c', metricIds: ['a'] }));
    expect(res.status).toBe(401);
  });

  it('metricIds vazio → 400', async () => {
    const res = await POST(req({ clientId: 'c', metricIds: [] }));
    expect(res.status).toBe(400);
  });

  it('acima do cap (51) → 400', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `m${i}`);
    const res = await POST(req({ clientId: 'c', metricIds: ids }));
    expect(res.status).toBe(400);
  });

  it('cliente sem bindings → erro de topo (não-200)', async () => {
    h.loadBindings.mockResolvedValue({ ok: false, status: 422, error: 'sem bindings' });
    h.getAll.mockResolvedValue([snap('good')]);
    const res = await POST(req({ clientId: 'c', metricIds: ['good'] }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('sem bindings');
  });
});
```

- [ ] **Step 2: Run route test to verify it fails**

Run: `pnpm exec vitest run app/api/metrics/batch/__tests__/route.test.ts`
Expected: FAIL — `../route` não existe (erro de import).

- [ ] **Step 3: Write the route** — criar `app/api/metrics/batch/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { Metric } from '@/shared/schemas';
import {
  loadClientBindings,
  executeMetric,
  newMetricExecCaches,
  type MetricExecResult,
} from '@/shared/lib/metrics/execute-metric';
import type { PageFilterValue } from '@/shared/lib/metrics/resolve-metric';
import type { Relation } from '@/shared/schemas/relation';

/**
 * Endpoint bulk (G9-B): resolve N métricas de uma página numa chamada,
 * fazendo o trabalho compartilhável (bindings, metrics, relations) uma vez.
 * Falha parcial → resultados por métrica @ HTTP 200.
 */

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

const PageFilterValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date_range'), start: z.string(), end: z.string(), attribute: z.string() }),
  z.object({ kind: z.literal('snapshot'), value: z.string(), attribute: z.string() }),
  z.object({ kind: z.literal('in'), values: z.array(z.union([z.string(), z.number()])), attribute: z.string() }),
]);

const RequestSchema = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1).optional(),
  metricIds: z.array(z.string().min(1)).min(1).max(50),
  pageFilters: z.record(z.string(), PageFilterValueSchema).optional(),
});

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Body inválido', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  try {
    const uniqueIds = Array.from(new Set(body.metricIds));

    // Bindings do cliente — uma vez. Falha aqui afeta o batch inteiro (topo).
    const bindings = await loadClientBindings(body.clientId);
    if (!bindings.ok) {
      return NextResponse.json({ error: bindings.error }, { status: bindings.status });
    }

    // Métricas — uma leitura batch.
    const db = firestore();
    const refs = uniqueIds.map((id) => db.collection('metrics').doc(id));
    const snaps = await db.getAll(...refs);

    const results: Record<string, MetricExecResult> = {};
    const metrics: Metric[] = [];
    for (const snap of snaps) {
      if (!snap.exists) {
        results[snap.id] = { ok: false, metricId: snap.id, status: 404, error: `Métrica "${snap.id}" não encontrada` };
        continue;
      }
      try {
        metrics.push(Metric.parse({ id: snap.id, ...snap.data() }));
      } catch {
        results[snap.id] = { ok: false, metricId: snap.id, status: 422, error: `Métrica "${snap.id}" inválida` };
      }
    }

    // Relations — uma vez, só se alguma métrica é derived.
    let relations: Relation[] = [];
    if (metrics.some((m) => m.recipe?.kind === 'derived')) {
      const relSnap = await db.collection('relations').get();
      relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
    }

    // Fan-out: queries BQ em paralelo; caches deduplicam DataSource/access-check.
    const caches = newMetricExecCaches();
    await Promise.all(
      metrics.map(async (metric) => {
        results[metric.id] = await executeMetric({
          metric,
          parsedBindings: bindings.bindings,
          clientId: body.clientId,
          productId: body.productId,
          email,
          relations,
          pageFilters: body.pageFilters as Record<string, PageFilterValue> | undefined,
          caches,
        });
      }),
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Metrics Batch API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run route test to verify it passes**

Run: `pnpm exec vitest run app/api/metrics/batch/__tests__/route.test.ts`
Expected: PASS (7 casos).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add "app/api/metrics/batch/route.ts" "app/api/metrics/batch/__tests__/route.test.ts"
git commit -m "feat(metrics): endpoint bulk POST /api/metrics/batch (G9-B)"
```

---

## Task 3: `useReportData` consome o bulk (N→1)

**Files:**
- Modify: `src/shared/hooks/useReportData.ts`
- Modify: `src/shared/hooks/__tests__/useReportData.test.ts`

**Interfaces:**
- Consumes: `POST /api/metrics/batch` (Task 2).
- Produces: 1 fetch por render-cycle (em vez de N); falha por-métrica → rows vazias.

- [ ] **Step 1: Write the failing test changes** — em `src/shared/hooks/__tests__/useReportData.test.ts`:

(a) Substituir o `beforeEach` (linhas ~70-76) por um mock que devolve o shape bulk dinâmico:
```ts
  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) {
        results[id] = { ok: true, metricId: id, data: [{ value: 42 }], sql: '', outputColumns: ['value'] };
      }
      return { ok: true, json: async () => ({ results }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });
```

(b) Adicionar dois testes novos ao final do `describe`:
```ts
  it('faz 1 chamada bulk para N métricas (N→1) em /api/metrics/batch', async () => {
    const twoBlocks = {
      b1: { id: 'b1', type: 'kpi', metricId: 'pdd.total', label: 'PDD', value: '—' },
      b2: { id: 'b2', type: 'kpi', metricId: 'carteira.saldo', label: 'Saldo', value: '—' },
    } as unknown as Record<string, CanvasBlock>;

    renderHook(() => useReportData(twoBlocks, undefined, undefined, 'covenants'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/metrics/batch');
    const sent = JSON.parse((init as { body: string }).body).metricIds as string[];
    expect(new Set(sent)).toEqual(new Set(['pdd.total', 'carteira.saldo']));
  });

  it('falha por-métrica vira rows vazias, sem erro de página', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { 'pdd.total': { ok: false, metricId: 'pdd.total', status: 422, error: 'lacuna' } } }),
    });

    const { result } = renderHook(() => useReportData(kpiBlock(), undefined, undefined));

    await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect((result.current.populatedBlockMap!.b1 as { value: string }).value).toBe('—');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/hooks/__tests__/useReportData.test.ts`
Expected: FAIL — o hook ainda chama `/api/metrics/${id}/data` (N chamadas, shape `{ data }`); o novo teste N→1 falha (URL/contagem) e os 3 antigos falham ao ler `results` ausente.

- [ ] **Step 3: Swap the hook** — em `src/shared/hooks/useReportData.ts`:

(a) Substituir a função `fetchMetricData` (linhas ~45-71) por `fetchMetricsBatch`:
```ts
async function fetchMetricsBatch(
  metricIds: string[],
  clientId: string,
  productId: string | undefined,
  pageFilters: Record<string, unknown>,
): Promise<Map<string, Array<Record<string, unknown>>>> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const externalToken = getExternalToken();
  const token = externalToken ?? (await getFirebaseAuth().currentUser?.getIdToken());
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/metrics/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clientId, productId, metricIds, pageFilters }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao buscar métricas');
  }
  const body = await res.json();
  const results = (body.results ?? {}) as Record<
    string,
    { ok: boolean; data?: Array<Record<string, unknown>>; error?: string }
  >;
  const map = new Map<string, Array<Record<string, unknown>>>();
  for (const id of metricIds) {
    const r = results[id];
    if (r?.ok) {
      map.set(id, r.data ?? []);
    } else {
      // Falha por-métrica não derruba a página: rows vazias + log (comportamento atual).
      console.error(`[useReportData] Metric "${id}" failed:`, r?.error ?? 'sem resultado');
      map.set(id, []);
    }
  }
  return map;
}
```

(b) Substituir o bloco do fan-out N (linhas ~284-305, do `const allMetricIds` até o fim do `await Promise.all(...)`) por:
```ts
      const allMetricIds = new Set<string>([
        ...metricBindings.map((m) => m.metricId),
        ...sparklineBindings.map((m) => m.metricId),
      ]);
      const metricRows = await fetchMetricsBatch(
        Array.from(allMetricIds),
        activeClientId,
        effectiveProductId,
        pageFilters,
      );
```
(O restante de `fetchAll` — os loops `applyMetricRowsToBlock`/`applySparklineRowsToKpi`, o race-guard `isCurrent`, `setPopulatedBlockMap` — fica inalterado.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/hooks/__tests__/useReportData.test.ts`
Expected: PASS (3 antigos de escopo-por-produto + 2 novos).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/hooks/useReportData.ts src/shared/hooks/__tests__/useReportData.test.ts
git commit -m "feat(report-data): useReportData faz 1 chamada bulk em vez de N (G9-B)"
```

---

## Verificação final (após Task 3)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/lib/metrics app/api/metrics src/shared/hooks/__tests__/useReportData.test.ts` → verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → só as 6 falhas ambientais pré-existentes (`invalid_rapt`/timeout em Firestore real), zero regressão nova.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (track G9-final)
- **G9-C…N:** migrar as páginas fixas (contratos, PDD, elegibilidade, etc.) do `/api/bigquery` para o `/api/metrics/batch` (lendo `schemaBindings`).
- **G9-final:** remover `/api/bigquery`, `queries.ts`, `schema-resolver.ts`, `ClientSchema`/`client.schema`/`client.dataset`.
