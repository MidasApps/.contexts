# Comparison Mode — All Pages

**Date:** 2026-03-14
**Status:** Approved

## Problem

Only the Visão Geral (Dashboard) page supports comparison mode. When the user toggles "Comparar períodos", the remaining 8 pages show no comparative data — no KPI deltas, no chart overlays, no table badges.

## Goal

Extend comparison mode to all applicable pages so that every KPI, chart, and table reflects the comparison period when enabled.

## Scope

### In scope (8 pages)

| Page | KPIs | Charts | Tables |
|------|------|--------|--------|
| Contratos | N/A | BarChart stacked, ComposedChart | Resumo por Empreendimento, Unidades Comercializadas |
| Pagamentos | N/A | BarChart composição % | Detalhamento dos Pagamentos |
| Fluxo de Caixa | N/A | ComposedChart, BarChart | Fluxo tables (if any) |
| PDD | PDD Liquid, Mín Bacen, Delta | BarChart grouped | Tabela por rating |
| Pricing | Pricing Total, Deságio | N/A (tables only) | Por Rating, Por Elegibilidade |
| Simulação | Contratos LTV>80%, Saldo | BarChart LTV por faixa | LTV table (if any) |
| Elegibilidade (Inadimplência) | Contratos, Valor Atraso, Inadimplência %, Total | BarChart stacked, ComposedChart | Faixa de Atraso, Safra, Matriz Cobrança |
| Repasse | Contratos, Saldo, Índice, Restrições | BarChart por grupo | Grupos de Estratégia |

### Out of scope

- **Detalhamento**: granular contract-level table, comparison not applicable.
- **Visão Geral**: already implemented.

## Architecture

### 1. Generic hook: `usePageComparison<T>`

**File:** `src/shared/hooks/usePageComparison.ts`

```typescript
interface UsePageComparisonOptions {
  action: string;
  params: Record<string, unknown>; // Must include all filters: projeto, advancedFilters, dataset
  enabled?: boolean;
}

interface UsePageComparisonResult<T> {
  previousData: T | undefined;
  loading: boolean;
  error: string | null;
}

function usePageComparison<T>(options: UsePageComparisonOptions): UsePageComparisonResult<T>
```

**Behavior:**
- Reads `compareEnabled` and `comparePeriod` from `useDataFilters()`.
- When active, calls `fetchBigQuery(action, { ...params, dataBase: comparePeriod.end })`.
- **Important:** Most page queries are point-in-time snapshots (`WHERE data_base_report = @dataBase`). Only `dataBase` changes; `startDate` is not relevant for these. For time-series queries like `pagamentos_evolucao`, the hook also sends `startDate: comparePeriod.start` to scope the range.
- Uses `useQuery` with cache key prefixed by `cmp-` to avoid collisions with current-period cache.
- Returns raw data from the comparison period. Delta computation is done by the page.
- **All current-period filters** (`projeto`, `advancedFilters`, `dataset`) must be forwarded in `params` so comparison queries use the same filter context.
- When `compareEnabled` is false or `comparePeriod` is null, returns `{ previousData: undefined, loading: false, error: null }`.

### 2. Delta utility: `calcDelta`

**File:** `src/shared/lib/comparison.ts`

```typescript
interface DeltaInfo {
  percent: number | null;  // null when previous is 0 and current is non-zero
  direction: 'up' | 'down' | 'neutral';
  formatted: string; // e.g., "+3.2%", "-1.5%", "—", "novo"
}

function calcDelta(current: number, previous: number): DeltaInfo
```

**Rules:**
- `percent = ((current - previous) / abs(previous)) * 100`
- If `abs(percent) < 0.1`, direction is `'neutral'`, formatted is `"—"`.
- If `previous === 0` and `current === 0`, return neutral.
- If `previous === 0` and `current !== 0`, return `{ percent: null, direction based on current sign, formatted: "novo" }`.

Also export:

```typescript
function mergeComparisonData<T extends Record<string, unknown>>(
  current: T[],
  previous: T[],
  keys: string[],
): Array<T & Record<string, unknown>>
```

