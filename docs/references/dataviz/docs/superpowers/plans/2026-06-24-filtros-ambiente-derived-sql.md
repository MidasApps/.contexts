# Filtros ambiente em recipes `derived` e `sql` (G9-C.2a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender os filtros ambiente (C.1) a recipes `derived` (aplicação automática ancorada no `primaryEntity`) e `sql` (placeholder `{ambient:entity}`), eliminando a regressão de filtros em ratios/tabelas — reusando `tryResolveColumn` e a montagem de cláusula.

**Architecture:** Refactor DRY (`ambientClauseFromColumn`) + aplicar em `resolveDerivedMetric` + suportar `{ambient:entity}` em `resolveSqlRecipe`; threading `ambientFilters` via `ResolveDerivedOptions`/`resolveMetric`/`executeMetric`.

**Tech Stack:** TypeScript, Vitest. Resolver puro (sem Firestore).

## Global Constraints

- TDD: teste-primeiro, RED→GREEN, commit por task.
- **Fail-safe** (igual C.1): filtro de entidade fora do escopo / coluna não-bound / `null` → pulado, sem lançar. Valores sempre em params nomeados.
- `{ambient:entity}` sem filtros aplicáveis → `TRUE` (no-op).
- Sem mudança de catálogo (métricas) nem UI — isso é C.2b/C.2c.
- Spec: `docs/superpowers/specs/2026-06-24-filtros-ambiente-derived-sql-design.md`.

## File Structure

- `src/shared/lib/metrics/resolve-metric.ts` — **modificar**: `ambientClauseFromColumn` (refactor), `buildAmbientClause` delega, ambient em `resolveDerivedMetric` (+`ResolveDerivedOptions.ambientFilters`), `{ambient:entity}` em `resolveSqlRecipe`, `resolveMetric` passa a `resolveSqlRecipe`.
- `src/shared/lib/metrics/resolve-metric.test.ts` — **modificar**: casos derived + sql.
- `src/shared/lib/metrics/execute-metric.ts` — **modificar**: ramo `derived` repassa `ambientFilters`.
- `src/shared/lib/metrics/__tests__/execute-metric.test.ts` — **modificar**: passthrough derived.

---

## Task 1: Refactor DRY + filtros ambiente em `derived`

**Files:**
- Modify: `src/shared/lib/metrics/resolve-metric.ts`
- Modify: `src/shared/lib/metrics/resolve-metric.test.ts`
- Modify: `src/shared/lib/metrics/execute-metric.ts`
- Modify: `src/shared/lib/metrics/__tests__/execute-metric.test.ts`

**Interfaces:**
- Produces: `ambientClauseFromColumn(col, f, params)`; `ResolveDerivedOptions.ambientFilters?: AmbientFilter[]`; `resolveDerivedMetric` aplica ambient ancorado no escopo.
- Consumes: `tryResolveColumn`, `AmbientFilter` (C.1).

- [ ] **Step 1: Write the failing tests**

