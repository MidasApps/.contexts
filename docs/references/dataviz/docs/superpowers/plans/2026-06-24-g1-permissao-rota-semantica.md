# Permissão de rota no path semântico (G1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar `canAccessRoute` no servidor para o path semântico (`/api/metrics/[id]/data` e `/api/metrics/batch`), fechando o bypass de permissão fina (G1) com paridade ao `/api/bigquery` legado.

**Architecture:** Mapa estático `routeForMetric(metricId)` (irmão de `bigquery-action-routes.ts`) + enforcement dentro do `executeMetric` (caminho comum dos dois endpoints) via `verifyRouteAccess`, cacheado por rota. Métricas compartilhadas → rota `null` → só tenant-check.

**Tech Stack:** TypeScript, Vitest 4.1.5 (node env nos testes de execução), Firebase Admin (mockado nos testes), permissões puras (`authorize.ts`).

## Global Constraints

- TDD: teste-primeiro (RED→GREEN), commit por task.
- Nível-**rota** apenas (paridade com o legado); indicador e derivação-via-schema são follow-ups.
- Enforcement no `executeMetric` (não nas rotas) — `/[id]/data` e `/batch` cobertos de uma vez.
- Mensagem de negação: `'Sem permissão para esta página'`, status `403` (idêntica ao legado).
- Métricas de página única → rota; carteira básica/dashboard compartilhada (`play.total_contratos`, `saldo_*`, `valor_atraso`, `over_90`, `faixa_atraso_*`, `serie_*`, `evolucao_saldo`, `inadimplencia`, `inadimplencia_serie`) → `null` (só tenant-check).
- `verifyRouteAccess(email, clientId, route)` já existe em `api-auth.ts` (admin bypass + `canAccessRoute`). Reuso direto.
- Spec: `docs/superpowers/specs/2026-06-24-g1-permissao-rota-semantica-design.md`.

## File Structure

- `src/shared/lib/permissions/metric-route-map.ts` — **criar**: `routeForMetric(metricId): string | null`.
- `src/shared/lib/permissions/__tests__/metric-route-map.test.ts` — **criar**: teste puro do mapa.
- `src/shared/lib/metrics/execute-metric.ts` — **modificar**: import `verifyRouteAccess` + `routeForMetric`; campo `routeAccessChecked` em `MetricExecCaches`; `cachedRouteAccess`; checagem de rota no topo do `try`.
- `src/shared/lib/metrics/__tests__/execute-metric.test.ts` — **modificar**: mock de `verifyRouteAccess` + 4 testes de enforcement.

---

## Task 1: Mapa estático metric → rota

**Files:**
- Create: `src/shared/lib/permissions/metric-route-map.ts`
- Test: `src/shared/lib/permissions/__tests__/metric-route-map.test.ts`

**Interfaces:**
- Produces: `routeForMetric(metricId: string): string | null`.

