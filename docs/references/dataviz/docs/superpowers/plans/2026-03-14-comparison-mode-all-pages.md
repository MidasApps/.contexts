# Comparison Mode — All Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend comparison mode to all 8 remaining dashboard pages so KPIs, charts, and tables show period-over-period deltas when "Comparar períodos" is enabled.

**Architecture:** A generic `usePageComparison<T>` hook reuses existing BigQuery actions with `dataBase` swapped to `comparePeriod.end`. A `calcDelta` utility computes deltas. A `DeltaBadge` component renders inline badges in table cells. Charts gain ghost bars/dashed lines for the previous period.

**Tech Stack:** React 19, Next.js 16, Recharts, Zustand, Tailwind CSS v4, BigQuery

**Spec:** `docs/superpowers/specs/2026-03-14-comparison-mode-all-pages-design.md`

---

## Chunk 1: Foundation (shared utilities + hook)

### Task 1: Create `calcDelta` utility and `mergeComparisonData`

**Files:**
- Create: `src/shared/lib/comparison.ts`

- [ ] **Step 1: Create comparison.ts with calcDelta and mergeComparisonData**

```typescript
// src/shared/lib/comparison.ts

export interface DeltaInfo {
  percent: number | null;
  direction: 'up' | 'down' | 'neutral';
  formatted: string;
}

export function calcDelta(current: number, previous: number): DeltaInfo {
  if (previous === 0 && current === 0) {
    return { percent: 0, direction: 'neutral', formatted: '—' };
  }
  if (previous === 0) {
    return {
      percent: null,
      direction: current > 0 ? 'up' : 'down',
      formatted: 'novo',
    };
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(percent) < 0.1) {
    return { percent: 0, direction: 'neutral', formatted: '—' };
  }
  const sign = percent > 0 ? '+' : '';
  return {
    percent,
    direction: percent > 0 ? 'up' : 'down',
    formatted: `${sign}${percent.toFixed(1)}%`,
  };
}

/**
 * Merge comparison data into current data by index.
 * For each key in `keys`, adds a `prev_{key}` field from the previous array.
 * Truncates to the shorter array length.
 */
export function mergeComparisonData<T extends Record<string, unknown>>(
  current: T[],
  previous: T[],
  keys: string[],
): Array<T & Record<string, unknown>> {
  const len = Math.min(current.length, previous.length);
  return current.slice(0, len).map((row, i) => {
    const merged: Record<string, unknown> = { ...row };
    for (const key of keys) {
      merged[`prev_${key}`] = previous[i]?.[key] ?? undefined;
    }
    return merged as T & Record<string, unknown>;
  });
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | grep comparison || echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/comparison.ts
git commit -m "feat: add calcDelta utility and mergeComparisonData for comparison mode"
```

---

### Task 2: Create `DeltaBadge` component

**Files:**
- Create: `src/shared/ui/delta-badge.tsx`
- Modify: `src/app/globals.css` (add CSS custom properties)

- [ ] **Step 1: Add CSS custom properties to globals.css**

Add after the existing color definitions in the `:root` / dark theme section:

```css
--color-delta-positive: #6ECB8A;
--color-delta-negative: #F27C7C;
```

- [ ] **Step 2: Create delta-badge.tsx**

```typescript
// src/shared/ui/delta-badge.tsx
'use client';

import { calcDelta } from '@/shared/lib/comparison';

interface DeltaBadgeProps {
  current: number;
  previous: number | null | undefined;
  positiveIsGood?: boolean;
  loading?: boolean;
}

export function DeltaBadge({ current, previous, positiveIsGood = true, loading }: DeltaBadgeProps) {
  if (loading) {
    return <span className="inline-block w-10 h-3 rounded bg-white/[0.06] animate-pulse" />;
  }

  if (previous == null) return null;

  const delta = calcDelta(current, previous);
  if (delta.direction === 'neutral') {
    return <span className="text-[10px] text-white/20">—</span>;
  }

  const isPositive = delta.direction === 'up';
  const isGood = positiveIsGood ? isPositive : !isPositive;
  const arrow = isPositive ? '↑' : '↓';

  return (
    <span
      className="text-[10px] font-medium"
      style={{ color: isGood ? 'var(--color-delta-positive, #6ECB8A)' : 'var(--color-delta-negative, #F27C7C)' }}
    >
      {arrow} {delta.formatted}
    </span>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/shared/ui/delta-badge.tsx src/app/globals.css
git commit -m "feat: add DeltaBadge component for inline table comparison"
```