(a) Em `src/shared/lib/metrics/resolve-metric.test.ts`, primeiro adicionar `resolveDerivedMetric` ao import do topo do arquivo:
```ts
import { resolveMetric, resolveDerivedMetric, MetricResolutionError, type PageFilterValue } from './resolve-metric';
```
depois anexar ao final (reusa os tipos `Metric`/`ClientDatasetBinding` já importados no topo):
```ts
describe('resolveDerivedMetric — filtros ambiente (G9-C.2a)', () => {
  // Métrica derived ratio single-contract: tot/n sobre canonical.contratos.
  const ratioMetric = {
    id: 'play.inadimplencia',
    label: 'Inadimplência',
    requires: ['canonical.contratos.valor_atraso', 'canonical.contratos.saldo_devedor'],
    type: 'kpi',
    version: '1.0.0',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    recipe: {
      kind: 'derived',
      primaryEntity: 'canonical.contratos',
      joins: [],
      terms: [
        { id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' },
        { id: 'n', aggregation: 'sum', valueRef: 'canonical.contratos.saldo_devedor' },
      ],
      expression: 'tot / n',
      filters: [],
    },
  } as unknown as Metric;

  function bindings(over: Record<string, string | null> = {}): Record<string, ClientDatasetBinding> {
    return {
      canonical: {
        id: 'ds', dataSourceId: 'bq', datasetId: 'cliente_dataset', contractRef: 'canonical',
        schemaBindings: {
          'contratos.valor_atraso': 'va',
          'contratos.saldo_devedor': 'sd',
          'contratos.rating_liquid': 'rating',
          ...over,
        },
        schema: {}, isPrimary: true,
      },
    } as unknown as Record<string, ClientDatasetBinding>;
  }

  it('aplica ambient in quando a entidade está no escopo e bound', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings(),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(r.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(r.sql).toContain('`rating`');
  });

  it('pula ambient de entidade fora do escopo', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings(),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'pagamentos.tipo', values: ['X'] }],
    });
    expect(r.sql).not.toContain('IN UNNEST');
  });

  it('pula ambient com coluna não bound (mapeada null)', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings({ 'contratos.rating_liquid': null }),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(r.sql).not.toContain('IN UNNEST');
  });
});
```

(b) Em `src/shared/lib/metrics/__tests__/execute-metric.test.ts`, adicionar ao `describe('executeMetric', …)` um caso de passthrough derived. Primeiro, garantir que o mock de `resolve-metric` exponha um spy de `resolveDerivedMetric` — **substituir** o factory do mock (linhas que mockam `@/shared/lib/metrics/resolve-metric`) por:
```ts
vi.mock('@/shared/lib/metrics/resolve-metric', () => ({
  resolveMetric: (...a: unknown[]) => h.resolve(...a),
  resolveDerivedMetric: (...a: unknown[]) => h.resolveDerived(...a),
  MetricResolutionError: class MetricResolutionError extends Error {},
}));
```
adicionar `resolveDerived: vi.fn()` ao objeto `h` do `vi.hoisted(...)`, e no `beforeEach` resetá-lo:
```ts
h.resolveDerived.mockReset().mockReturnValue({ sql: 'SELECT 1', params: {}, outputColumns: ['value'] });
```
e o novo teste:
```ts
  it('repassa ambientFilters para resolveDerivedMetric (ramo derived)', async () => {
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    const derivedMetric = metric({
      requires: ['canonical.contratos.valor_atraso', 'canonical.contratos.saldo_devedor'],
      recipe: {
        kind: 'derived', primaryEntity: 'canonical.contratos', joins: [],
        terms: [
          { id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' },
          { id: 'n', aggregation: 'sum', valueRef: 'canonical.contratos.saldo_devedor' },
        ],
        expression: 'tot / n', filters: [],
      },
    });
    await call({ metric: derivedMetric, ambientFilters });
    expect(h.resolveDerived).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: FAIL — derived ignora `ambientFilters` (sem `IN UNNEST`); `resolveDerived` chamado sem `ambientFilters`.

- [ ] **Step 3a: Refactor `ambientClauseFromColumn`** — em `resolve-metric.ts`, substituir o corpo de `buildAmbientClause` para delegar, e adicionar a função extraída logo acima dela:

```ts
/** Monta a cláusula SQL de um AmbientFilter a partir da coluna já resolvida. */
function ambientClauseFromColumn(
  col: string,
  f: AmbientFilter,
  params: Record<string, unknown>,
): string | null {
  if (f.op === 'in') {
    if (f.values.length === 0) return null;
    const name = nextParam(params, f.attribute.replace(/\./g, '_'));
    params[name] = f.values;
    return `${col} IN UNNEST(@${name})`;
  }
  // numeric_buckets
  const parts: string[] = [];
  for (const b of f.buckets) {
    if ('eq' in b) {
      const n = nextParam(params, 'bk');
      params[n] = b.eq;
      parts.push(`${col} = @${n}`);
    } else if (b.min !== undefined && b.max !== undefined) {
      const a = nextParam(params, 'bk');
      const c = nextParam(params, 'bk');
      params[a] = b.min;
      params[c] = b.max;
      parts.push(`${col} BETWEEN @${a} AND @${c}`);
    } else if (b.min !== undefined) {
      const n = nextParam(params, 'bk');
      params[n] = b.min;
      parts.push(`${col} >= @${n}`);
    } else if (b.max !== undefined) {
      const n = nextParam(params, 'bk');
      params[n] = b.max;
      parts.push(`${col} <= @${n}`);
    }
  }
  return parts.length ? `(${parts.join(' OR ')})` : null;
}

