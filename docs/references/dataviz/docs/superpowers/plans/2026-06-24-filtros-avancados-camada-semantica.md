# Filtros avançados na camada semântica (G9-C.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar "filtros ambiente" ao resolver semântico — toda métrica `aggregation` passa a aplicar filtros avançados (ratings, faixaLtv, faixaAtraso, …) via um input `ambientFilters`, sem mudança de catálogo, com semântica fail-safe (pula filtro não-bound).

**Architecture:** Tipo `AmbientFilter` (Zod) → threaded `endpoint → executeMetric → resolveMetric` → aplicado em `resolveAggregationRecipe` via `buildAmbientClause`, resolvendo a coluna com `tryResolveColumn` (não-fail-loud).

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN, commit por task.
- **Fail-safe**: filtro cujo attribute não é do `primaryEntity`, não está bound, ou mapeado `null` → **pulado** (sem lançar). Difere dos filtros declarados no recipe (fail-loud).
- Valores **sempre** em params nomeados (sem injeção).
- Só recipes **aggregation** aplicam `ambientFilters`. `sql` e `derived` **ignoram** (documentado).
- Sem mudança de UI; sem tradução `AdvancedFilterParams`→`AmbientFilter` (isso é G9-C.3).
- Spec: `docs/superpowers/specs/2026-06-24-filtros-avancados-camada-semantica-design.md`.

## File Structure

- `src/shared/lib/metrics/ambient-filter.ts` — **criar**: `AmbientFilter`/`NumericBucket` (Zod + tipos). NÃO `server-only` (o client usa em C.3). (Task 1)
- `src/shared/lib/metrics/__tests__/ambient-filter.test.ts` — **criar**. (Task 1)
- `src/shared/lib/metrics/resolve-metric.ts` — **modificar**: `tryResolveColumn`, `buildAmbientClause`, `ambientFilters` em `ResolveMetricOptions`/`resolveMetric`/`resolveAggregationRecipe`. (Task 2)
- `src/shared/lib/metrics/resolve-metric.test.ts` — **modificar**: casos de filtro ambiente. (Task 2)
- `src/shared/lib/metrics/execute-metric.ts` — **modificar**: `ambientFilters` em `ExecuteMetricArgs` + passthrough. (Task 3)
- `app/api/metrics/batch/route.ts` + `app/api/metrics/[id]/data/route.ts` — **modificar**: `RequestSchema` + passthrough. (Task 3)
- `src/shared/lib/metrics/__tests__/execute-metric.test.ts` + `app/api/metrics/batch/__tests__/route.test.ts` — **modificar**: asserções de passthrough. (Task 3)

---

## Task 1: Tipo `AmbientFilter`

**Files:**
- Create: `src/shared/lib/metrics/ambient-filter.ts`
- Create: `src/shared/lib/metrics/__tests__/ambient-filter.test.ts`

**Interfaces:**
- Produces: `AmbientFilter` (Zod discriminatedUnion por `op`: `'in'` | `'numeric_buckets'`), `NumericBucket`, e os tipos inferidos.

- [ ] **Step 1: Write the failing test** — criar `src/shared/lib/metrics/__tests__/ambient-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AmbientFilter } from '../ambient-filter';

describe('AmbientFilter', () => {
  it('parseia op:in', () => {
    const r = AmbientFilter.parse({ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] });
    expect(r.op).toBe('in');
  });

  it('parseia op:numeric_buckets (eq, intervalo, aberto)', () => {
    const r = AmbientFilter.parse({
      op: 'numeric_buckets',
      attribute: 'contratos.dias_atraso',
      buckets: [{ eq: 0 }, { min: 1, max: 30 }, { min: 181 }],
    });
    expect(r.op).toBe('numeric_buckets');
    if (r.op === 'numeric_buckets') expect(r.buckets).toHaveLength(3);
  });

  it('rejeita op desconhecido', () => {
    expect(() => AmbientFilter.parse({ op: 'xx', attribute: 'a', values: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/ambient-filter.test.ts`
Expected: FAIL — `../ambient-filter` não existe.

- [ ] **Step 3: Write the module** — criar `src/shared/lib/metrics/ambient-filter.ts`:

```ts
import { z } from 'zod';

/** Bucket numérico: igualdade exata OU intervalo (min/max inclusivos; abertos se ausentes). */
export const NumericBucket = z.union([
  z.object({ eq: z.number() }),
  z.object({ min: z.number().optional(), max: z.number().optional() }),
]);

/**
 * Filtro "ambiente": aplicado a uma métrica quando seu `attribute` (`entity.attr`)
 * pertence ao primaryEntity da métrica e está bound. Construído pelo consumidor
 * (G9-C.3) a partir dos filtros avançados da UI.
 *
 * - `in`: `coluna IN (valores)`.
 * - `numeric_buckets`: OR de buckets sobre a coluna (ex.: faixaAtraso → dias_atraso).
 */
export const AmbientFilter = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('in'),
    attribute: z.string(),
    values: z.array(z.union([z.string(), z.number()])),
  }),
  z.object({
    op: z.literal('numeric_buckets'),
    attribute: z.string(),
    buckets: z.array(NumericBucket),
  }),
]);

export type NumericBucket = z.infer<typeof NumericBucket>;
export type AmbientFilter = z.infer<typeof AmbientFilter>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/ambient-filter.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/ambient-filter.ts src/shared/lib/metrics/__tests__/ambient-filter.test.ts
git commit -m "feat(metrics): tipo AmbientFilter (filtros ambiente) — G9-C.1"
```

---

## Task 2: Aplicar filtros ambiente no resolver

**Files:**
- Modify: `src/shared/lib/metrics/resolve-metric.ts`
- Modify: `src/shared/lib/metrics/resolve-metric.test.ts`

**Interfaces:**
- Consumes: `AmbientFilter` (Task 1).
- Produces: `ResolveMetricOptions.ambientFilters?: AmbientFilter[]`; `resolveMetric` aplica filtros ambiente em recipes `aggregation`.

- [ ] **Step 1: Write the failing tests** — anexar ao final de `src/shared/lib/metrics/resolve-metric.test.ts` (os helpers `makeBinding`/`aggMetric` já existem no arquivo):

```ts
describe('resolveMetric — filtros ambiente (G9-C.1)', () => {
  const binding = makeBinding({
    schemaBindings: {
      'contratos.saldo_devedor': 'saldo',
      'contratos.rating_liquid': 'rating',
      'contratos.dias_atraso': 'dias',
    },
  });

  it('op:in com attribute bound → IN UNNEST e ANDa com o WHERE', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] }],
    });
    expect(resolved.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(resolved.sql).toContain('`rating`');
    expect(resolved.params.contratos_rating_liquid).toEqual(['A', 'B']);
  });

  it('op:numeric_buckets → (= OR BETWEEN OR >=) parametrizado', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{
        op: 'numeric_buckets',
        attribute: 'contratos.dias_atraso',
        buckets: [{ eq: 0 }, { min: 1, max: 30 }, { min: 181 }],
      }],
    });
    expect(resolved.sql).toMatch(/`dias` = @\w+ OR `dias` BETWEEN @\w+ AND @\w+ OR `dias` >= @\w+/);
  });

  it('attribute não bound (migrado sem a key) → pula, sem alterar o SQL', () => {
    const base = resolveMetric({ metric: aggMetric(), binding });
    const withFilter = resolveMetric({
      metric: aggMetric(),
      binding, // não mapeia contratos.elegibilidade
      ambientFilters: [{ op: 'in', attribute: 'contratos.elegibilidade', values: ['Elegivel'] }],
    });
    expect(withFilter.sql).toBe(base.sql);
  });

  it('attribute mapeado para null → pula', () => {
    const b = makeBinding({ schemaBindings: { 'contratos.saldo_devedor': 'saldo', 'contratos.rating_liquid': null } });
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding: b,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('attribute de outra entidade → pula', () => {
    const resolved = resolveMetric({
      metric: aggMetric(), // primaryEntity: contratos
      binding,
      ambientFilters: [{ op: 'in', attribute: 'pagamentos.tipo', values: ['X'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('values vazios → pula', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: [] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('recipe sql ignora ambientFilters', () => {
    const sqlMetric = aggMetric({
      recipe: { kind: 'sql', template: 'SELECT 1 AS value FROM {contratos}' },
    });
    const resolved = resolveMetric({
      metric: sqlMetric,
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts`
Expected: FAIL — `ambientFilters` é ignorado (SQL sem `IN UNNEST`); os casos `op:in`/`numeric_buckets` falham.