- [ ] **Step 1: Escrever o teste (RED)** — criar `src/shared/lib/permissions/__tests__/metric-route-map.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routeForMetric } from '../metric-route-map';

/**
 * G1 (path semântico) — mapeia uma métrica para a rota (página) que ela serve,
 * para enforcement server-side de canAccessRoute no executeMetric. Métricas
 * compartilhadas/agregadas (carteira básica usada em mais de uma página)
 * retornam null → sem enforcement de rota (apenas tenant-check).
 */
describe('routeForMetric', () => {
  it('mapeia métricas de página única para suas rotas', () => {
    expect(routeForMetric('play.lista_contratos')).toBe('/contratos');
    expect(routeForMetric('play.valor_pago_periodo')).toBe('/pagamentos');
    expect(routeForMetric('play.pagamentos_por_tipo')).toBe('/pagamentos');
    expect(routeForMetric('play.fluxo_contratado')).toBe('/fluxo-de-caixa');
    expect(routeForMetric('play.fluxo_esperado')).toBe('/fluxo-de-caixa');
    expect(routeForMetric('play.pdd_bacen')).toBe('/pdd');
    expect(routeForMetric('play.pdd_liquid')).toBe('/pdd');
    expect(routeForMetric('play.delta_pdd')).toBe('/pdd');
    expect(routeForMetric('play.pricing_medio')).toBe('/pricing');
    expect(routeForMetric('play.desagio_medio')).toBe('/pricing');
    expect(routeForMetric('play.ltv_distribuicao')).toBe('/simulacao');
    expect(routeForMetric('play.elegibilidade_distribuicao')).toBe('/elegibilidade');
    expect(routeForMetric('play.grupos_repasse_distribuicao')).toBe('/repasse');
    expect(routeForMetric('play.detalhamento_completo')).toBe('/detalhamento');
  });

  it('retorna null para métricas compartilhadas/dashboard (só tenant-check)', () => {
    expect(routeForMetric('play.total_contratos')).toBeNull();
    expect(routeForMetric('play.saldo_nominal')).toBeNull();
    expect(routeForMetric('play.saldo_devedor')).toBeNull();
    expect(routeForMetric('play.valor_atraso')).toBeNull();
    expect(routeForMetric('play.over_90')).toBeNull();
    expect(routeForMetric('play.faixa_atraso_chart')).toBeNull();
    expect(routeForMetric('play.faixa_atraso_table')).toBeNull();
    expect(routeForMetric('play.evolucao_saldo')).toBeNull();
    expect(routeForMetric('play.serie_saldo_nominal')).toBeNull();
    expect(routeForMetric('play.inadimplencia')).toBeNull();
    expect(routeForMetric('play.inadimplencia_serie')).toBeNull();
  });

  it('retorna null para métrica desconhecida', () => {
    expect(routeForMetric('whatever.x')).toBeNull();
    expect(routeForMetric('canonical.carteira.saldo')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste (verificar que falha)**

Run: `pnpm exec vitest run src/shared/lib/permissions/__tests__/metric-route-map.test.ts`
Expected: FAIL — módulo `../metric-route-map` não existe.

- [ ] **Step 3: Implementar (GREEN)** — criar `src/shared/lib/permissions/metric-route-map.ts`:

```ts
/**
 * Mapa métrica → rota (página) que ela serve, para enforcement server-side de
 * `canAccessRoute` no path semântico (`executeMetric`, usado por
 * `/api/metrics/[id]/data` e `/api/metrics/batch`). Espelha o padrão de
 * `bigquery-action-routes.ts` (G1) keyed por metric id.
 *
 * Só métricas de PÁGINA ÚNICA. A carteira básica do dashboard
 * (`play.total_contratos`, `saldo_*`, `valor_atraso`, `over_90`,
 * `faixa_atraso_*`, `serie_*`, `evolucao_saldo`, `inadimplencia*`) é
 * compartilhada entre `/dashboard` e `/elegibilidade` → fica fora do mapa
 * (`null` → só tenant-check), como o legado tratou `contratos_aggregated`/
 * `kpi_history`/`dashboard_faixa_atraso`. Agrupamento espelha os comentários de
 * rota em `scripts/seed-galli-metrics.mjs`.
 */
const METRIC_ROUTE: Record<string, string> = {
  'play.lista_contratos': '/contratos',
  'play.valor_pago_periodo': '/pagamentos',
  'play.pagamentos_por_tipo': '/pagamentos',
  'play.fluxo_contratado': '/fluxo-de-caixa',
  'play.fluxo_esperado': '/fluxo-de-caixa',
  'play.pdd_bacen': '/pdd',
  'play.pdd_liquid': '/pdd',
  'play.delta_pdd': '/pdd',
  'play.pricing_medio': '/pricing',
  'play.desagio_medio': '/pricing',
  'play.ltv_distribuicao': '/simulacao',
  'play.elegibilidade_distribuicao': '/elegibilidade',
  'play.grupos_repasse_distribuicao': '/repasse',
  'play.detalhamento_completo': '/detalhamento',
};