---

### Task 3: Create `usePageComparison` hook

**Files:**
- Create: `src/shared/hooks/usePageComparison.ts`

**Reference:**
- `src/shared/hooks/useQuery.ts` — caching hook
- `src/shared/providers/DataProvider.tsx` — `useDataFilters()` for `compareEnabled`, `comparePeriod`

- [ ] **Step 1: Create usePageComparison.ts**

```typescript
// src/shared/hooks/usePageComparison.ts
'use client';

import { useCallback, useMemo } from 'react';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { useQuery, fetchBigQuery } from '@/shared/hooks/useQuery';

interface UsePageComparisonOptions {
  action: string;
  params: Record<string, unknown>;
  enabled?: boolean;
}

interface UsePageComparisonResult<T> {
  previousData: T | undefined;
  loading: boolean;
  error: string | null;
}

export function usePageComparison<T>({
  action,
  params,
  enabled = true,
}: UsePageComparisonOptions): UsePageComparisonResult<T> {
  const { compareEnabled, comparePeriod } = useDataFilters();

  const isActive = compareEnabled && !!comparePeriod && enabled;

  const queryFn = useCallback(
    () =>
      fetchBigQuery<T>(action, {
        ...params,
        dataBase: comparePeriod?.end ?? '',
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, comparePeriod?.end, JSON.stringify(params)],
  );

  const queryKey = useMemo(
    () => `cmp-${action}-${comparePeriod?.end ?? ''}-${JSON.stringify(params)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, comparePeriod?.end, JSON.stringify(params)],
  );

  const { data, loading, error } = useQuery<T>({
    queryFn,
    queryKey,
    enabled: isActive,
  });

  if (!isActive) {
    return { previousData: undefined, loading: false, error: null };
  }

  return { previousData: data, loading, error };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | grep usePageComparison || echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/usePageComparison.ts
git commit -m "feat: add usePageComparison generic hook for comparison mode"
```

---

## Chunk 2: Page implementations — Batch 1 (PDD, Pricing, Simulação, Repasse)

These 4 pages share the same pattern: KPIs + chart + table. They all use `advancedFilters` and are point-in-time snapshot queries.

### Task 4: Add comparison to PDD page

**Files:**
- Modify: `src/pages/pdd/ui/PddPage.tsx`

**Reference:**
- Read `src/shared/hooks/usePdd.ts` for the current hook params
- The PDD page has 3 KPIs (PDD Liquid, PDD Mín Bacen, Delta Total), a grouped BarChart, and a table by rating

- [ ] **Step 1: Read the current PddPage.tsx to understand its structure**

Read: `src/pages/pdd/ui/PddPage.tsx`

- [ ] **Step 2: Add usePageComparison import and call**

At the top of the component, after existing hooks, add:

```typescript
import { usePageComparison } from '@/shared/hooks/usePageComparison';
import { DeltaBadge } from '@/shared/ui/delta-badge';
import { mergeComparisonData } from '@/shared/lib/comparison';
```

Inside the component, after the existing `usePdd()` call, add:

```typescript
const { previousData: prevPdd, loading: cmpLoading } = usePageComparison<typeof pddData>({
  action: 'pdd_page',
  params: { dataBase, projeto, advancedFilters, dataset },
});
```

Where `pddData` is the existing data variable, and `dataBase`, `projeto`, `advancedFilters`, `dataset` match what `usePdd` uses.

- [ ] **Step 3: Add DeltaBadge to KPI cards**

For each KPI card that shows a numeric value (PDD Liquid, PDD Mín Bacen, Delta Total), add a `<DeltaBadge>` below the value:

```tsx
<DeltaBadge
  current={currentValue}
  previous={prevPdd?.correspondingField}
  loading={cmpLoading}