- [ ] **Step 3a: Importar AmbientFilter** — em `src/shared/lib/metrics/resolve-metric.ts`, após a linha `import { renderExpression, validateExpression } from './expression';`:

```ts
import type { AmbientFilter } from './ambient-filter';
```

- [ ] **Step 3b: Adicionar `ambientFilters` a `ResolveMetricOptions`** — dentro da interface (após o campo `pageFilters?`):

```ts
  /** Filtros avançados de página, aplicados a recipes aggregation (best-effort). */
  ambientFilters?: AmbientFilter[];
```

- [ ] **Step 3c: Adicionar `tryResolveColumn`** — logo após o fechamento da função `resolveColumn` (a `}` que precede `function tableRef`):

```ts
/**
 * Como `resolveColumn`, mas retorna `null` em vez de lançar quando o attribute
 * está indisponível (mapeado null, ou migrado sem mapping). Usado por filtros
 * ambiente, que são best-effort (pulam quando a coluna não existe).
 */
function tryResolveColumn(binding: ClientDatasetBinding, ref: string): string | null {
  const bound = binding.schemaBindings?.[ref];
  if (bound === null) return null;
  if (typeof bound === 'string') return quoteIdentifier(bound, 'column');
  const migrated = !!binding.schemaBindings && Object.keys(binding.schemaBindings).length > 0;
  if (migrated) return null;
  const attr = ref.split('.')[1];
  return attr ? quoteIdentifier(attr, 'column') : null;
}
```

- [ ] **Step 3d: Adicionar `buildAmbientClause`** — logo após o fechamento da função `buildFilterClause` (a `}` que precede `function aggExpr`):

```ts
/**
 * Constrói a cláusula WHERE de um filtro ambiente, ou `null` para pular
 * (attribute de outra entidade, não bound, ou vazio). Best-effort, fail-safe.
 */
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
```

- [ ] **Step 3e: Aplicar em `resolveAggregationRecipe`** — (1) adicionar o parâmetro à assinatura:

```ts
function resolveAggregationRecipe(
  metric: Metric,
  recipe: Extract<MetricRecipe, { kind: 'aggregation' }>,
  binding: ClientDatasetBinding,
  projectId: string | undefined,
  pageFilters: Record<string, PageFilterValue> | undefined,
  ambientFilters: AmbientFilter[] | undefined,
): ResolvedMetric {
```

(2) logo após o loop `for (const f of recipe.filters ?? [])` que preenche `whereParts`:

```ts
  for (const af of ambientFilters ?? []) {
    const clause = buildAmbientClause(af, binding, recipe.primaryEntity, params);
    if (clause) whereParts.push(clause);
  }
```

- [ ] **Step 3f: Repassar em `resolveMetric`** — desestruturar `ambientFilters` e passar para `resolveAggregationRecipe`:

```ts
export function resolveMetric(opts: ResolveMetricOptions): ResolvedMetric {
  const { metric, binding, projectId, pageFilters, ambientFilters } = opts;
```
e a chamada do ramo aggregation:
```ts
  if (metric.recipe.kind === 'aggregation') {
    return resolveAggregationRecipe(metric, metric.recipe, binding, projectId, pageFilters, ambientFilters);
  }
```
(O ramo `sql`/`resolveSqlRecipe` permanece inalterado — ignora `ambientFilters`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-metric.test.ts`
Expected: PASS (casos antigos A3/A6/tableBindings + os 7 novos de filtro ambiente).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/resolve-metric.ts src/shared/lib/metrics/resolve-metric.test.ts
git commit -m "feat(metrics): resolver aplica filtros ambiente em recipes aggregation — G9-C.1"
```

---

## Task 3: Fiação endpoint → resolver

**Files:**
- Modify: `src/shared/lib/metrics/execute-metric.ts`
- Modify: `app/api/metrics/batch/route.ts`
- Modify: `app/api/metrics/[id]/data/route.ts`
- Modify: `src/shared/lib/metrics/__tests__/execute-metric.test.ts`
- Modify: `app/api/metrics/batch/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `AmbientFilter` (Task 1), `resolveMetric` com `ambientFilters` (Task 2).
- Produces: `ExecuteMetricArgs.ambientFilters?`; rotas aceitam `ambientFilters` no body e repassam.

- [ ] **Step 1: Write the failing tests**

(a) Em `src/shared/lib/metrics/__tests__/execute-metric.test.ts`, adicionar ao `describe('executeMetric', …)`:
```ts
  it('repassa ambientFilters para resolveMetric', async () => {
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    await call({ ambientFilters });
    expect(h.resolve).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });
```

(b) Em `app/api/metrics/batch/__tests__/route.test.ts`, adicionar ao `describe('POST /api/metrics/batch', …)`:
```ts
  it('repassa ambientFilters do body para executeMetric', async () => {
    h.getAll.mockResolvedValue([snap('carteira.good')]);
    h.execMetric.mockResolvedValue({ ok: true, metricId: 'carteira.good', data: [], sql: '', outputColumns: [] });
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    await POST(req({ clientId: 'c', metricIds: ['carteira.good'], ambientFilters }));
    expect(h.execMetric).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts app/api/metrics/batch/__tests__/route.test.ts`
Expected: FAIL — `ambientFilters` não é repassado (executeMetric não o aceita / a rota não o lê).

- [ ] **Step 3a: `execute-metric.ts`** — adicionar o import de tipo (junto aos demais imports do topo):
```ts
import type { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';
```
adicionar o campo a `ExecuteMetricArgs` (após `pageFilters?`):
```ts
  ambientFilters?: AmbientFilter[];
```
desestruturar em `executeMetric` (incluir `ambientFilters` na desestruturação de `args`) e repassar na chamada do ramo single-contract:
```ts
    const resolved = resolveMetric({ metric, binding: resolvedDataset, projectId: source.projectId, pageFilters, ambientFilters });
```
(O ramo `derived`/`resolveDerivedMetric` permanece inalterado — não recebe `ambientFilters`.)

- [ ] **Step 3b: `app/api/metrics/batch/route.ts`** — importar o schema (junto ao import de `@/shared/schemas`):
```ts
import { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';
```
adicionar ao `RequestSchema` (após `metricIds`):
```ts
  ambientFilters: z.array(AmbientFilter).optional(),
```
repassar na chamada de `executeMetric` (dentro do `Promise.all`), adicionando:
```ts
          ambientFilters: body.ambientFilters,
```

- [ ] **Step 3c: `app/api/metrics/[id]/data/route.ts`** — mesmo padrão:
```ts
import { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';
```
adicionar ao `RequestSchema` (após `pageFilters`):
```ts
  ambientFilters: z.array(AmbientFilter).optional(),
```
repassar na chamada de `executeMetric`, adicionando:
```ts
      ambientFilters: body.ambientFilters,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts app/api/metrics/batch/__tests__/route.test.ts "app/api/metrics/[id]/data/route.test.ts"`
Expected: PASS (passthrough + suites existentes verdes).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/metrics/execute-metric.ts "app/api/metrics/batch/route.ts" "app/api/metrics/[id]/data/route.ts" src/shared/lib/metrics/__tests__/execute-metric.test.ts "app/api/metrics/batch/__tests__/route.test.ts"
git commit -m "feat(metrics): rotas + executeMetric repassam ambientFilters — G9-C.1"
```

---

## Verificação final (após Task 3)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/lib/metrics app/api/metrics` → verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → só as 6 falhas ambientais pré-existentes (`invalid_rapt`/timeout), zero regressão nova.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (continuação do track G9-C)
- **G9-C.2:** métricas time-series (sparklines) + decisão/implementação da tabela faixa multi-measure.
- **G9-C.3:** rewire do `DashboardPage` — hooks → `/api/metrics/batch`; tradução `AdvancedFilterParams`→`AmbientFilter[]` (normalização elegibilidade, label→bucket de faixaAtraso); período de comparação.
- Suporte a filtros ambiente em recipes `sql`/`derived` (se necessário).