export function routeForMetric(metricId: string): string | null {
  return METRIC_ROUTE[metricId] ?? null;
}
```

- [ ] **Step 4: Rodar o teste (verificar que passa)**

Run: `pnpm exec vitest run src/shared/lib/permissions/__tests__/metric-route-map.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/permissions/metric-route-map.ts src/shared/lib/permissions/__tests__/metric-route-map.test.ts
git commit -m "feat(permissions): mapa routeForMetric p/ enforcement de rota no path semantico (G1)"
```

---

## Task 2: Enforcement de rota no executeMetric

**Files:**
- Modify: `src/shared/lib/metrics/execute-metric.ts`
- Modify: `src/shared/lib/metrics/__tests__/execute-metric.test.ts`

**Interfaces:**
- Consumes: `routeForMetric` (Task 1); `verifyRouteAccess` (`@/shared/lib/api-auth`).
- Produces: `MetricExecCaches` ganha `routeAccessChecked: Map<string, AccessResult>`; `executeMetric` retorna `{ ok:false, status:403, error:'Sem permissão para esta página' }` quando a rota da métrica é negada.

- [ ] **Step 1: Estender o teste (RED)** — em `src/shared/lib/metrics/__tests__/execute-metric.test.ts`:

(a) adicionar `routeAccess` ao objeto hoisted `h`:
```ts
const h = vi.hoisted(() => ({
  access: vi.fn(),
  routeAccess: vi.fn(),
  getDS: vi.fn(),
  bqQuery: vi.fn(),
  resolve: vi.fn(),
  resolveDerived: vi.fn(),
}));
```

(b) adicionar `verifyRouteAccess` ao mock de `api-auth`:
```ts
vi.mock('@/shared/lib/api-auth', () => ({
  verifyDatasetAccess: (...a: unknown[]) => h.access(...a),
  verifyRouteAccess: (...a: unknown[]) => h.routeAccess(...a),
  verifyAuthToken: vi.fn(),
}));
```

(c) no `beforeEach`, adicionar o default permitido:
```ts
  h.routeAccess.mockReset().mockResolvedValue({ allowed: true });