/>
```

- [ ] **Step 4: Add ghost bars to the grouped BarChart**

If comparison data exists, use `mergeComparisonData` to add `prev_pdd_liquid` and `prev_pdd_bacen` fields, then add extra `<Bar>` components with `opacity={0.25}` behind the current bars.

- [ ] **Step 5: Add DeltaBadge to table cells**

For each numeric cell in the rating table, wrap the value with a DeltaBadge below it:

```tsx
<div>
  <span>{formatCurrency(row.pdd_liquid)}</span>
  <DeltaBadge current={row.pdd_liquid} previous={prevRow?.pdd_liquid} loading={cmpLoading} />
</div>
```

Match previous rows by the same key (rating letter).

- [ ] **Step 6: Verify the page renders without errors**

Run: `pnpm build 2>&1 | tail -5`
Then open `http://localhost:3000/pdd` in the browser with comparison enabled.

- [ ] **Step 7: Commit**

```bash
git add src/pages/pdd/ui/PddPage.tsx
git commit -m "feat: add comparison mode to PDD page (KPIs, chart, table)"
```

---

### Task 5: Add comparison to Pricing page

**Files:**
- Modify: `src/pages/pricing/ui/PricingPage.tsx`

**Reference:**
- Read `src/shared/hooks/usePricing.ts` for the current hook params
- Pricing has 2 KPIs (Pricing Total, Deságio) and tables only (no charts)

- [ ] **Step 1: Read the current PricingPage.tsx**

Read: `src/pages/pricing/ui/PricingPage.tsx`

- [ ] **Step 2: Add usePageComparison and DeltaBadge**

Same pattern as Task 4 but with action `'pricing_page'`.

- [ ] **Step 3: Add DeltaBadge to KPI values**

For Pricing Total and Deságio Médio KPIs.

- [ ] **Step 4: Add DeltaBadge to table cells**

For both "Por Rating Liquid" and "Por Elegibilidade" tables, add DeltaBadge on: Saldo Devedor, Pricing, LTV columns.
Match previous rows by rating/elegibilidade key.

- [ ] **Step 5: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/pricing/ui/PricingPage.tsx
git commit -m "feat: add comparison mode to Pricing page (KPIs, tables)"
```

---

### Task 6: Add comparison to Simulação page

**Files:**
- Modify: `src/pages/simulacao/ui/SimulacaoPage.tsx`

**Reference:**
- Read `src/shared/hooks/useSimulacao.ts` for the current hook params
- Simulação has 2 KPIs, a BarChart (LTV por faixa), and potentially a table

- [ ] **Step 1: Read the current SimulacaoPage.tsx**

Read: `src/pages/simulacao/ui/SimulacaoPage.tsx`

- [ ] **Step 2: Add usePageComparison with action `'simulacao_page'`**

Same pattern as previous tasks.

- [ ] **Step 3: Add DeltaBadge to KPIs**

For "Contratos com LTV > 80%" and "Saldo Devedor com LTV > 80%".

- [ ] **Step 4: Add ghost bars to BarChart**

Use `mergeComparisonData` on the LTV faixa data, add `<Bar>` with `opacity={0.25}` for previous values.

- [ ] **Step 5: Add DeltaBadge to table cells if table exists**

- [ ] **Step 6: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/simulacao/ui/SimulacaoPage.tsx
git commit -m "feat: add comparison mode to Simulação page (KPIs, chart, table)"
```

---

### Task 7: Add comparison to Repasse page

**Files:**
- Modify: `src/pages/repasse/ui/RepassePage.tsx`

**Reference:**
- Read `src/shared/hooks/useRepasse.ts` for the current hook params
- Repasse has 4 KPIs, a BarChart (saldo por grupo), and "Grupos de Estratégia" table

- [ ] **Step 1: Read the current RepassePage.tsx**

Read: `src/pages/repasse/ui/RepassePage.tsx`

- [ ] **Step 2: Add usePageComparison with action `'repasse_page'`**

- [ ] **Step 3: Add DeltaBadge to 4 KPIs**

Total Contratos, Saldo Devedor Total, Índice de Repasse Médio, Restrições Cadastrais.

- [ ] **Step 4: Add ghost bars to BarChart**