function buildAmbientClause(
  f: AmbientFilter,
  binding: ClientDatasetBinding,
  primaryEntity: string,
  params: Record<string, unknown>,
): string | null {
  const [entity] = f.attribute.split('.');
  if (entity !== primaryEntity) return null;
  const col = tryResolveColumn(binding, f.attribute);
  if (col === null) return null;
  return ambientClauseFromColumn(col, f, params);
}
```
(Substitui a `buildAmbientClause` atual inteira — da assinatura até o `return parts.length ? … : null; }` final.)

- [ ] **Step 3b: `ambientFilters` em `ResolveDerivedOptions`** — adicionar após `pageFilters?`:
```ts
  ambientFilters?: AmbientFilter[];
```

- [ ] **Step 3c: aplicar ambient em `resolveDerivedMetric`** — (1) desestruturar:
```ts
  const { metric, bindingsByContract, relations, projectIdByContract, pageFilters, ambientFilters } = opts;
```
(2) logo após o loop `for (const f of recipe.filters ?? []) { whereParts.push(buildDerivedFilter(...)); }`:
```ts
  for (const af of ambientFilters ?? []) {
    const afEntity = af.attribute.split('.')[0];
    // inScope guarda "contractId.entity"; primaryEntity vem primeiro (ordem de inserção).
    const ce = [...inScope].find((s) => s.split('.')[1] === afEntity);
    if (!ce) continue;
    const contractId = ce.split('.')[0];
    const col = tryResolveColumn(bindingFor(contractId), af.attribute);
    if (col === null) continue;
    const clause = ambientClauseFromColumn(col, af, params);
    if (clause) whereParts.push(clause);
  }
```

- [ ] **Step 3d: `executeMetric` (ramo derived) repassa** — em `execute-metric.ts`, na chamada de `resolveDerivedMetric`:
```ts
      const resolved = resolveDerivedMetric({ metric, bindingsByContract, relations, projectIdByContract, pageFilters, ambientFilters });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: PASS — derived ambient (3 casos), passthrough derived, e todos os casos da C.1 (refactor preservou o comportamento de `buildAmbientClause`).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/resolve-metric.ts src/shared/lib/metrics/resolve-metric.test.ts src/shared/lib/metrics/execute-metric.ts src/shared/lib/metrics/__tests__/execute-metric.test.ts