```

(d) adicionar os 4 testes ao final do `describe('executeMetric', ...)` (antes do `});` que o fecha):
```ts
  it('rota negada (métrica de página única) → ok:false 403 antes do tenant', async () => {
    h.routeAccess.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão para esta página' });
    const r = await call({ metric: metric({ id: 'play.pdd_bacen' }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    if (!r.ok) expect(r.error).toBe('Sem permissão para esta página');
    expect(h.access).not.toHaveBeenCalled();   // nem chega no tenant-check
    expect(h.bqQuery).not.toHaveBeenCalled();
    expect(h.routeAccess).toHaveBeenCalledWith('u@e.com', 'om', '/pdd');
  });

  it('rota permitida (página única) → segue para tenant e executa', async () => {
    const r = await call({ metric: metric({ id: 'play.pdd_bacen' }) });
    expect(r.ok).toBe(true);
    expect(h.routeAccess).toHaveBeenCalledWith('u@e.com', 'om', '/pdd');
    expect(h.bqQuery).toHaveBeenCalled();
  });

  it('métrica compartilhada (sem rota) → não checa rota, só tenant', async () => {
    const r = await call({ metric: metric({ id: 'play.total_contratos' }) });
    expect(r.ok).toBe(true);
    expect(h.routeAccess).not.toHaveBeenCalled();
  });

  it('cacheia route-access entre métricas da mesma rota (1 verifyRouteAccess)', async () => {
    const caches = newMetricExecCaches();
    await executeMetric({ metric: metric({ id: 'play.pdd_bacen' }), parsedBindings: [binding()], clientId: 'om', email: 'u@e.com', relations: [], caches });
    await executeMetric({ metric: metric({ id: 'play.pdd_liquid' }), parsedBindings: [binding()], clientId: 'om', email: 'u@e.com', relations: [], caches });
    expect(h.routeAccess).toHaveBeenCalledTimes(1);
  });
```

**Nota de cobertura:** *admin-bypass* não é testado aqui de propósito — é responsabilidade do `verifyRouteAccess` (mockado neste arquivo) e já é coberto por `authorize.test.ts`/`api-auth`. *batch-misto* (uma métrica restrita + uma compartilhada na mesma chamada) é composição de "rota negada → 403" + "compartilhada → ok" (testados acima) com o teste pré-existente "mix ok + fail → 200" de `app/api/metrics/batch/__tests__/route.test.ts` — não precisa de novo caso.

- [ ] **Step 2: Rodar o teste (verificar que falha)**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: FAIL — sem a checagem de rota, `play.pdd_bacen` segue para tenant/ok:true (o teste "rota negada" recebe `ok:true`; o "cacheia"/"rota permitida" falham em `toHaveBeenCalled...` porque `verifyRouteAccess` nunca é chamado).

- [ ] **Step 3: Implementar (GREEN)** — em `src/shared/lib/metrics/execute-metric.ts`:

(a) imports — trocar a linha `import { verifyDatasetAccess } from '@/shared/lib/api-auth';` por:
```ts
import { verifyDatasetAccess, verifyRouteAccess } from '@/shared/lib/api-auth';
```
e adicionar (após o import de `ambient-filter`, perto do topo):
```ts
import { routeForMetric } from '@/shared/lib/permissions/metric-route-map';
```

(b) `MetricExecCaches` — adicionar o campo:
```ts
export interface MetricExecCaches {
  dataSources: Map<string, DataSourceResult>;
  accessChecked: Map<string, AccessResult>;
  routeAccessChecked: Map<string, AccessResult>;
}

export function newMetricExecCaches(): MetricExecCaches {
  return { dataSources: new Map(), accessChecked: new Map(), routeAccessChecked: new Map() };
}
```

(c) adicionar `cachedRouteAccess` logo após `cachedAccess`:
```ts
async function cachedRouteAccess(
  caches: MetricExecCaches,
  email: string,
  clientId: string,
  route: string,
): Promise<AccessResult> {
  const hit = caches.routeAccessChecked.get(route);
  if (hit !== undefined) return hit;
  const ra = await verifyRouteAccess(email, clientId, route);
  caches.routeAccessChecked.set(route, ra);
  return ra;
}
```

(d) inserir a checagem como **primeira coisa dentro do `try {`** de `executeMetric` (logo após `try {`, antes do comentário `// ── Recipe derived ...`):
```ts
  try {
    // Permissão de rota (G1): se a métrica serve uma página específica, exige
    // canAccessRoute — paridade com /api/bigquery. Métricas compartilhadas
    // (routeForMetric → null) ficam só com o tenant-check (cachedAccess) abaixo.
    const route = routeForMetric(metric.id);
    if (route) {
      const ra = await cachedRouteAccess(caches, email, clientId, route);
      if (!ra.allowed) return fail(ra.status ?? 403, ra.error ?? 'Sem permissão para esta página');
    }

    // ── Recipe derived (cross-contract, multi-binding) ──────────────────────
```

- [ ] **Step 4: Rodar o teste (verificar que passa)**

Run: `pnpm exec vitest run src/shared/lib/metrics/__tests__/execute-metric.test.ts`
Expected: PASS (todos — os 9 existentes + 4 novos). Os existentes usam metric id `'m'` → `routeForMetric('m')` = `null` → `verifyRouteAccess` não é chamado → seguem verdes.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
Run: `pnpm exec vitest run src/shared/lib/permissions src/shared/lib/metrics app/api/metrics` → verde (inclui os testes das rotas `/[id]/data` e `/batch`, que seguem verdes: suas métricas de teste não estão no mapa).
```bash
git add src/shared/lib/metrics/execute-metric.ts src/shared/lib/metrics/__tests__/execute-metric.test.ts
git commit -m "feat(metrics): enforcement de rota (canAccessRoute) no executeMetric (G1)"
```

---

## Verificação final (após Task 2)

- [ ] `pnpm exec vitest run src/shared/lib/permissions src/shared/lib/metrics app/api/metrics` → verde.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] `pnpm lint` → sem novos erros.
- [ ] (Conferência manual) o `/[id]/data/route.test.ts` segue verde sem alteração: as métricas dele (`carteira.saldo`, `credito.ticket_segmento`, `chat.kpi_1`) não estão no mapa → `routeForMetric` → `null` → `verifyRouteAccess` não chamado (o mock de `api-auth` daquele arquivo não precisa de `verifyRouteAccess`).
- [ ] Finalizar com `superpowers:finishing-a-development-branch` (PR + merge para `develop`, padrão dos sub-projetos anteriores). **Sem `--apply`** — é só código.

## Fora deste plano (follow-ups)
- Enforcement **nível-indicador** server-side (`canAccessIndicator`) — nunca existiu server-side; não está no escopo do G1 (paridade com o legado é nível-rota).
- Mapeamento **derivado do schema de Produto** (per-route `metricRefs`) — exigiria schema change + re-seed.
- Mapear `covenants.*` quando as páginas de covenants migrarem ao path semântico.
- Migração das demais páginas fixas e aposentadoria da `/api/bigquery` (G9-final).