- [ ] **Step 5: Add DeltaBadge to "Grupos de Estratégia" table**

On: Contratos, Saldo Nominal, Saldo Devedor columns. Match previous rows by Grupo key (G1-G4).

- [ ] **Step 6: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/repasse/ui/RepassePage.tsx
git commit -m "feat: add comparison mode to Repasse page (KPIs, chart, table)"
```

---

## Chunk 3: Page implementations — Batch 2 (Elegibilidade, Contratos)

These pages are more complex with multiple tabs and sub-sections.

### Task 8: Add comparison to Elegibilidade (Inadimplência) page

**Files:**
- Modify: `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`

**Reference:**
- Read `src/shared/hooks/useElegibilidade.ts` for the current hook params
- Page has 4 KPIs, multiple tabs (LTV e Inadimplência, Por Safra, Por Faixa de Atraso, Matriz de Cobrança, Restrições Cadastrais), charts, and tables

- [ ] **Step 1: Read the current ElegibilidadePage.tsx thoroughly**

Read: `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`

- [ ] **Step 2: Add usePageComparison with action `'elegibilidade_page'`**

- [ ] **Step 3: Add DeltaBadge to 4 KPIs**

Contratos Inadimplentes, Valor em Atraso, Inadimplência %, Total de Contratos.
Note: for Inadimplência %, use `positiveIsGood={false}` since lower is better.

- [ ] **Step 4: Add comparison to charts**

For BarChart stacked and ComposedChart — ghost bars and dashed lines.

- [ ] **Step 5: Add DeltaBadge to "Faixa de Atraso" table**

On: Total Contratos, Valor Atraso, Saldo Devedor. Match by faixa key.

- [ ] **Step 6: Add DeltaBadge to other tab tables where applicable**

Safra table, Matriz de Cobrança — match by respective keys.

- [ ] **Step 7: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/elegibilidade/ui/ElegibilidadePage.tsx
git commit -m "feat: add comparison mode to Elegibilidade page (KPIs, charts, tables)"
```

---

### Task 9: Add comparison to Contratos page

**Files:**
- Modify: `src/pages/contratos/ui/ContratosPage.tsx`

**Reference:**
- Read `src/shared/hooks/useContratos.ts` for the current hook params
- Page has tabs (Resumo por Empreendimento, Unidades Comercializadas, Visão Macro de Rating), charts, and tables

- [ ] **Step 1: Read the current ContratosPage.tsx thoroughly**

Read: `src/pages/contratos/ui/ContratosPage.tsx`

- [ ] **Step 2: Add usePageComparison with action `'contratos_page'`**

- [ ] **Step 3: Add comparison to charts**

BarChart stacked (by rating) and ComposedChart — ghost bars and dashed lines.

- [ ] **Step 4: Add DeltaBadge to "Resumo por Empreendimento" table**

On: Total Contratos, Saldo Devedor, Inadimplência %, Valor Atraso. Match by Projeto key.

- [ ] **Step 5: Add DeltaBadge to "Unidades Comercializadas" table if applicable**

- [ ] **Step 6: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/contratos/ui/ContratosPage.tsx
git commit -m "feat: add comparison mode to Contratos page (charts, tables)"
```

---

## Chunk 4: Page implementations — Batch 3 (Pagamentos, Fluxo de Caixa)

These pages do NOT use advancedFilters and Pagamentos needs a backend change.

### Task 10: Backend — Add startDate support to pagamentos_evolucao

**Files:**
- Modify: `src/shared/lib/bigquery/queries.ts` — add `startDate` param to `queryPagamentosEvolucao`
- Modify: `app/api/bigquery/route.ts` — forward `startDate` for `pagamentos_evolucao` action

- [ ] **Step 1: Read the current queryPagamentosEvolucao function**

Read: `src/shared/lib/bigquery/queries.ts` (find `queryPagamentosEvolucao`)

- [ ] **Step 2: Add optional startDate parameter**

Modify `queryPagamentosEvolucao` signature to accept `startDate?: string`. When provided, add `AND data_base_report >= @startDate` to the WHERE clause and bind the parameter.

- [ ] **Step 3: Forward startDate in the API route**

In `app/api/bigquery/route.ts`, in the `pagamentos_evolucao` case block, extract `startDate` from params and pass it to `queryPagamentosEvolucao`.

- [ ] **Step 4: Verify build**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/bigquery/queries.ts app/api/bigquery/route.ts
git commit -m "feat: add startDate support to pagamentos_evolucao query"
```