git commit -m "feat(metrics): filtros ambiente em recipes derived + refactor ambientClauseFromColumn (G9-C.2a)"
```

---

## Task 2: Filtros ambiente em `sql` via `{ambient:entity}`

**Files:**
- Modify: `src/shared/lib/metrics/resolve-metric.ts`
- Modify: `src/shared/lib/metrics/resolve-metric.test.ts`

**Interfaces:**
- Consumes: `ambientClauseFromColumn`, `tryResolveColumn` (Task 1 / C.1).
- Produces: `resolveSqlRecipe` substitui `{ambient:<entity>}`; `resolveMetric` passa `ambientFilters` a `resolveSqlRecipe`.

- [ ] **Step 1: Write the failing tests** — em `src/shared/lib/metrics/resolve-metric.test.ts`, anexar ao final:
```ts
describe('resolveMetric — {ambient:entity} em recipe sql (G9-C.2a)', () => {
  const binding = makeBinding({
    schemaBindings: { 'contratos.rating_liquid': 'rating', 'contratos.saldo_devedor': 'sd' },
  });
  function sqlMetric() {
    return aggMetric({
      recipe: {
        kind: 'sql',
        template: 'SELECT SUM({contratos.saldo_devedor}) AS value FROM {contratos} WHERE TRUE AND {ambient:contratos}',
      },
    });
  }

  it('substitui {ambient:contratos} pela cláusula quando há filtro bound', () => {
    const r = resolveMetric({
      metric: sqlMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] }],
    });
    expect(r.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(r.sql).toContain('`rating`');
    expect(r.sql).not.toContain('{ambient');
    // o {contratos} (tabela) e {contratos.saldo_devedor} (coluna) seguem resolvidos
    expect(r.sql).toContain('`cliente_dataset.contratos`');
    expect(r.sql).toContain('`sd`');
  });

  it('vira TRUE quando não há ambientFilters', () => {
    const r = resolveMetric({ metric: sqlMetric(), binding });
    expect(r.sql).toContain('AND TRUE');
    expect(r.sql).not.toContain('{ambient');
  });

  it('pula filtro não bound (vira TRUE se nenhum sobra)', () => {
    const r = resolveMetric({
      metric: sqlMetric(),
      binding, // não mapeia contratos.elegibilidade
      ambientFilters: [{ op: 'in', attribute: 'contratos.elegibilidade', values: ['Elegivel'] }],
    });
    expect(r.sql).toContain('AND TRUE');
    expect(r.sql).not.toContain('IN UNNEST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts`
Expected: FAIL — `{ambient:contratos}` fica literal no SQL (não substituído).

- [ ] **Step 3a: `resolveSqlRecipe` aceita `ambientFilters` + substitui `{ambient:entity}`** — alterar a assinatura:
```ts
function resolveSqlRecipe(
  metric: Metric,
  recipe: Extract<MetricRecipe, { kind: 'sql' }>,
  binding: ClientDatasetBinding,
  projectId: string | undefined,
  pageFilters: Record<string, PageFilterValue> | undefined,
  ambientFilters: AmbientFilter[] | undefined,
): ResolvedMetric {
```
e inserir, **entre** o passo 1 (`{filter.X}`) e o passo 2 (`{entity.attribute}`):
```ts
  // 1.5. Substitui {ambient:entity} pelas cláusulas dos filtros ambiente daquela
  //      entidade (ANDed), ou TRUE (no-op). Antes de {entity.attribute}/{entity}.
  sql = sql.replace(/\{ambient:([a-z_][a-z0-9_]*)\}/g, (_m, entity: string) => {
    const clauses: string[] = [];
    for (const af of ambientFilters ?? []) {
      if (af.attribute.split('.')[0] !== entity) continue;
      const col = tryResolveColumn(binding, af.attribute);
      if (col === null) continue;
      const clause = ambientClauseFromColumn(col, af, params);
      if (clause) clauses.push(clause);
    }
    return clauses.length ? clauses.join(' AND ') : 'TRUE';
  });
```

- [ ] **Step 3b: `resolveMetric` passa `ambientFilters` a `resolveSqlRecipe`** — a última linha de `resolveMetric`:
```ts
  return resolveSqlRecipe(metric, metric.recipe, binding, projectId, pageFilters, ambientFilters);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts`
Expected: PASS (3 casos sql + todos os anteriores).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/resolve-metric.ts src/shared/lib/metrics/resolve-metric.test.ts
git commit -m "feat(metrics): {ambient:entity} em recipes sql (G9-C.2a)"
```

---

## Verificação final (após Task 2)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/lib/metrics app/api/metrics` → verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → só as falhas ambientais pré-existentes (`invalid_rapt`/timeout/worker-startup), zero regressão lógica nova.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (continuação do track G9-C)
- **G9-C.2b:** catálogo `play.*` — sparklines (agg+timeAttribute), inadimplência `derived` (scalar + série), `faixa_atraso_table` estendida com `{ambient:contratos}` e as 7 colunas.
- **G9-C.2c (ex-C.3):** rewire do `DashboardPage` — hooks → `/api/metrics/batch`; tradução `AdvancedFilterParams`→`AmbientFilter[]`; período de comparação.