**Merge rules:**
- Aligns by index within period (month 1 vs month 1).
- If arrays have different lengths, truncates to the shorter length.
- For each key in `keys`, adds a `prev_{key}` field from the previous array.
- Missing values are set to `undefined`.

### 3. Component: `DeltaBadge`

**File:** `src/shared/ui/delta-badge.tsx`

```typescript
interface DeltaBadgeProps {
  current: number;
  previous: number | null | undefined;
  positiveIsGood?: boolean; // default true
}
```

**Rendering:**
- Appears below the main value in a table cell.
- Format: `↑ 3.2%` in positive color or `↓ 1.5%` in negative color.
- Colors: use CSS custom properties `--color-delta-positive` and `--color-delta-negative` (defined in `globals.css`) to respect the theme system. Fallback to `#6ECB8A` and `#F27C7C`.
- Neutral (< 0.1%): `—` in `text-white/20`.
- If `previous` is null/undefined, renders nothing.
- Size: `text-[10px]` to not compete with the main value.
- Only visible when comparison is active (consumer responsibility to conditionally render).

**Loading state:** When comparison data is still loading, render a small skeleton pulse (`w-10 h-3`) in place of the badge.

### 4. Chart comparison pattern

**Data merge:**
Each chart's data array gains optional `prev_*` fields for each metric, using `mergeComparisonData` from `comparison.ts`.

Produces entries like:
```typescript
{ mes: 'jan/26', valor: 8210000, prev_valor: 7500000 }
```

**Rendering rules:**
- BarChart: comparison bars rendered with `opacity: 0.25`, positioned behind current bars.
- Line/Area in ComposedChart: comparison line with `strokeDasharray="5 5"` and `opacity: 0.4`.
- Tooltip: shows "Atual: R$ X" and "Anterior: R$ Y" with delta.

### 5. KPI card comparison

Pages with KPI-style cards (PDD, Simulação, Elegibilidade, Repasse, Pricing) render a `DeltaBadge` below the KPI value. Uses the same `calcDelta` utility. The existing `periodComparison` prop on KpiCard rich variant can be reused where applicable.

## Per-page implementation details

### Contratos (`useContratos` → action `contratos_page`)
- **Hook change:** Add `usePageComparison` with action `'contratos_page'` and same params (`dataBase`, `projeto`, `advancedFilters`, `dataset`).
- **Charts:** BarChart (stacked by rating) gets ghost bars. ComposedChart gets dashed comparison line.
- **Tables:** Resumo por Empreendimento — DeltaBadge on: Total Contratos, Saldo Devedor, Inadimplência %, Valor Atraso.

### Pagamentos (`usePagamentos` → action `pagamentos_evolucao`)
- **Hook change:** Add `usePageComparison` with action `'pagamentos_evolucao'`. This is a time-series query, so also send `startDate: comparePeriod.start` to scope the comparison window.
- **Charts:** Stacked BarChart gets ghost comparison bars.
- **Tables:** Detalhamento dos Pagamentos — DeltaBadge on: Pagamento antecipado, Vencimento na referência, Recuperação mês anterior.
- **Note:** The query returns rows per month. Merge by month index within respective periods.

### Fluxo de Caixa (`useFluxoCaixa` → action `fluxo_caixa`)
- **Hook change:** Add `usePageComparison` with action `'fluxo_caixa'`.
- **Charts:** ComposedChart (contratado vs esperado) gets dashed comparison lines. BarChart (fluxo esperado mensal) gets ghost bars.
- **Tables:** DeltaBadge on monetary columns if table exists.

### PDD (`usePdd` → action `pdd_page`)
- **Hook change:** Add `usePageComparison` with action `'pdd_page'`.
- **KPIs:** PDD Liquid, PDD Mín Bacen, Delta Total — add DeltaBadge.
- **Charts:** Grouped BarChart gets ghost bars for both PDD Liquid and PDD Mín Bacen.
- **Tables:** Tabela por rating — DeltaBadge on PDD values per rating.