---

### Task 11: Add comparison to Pagamentos page

**Files:**
- Modify: `src/pages/pagamentos/ui/PagamentosPage.tsx`

**Reference:**
- Read `src/shared/hooks/usePagamentos.ts` — uses `dataBase`, `projeto`, `dataset` (no advancedFilters)
- Page has a table (Detalhamento dos Pagamentos) and a stacked BarChart (Composição dos Pagamentos)
- This is a time-series page: data has rows per month

- [ ] **Step 1: Read the current PagamentosPage.tsx**

Read: `src/pages/pagamentos/ui/PagamentosPage.tsx`

- [ ] **Step 2: Add usePageComparison**

For Pagamentos, the hook must also send `startDate: comparePeriod?.start` since this is a time-series query:

```typescript
const { previousData: prevPag, loading: cmpLoading } = usePageComparison<typeof pagData>({
  action: 'pagamentos_evolucao',
  params: { dataBase, projeto, dataset, startDate: comparePeriod?.start },
});
```

Access `comparePeriod` from `useDataFilters()`.

- [ ] **Step 3: Add ghost bars to stacked BarChart**

Use `mergeComparisonData` to add `prev_*` fields per payment type. Merge by month index within period.

- [ ] **Step 4: Add DeltaBadge to Detalhamento table**

On: Pagamento antecipado, Vencimento na referência, Recuperação mês anterior. Match by month (data_base_report).

- [ ] **Step 5: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/pagamentos/ui/PagamentosPage.tsx
git commit -m "feat: add comparison mode to Pagamentos page (chart, table)"
```

---

### Task 12: Add comparison to Fluxo de Caixa page

**Files:**
- Modify: `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`

**Reference:**
- Read `src/shared/hooks/useFluxoCaixa.ts` — uses `dataBase`, `projeto`, `dataset` (no advancedFilters)
- Page has ComposedChart (contratado vs esperado) and BarChart (fluxo esperado mensal)

- [ ] **Step 1: Read the current FluxoDeCaixaPage.tsx**

Read: `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`

- [ ] **Step 2: Add usePageComparison with action `'fluxo_caixa'`**

- [ ] **Step 3: Add dashed comparison lines to ComposedChart**

For "Fluxo Contratado" and "Fluxo Esperado" — add dashed line series with `opacity={0.4}`.

- [ ] **Step 4: Add ghost bars to BarChart (fluxo esperado mensal)**

- [ ] **Step 5: Add DeltaBadge to table cells if table exists**

- [ ] **Step 6: Verify and commit**

```bash
pnpm build 2>&1 | tail -5
git add src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx
git commit -m "feat: add comparison mode to Fluxo de Caixa page (charts)"
```

---

## Chunk 5: Final verification

### Task 13: End-to-end verification

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 2: Visual verification in browser**

Open each page with comparison mode enabled:
1. `/pdd` — KPI badges, chart ghost bars, table DeltaBadges
2. `/pricing` — KPI badges, table DeltaBadges
3. `/simulacao` — KPI badges, chart ghost bars
4. `/repasse` — KPI badges, chart ghost bars, table DeltaBadges
5. `/elegibilidade` — KPI badges, charts, table DeltaBadges
6. `/contratos` — charts, table DeltaBadges
7. `/pagamentos` — chart ghost bars, table DeltaBadges
8. `/fluxo-de-caixa` — chart comparison lines/bars

- [ ] **Step 3: Verify comparison off state**

Toggle comparison off. Verify no DeltaBadges or ghost series appear on any page.

- [ ] **Step 4: Verify no extra network requests when comparison disabled**

Open browser DevTools Network tab. Navigate between pages with comparison OFF. Confirm no `cmp-` prefixed requests.

- [ ] **Step 5: Final commit**

If any fixes were needed during verification, commit them.