### Pricing (`usePricing` → action `pricing_page`)
- **Hook change:** Add `usePageComparison` with action `'pricing_page'`.
- **KPIs:** Pricing Total, Deságio Médio — add DeltaBadge.
- **Charts:** N/A (tables only page).
- **Tables:** Por Rating Liquid — DeltaBadge on Saldo Devedor, Pricing, LTV. Por Elegibilidade — same pattern.

### Simulação (`useSimulacao` → action `simulacao_page`)
- **Hook change:** Add `usePageComparison` with action `'simulacao_page'`.
- **KPIs:** Contratos com LTV > 80%, Saldo Devedor — add DeltaBadge.
- **Charts:** BarChart (LTV por faixa) gets ghost bars.
- **Tables:** DeltaBadge on Saldo Devedor per faixa if table exists.

### Elegibilidade (`useElegibilidade` → action `elegibilidade_page`)
- **Hook change:** Add `usePageComparison` with action `'elegibilidade_page'`.
- **KPIs:** Contratos Inadimplentes, Valor em Atraso, Inadimplência %, Total Contratos — add DeltaBadge.
- **Charts:** BarChart stacked and ComposedChart get comparison series.
- **Tables:** Faixa de Atraso table — DeltaBadge on Total Contratos, Valor Atraso, Saldo Devedor.

### Repasse (`useRepasse` → action `repasse_page`)
- **Hook change:** Add `usePageComparison` with action `'repasse_page'`.
- **KPIs:** Total Contratos, Saldo Devedor, Índice Repasse, Restrições — add DeltaBadge.
- **Charts:** BarChart (saldo por grupo) gets ghost bars.
- **Tables:** Grupos de Estratégia — DeltaBadge on Contratos, Saldo Nominal, Saldo Devedor.

## Backend changes

**Minimal.** Most page queries are point-in-time snapshots (`WHERE data_base_report = @dataBase`), so changing `dataBase` to the comparison period date is sufficient.

**One exception:** `pagamentos_evolucao` returns all history up to `dataBase` without a start date filter. To scope the comparison window correctly, the `queryPagamentosEvolucao` function in `queries.ts` needs to accept an optional `startDate` parameter and add `AND data_base_report >= @startDate` when provided. The API route handler must also forward this parameter.

## Performance considerations

- Enabling comparison doubles BigQuery requests per page (current + comparison period).
- The 5-minute `useQuery` cache mitigates repeated fetches during navigation.
- Comparison data is lazy-loaded: only fetched when `compareEnabled` is true AND the user visits the page.
- The `cmp-` cache key prefix prevents collisions with current-period cache entries.

## Testing

- Toggle "Comparar períodos" on/off and verify all pages respond.
- Verify charts show/hide comparison series correctly.
- Verify DeltaBadge appears/disappears in tables.
- Verify KPI deltas render correctly with positive/negative trends.
- Verify no extra BigQuery calls when comparison is disabled.
- Verify cache keys don't collide between current and comparison data.
- Unit test `calcDelta` edge cases: both zeros, negative values, large deltas, previous=0 with current!=0.
- Unit test `mergeComparisonData` with mismatched array lengths.

## Files to create

- `src/shared/hooks/usePageComparison.ts`
- `src/shared/lib/comparison.ts`
- `src/shared/ui/delta-badge.tsx`

## Files to modify

- `src/shared/lib/bigquery/queries.ts` (add `startDate` support to `queryPagamentosEvolucao`)
- `app/api/bigquery/route.ts` (forward `startDate` for `pagamentos_evolucao`)
- `src/pages/contratos/ui/ContratosPage.tsx`
- `src/pages/pagamentos/ui/PagamentosPage.tsx`
- `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`
- `src/pages/pdd/ui/PddPage.tsx`
- `src/pages/pricing/ui/PricingPage.tsx`
- `src/pages/simulacao/ui/SimulacaoPage.tsx`
- `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`
- `src/pages/repasse/ui/RepassePage.tsx`
- `src/app/globals.css` (add `--color-delta-positive` and `--color-delta-negative` custom properties)
