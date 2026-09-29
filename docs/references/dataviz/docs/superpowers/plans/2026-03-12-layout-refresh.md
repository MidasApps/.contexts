# Layout Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Liquid DataViz dashboard with better spacing, contrast, sparklines in KPI cards, month range picker, and multi-select enterprise filter.

**Architecture:** Incremental changes to existing components. New UI primitives (MonthRangePicker, MultiSelectCombobox) are standalone Radix-based components. DataProvider gets new fields with backward-compatible aliases so all 12 hooks keep working during migration.

**Tech Stack:** Next.js App Router, Tailwind CSS v4 (@theme with OKLCH), Recharts, Shadcn UI (Radix), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-layout-refresh-design.md`

---

## Chunk 1: Theme, Background & Comment Cleanup

### Task 1: Update theme tokens in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Update color tokens and remove comments**

Replace the theme block. Remove all comment blocks (`/* === ... */`, `/* --- ... --- */`). Update these tokens:

```css
--color-background: oklch(3.5% 0.005 280);
--color-card: oklch(7% 0.003 280);
--color-popover: oklch(9% 0.003 280);
--color-border: oklch(16% 0.005 280);
--color-input: oklch(20% 0.005 280);
```

Keep all other tokens unchanged. Remove these comment lines:
- `/* ============================================ Liquid DataViz ... */` (lines 3-6)
- `/* --- Fonts --- */` (line 9)
- `/* --- Colors --- */` (line 14)
- `/* --- Chart Colors --- */` (line 44)
- `/* --- Spacing ... --- */` (line 54)
- `/* --- Radius --- */` (line 57)
- `/* --- Shadows ... --- */` (line 63)
- `/* --- Animations --- */` (line 68)
- `/* --- Easing ... --- */` (line 77)
- `/* --- Base Styles --- */` (line 119)
- `/* --- Reduced motion --- */` (line 134)

- [ ] **Step 2: Verify build compiles**

Run: `pnpm build` or `pnpm dev` — check no CSS compilation errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: update theme tokens for better contrast and cold undertone"
```

---

### Task 2: Refine gradient blobs in DashboardLayout

**Files:**
- Modify: `src/app/layouts/DashboardLayout.tsx`

- [ ] **Step 1: Update blobs and remove all JSX comments**

Replace the entire blob container div (lines 24-28) with:

```tsx
<div className="pointer-events-none absolute inset-0 overflow-hidden">
  <div className="absolute top-[-10%] left-[-10%] h-[700px] w-[700px] rounded-full bg-primary/20 blur-[160px] mix-blend-screen opacity-60" />
  <div className="absolute bottom-[-10%] right-[-10%] h-[800px] w-[800px] rounded-full bg-primary/10 blur-[180px] mix-blend-screen opacity-40" />
  <div className="absolute top-[40%] left-[60%] h-[500px] w-[500px] rounded-full bg-violet-600/[0.08] blur-[140px] mix-blend-screen opacity-30" />
  <div className="absolute top-[-5%] right-[20%] h-[400px] w-[400px] rounded-full bg-primary/5 blur-[120px] mix-blend-screen opacity-20" />
</div>
```

Remove ALL JSX comments from the file:
- `{/* Abstract animated backgrounds */}` (line 23)
- `{/* Desktop nav sidebar */}` (line 30)
- `{/* Mobile nav sidebar drawer */}` (line 35)
- `{/* Main content area — pb-16 on mobile for bottom tab bar */}` (line 43)
- `{/* AI Sidebar - desktop */}` (line 52)
- `{/* AI Sidebar - mobile (full-screen sheet) */}` (line 57)
- `{/* Mobile bottom tab bar */}` (line 65)

- [ ] **Step 2: Commit**

```bash
git add src/app/layouts/DashboardLayout.tsx
git commit -m "style: refine gradient blobs and remove comments from layout"
```

---

### Task 3: Adjust card hover state

**Files:**
- Modify: `src/shared/ui/card.tsx`

- [ ] **Step 1: Update Card hover class**

In `card.tsx` line 10, change `hover:bg-white/[0.07]` to `hover:bg-white/[0.08]`.

- [ ] **Step 2: Commit**

```bash
git add src/shared/ui/card.tsx
git commit -m "style: increase card hover opacity for better contrast"
```

---

### Task 4: Remove comments from chart-theme.ts

**Files:**
- Modify: `src/shared/config/chart-theme.ts`

- [ ] **Step 1: Remove all comments**

Remove these lines:
- Line 1: `// Recharts theme configuration matching Liquid design tokens`
- Line 2: `// All chart colors use CSS variables for consistency`
- Line 5: `// chart-1: orange`
- Line 6: `// chart-2: olive`
- Line 7: `// chart-3: light orange`
- Line 8: `// chart-4: olive light`
- Line 9: `// chart-5: dark orange`
- Line 10: `// chart-6: gray`
- Line 11: `// chart-7: mid gray`
- Line 12: `// chart-8: brown`

- [ ] **Step 2: Commit**

```bash
git add src/shared/config/chart-theme.ts
git commit -m "chore: remove comments from chart-theme"
```

---

### Task 5: Remove comments from KpiCard.tsx

**Files:**
- Modify: `src/widgets/kpi-grid/ui/KpiCard.tsx`

- [ ] **Step 1: Remove JSDoc comments from props**

Remove these lines:
- Line 15: `/** Period comparison data */`
- Line 20: `/** Whether positive delta is good (default true). Inverts color when false. */`
- Line 26: `/** Animation delay index for staggered entrance */`

- [ ] **Step 2: Commit**

```bash
git add src/widgets/kpi-grid/ui/KpiCard.tsx
git commit -m "chore: remove comments from KpiCard"
```

---

### Task 6: Remove comments from all page files

**Files:**
- Modify: `src/pages/dashboard/ui/DashboardPage.tsx`
- Modify: `src/pages/contratos/ui/ContratosPage.tsx`
- Modify: `src/pages/simulacao/ui/SimulacaoPage.tsx`
- Modify: `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`
- Modify: `src/pages/repasse/ui/RepassePage.tsx`
- Modify: `src/pages/anexos-pdd/ui/AnexosPddPage.tsx`
- Modify: `src/pages/anexos-rating/ui/AnexosRatingPage.tsx`
- Modify: `src/shared/hooks/useQuery.ts`

- [ ] **Step 1: Remove comments from DashboardPage.tsx**

Remove:
- Line 95: `{/* Left: KPIs in 2x3 grid */}`
- Line 113: `{/* Right: Table */}`

- [ ] **Step 2: Remove comments from ContratosPage.tsx**

Remove:
- `{/* Rating x Empreendimento - horizontal 100% stacked bar */}` (line 152)
- `{/* Legend below the chart */}` (line 177)
- `{/* Evolucao do Valor em Atraso - stacked bar by rating */}` (line 236)

- [ ] **Step 3: Remove comments from SimulacaoPage.tsx**

Remove:
- `// LTV x LTV Stress cross-tab` (line 16)

- [ ] **Step 4: Remove comments from ElegibilidadePage.tsx**

Remove ALL JSX and inline comments (13 total):
- `// ===== Issue 1: LTV tab ...` (line 33)
- `{/* ===== Issue 1: LTV Tab ... */}` (line 193)
- `{/* 2 KPI cards */}` (line 205)
- `{/* Faixa Atraso table with footer */}` (line 211)
- `{/* LTV - Saldo Devedor a VP / Valor do Imovel bar chart */}` (line 219)
- `{/* Safra Tab */}` (line 234)
- `{/* ===== Issue 2: Faixa de Atraso Tab ... */}` (line 258)
- `{/* Chart 1: ... */}` (line 271)
- `{/* Chart 2: ... */}` (line 294)
- `{/* Chart 3: ... */}` (line 319)
- `{/* Chart 4: ... */}` (line 344)
- `{/* Matriz Cobranca Tab */}` (line 372)
- `{/* Restricoes Tab */}` (line 377)

- [ ] **Step 5: Remove comments from RepassePage.tsx**

Remove:
- `{/* Main grupos table with all columns */}` (line 123)
- `{/* Saldo Devedor por Grupo bar chart */}` (line 131)
- `{/* Descricao dos Grupos reference table */}` (line 145)

- [ ] **Step 6: Remove comments from AnexosPddPage.tsx**

Remove:
- `{/* LEFT column */}` (line 43)
- `{/* RIGHT column */}` (line 53)

- [ ] **Step 7: Remove comments from AnexosRatingPage.tsx**

Remove:
- `{/* LEFT column */}` (line 42)
- `{/* RIGHT column */}` (line 59)

- [ ] **Step 8: Remove comments from useQuery.ts**

Remove:
- `// Simple in-memory cache (SWR-style stale-while-revalidate)` (line 24)
- JSDoc comment block (lines 88-92)

- [ ] **Step 9: Commit**

```bash
git add src/pages/ src/shared/hooks/useQuery.ts
git commit -m "chore: remove all comments from pages and hooks"
```

---

## Chunk 2: Spacing Updates

### Task 7: Update KpiGrid gap

**Files:**
- Modify: `src/widgets/kpi-grid/ui/KpiGrid.tsx`

- [ ] **Step 1: Change gap-3 to gap-4**

In `KpiGrid.tsx`, change the base `gap-3` class to `gap-4` (line 13 in the `cn()` call).

- [ ] **Step 2: Commit**

```bash
git add src/widgets/kpi-grid/ui/KpiGrid.tsx
git commit -m "style: increase KPI grid gap for more breathing room"
```

---

### Task 8: Update KpiCard padding

**Files:**
- Modify: `src/widgets/kpi-grid/ui/KpiCard.tsx`

- [ ] **Step 1: Change p-5 to p-6 in CardContent**

Two places in KpiCard.tsx:
- Loading skeleton state (line 42): `p-5` -> `p-6`
- Main render (line 72): `p-5` -> `p-6`

- [ ] **Step 2: Commit**

```bash
git add src/widgets/kpi-grid/ui/KpiCard.tsx
git commit -m "style: increase KPI card padding"
```

---

### Task 9: Update spacing in all pages

**Files (all pages):**
- Modify: `src/pages/dashboard/ui/DashboardPage.tsx`
- Modify: `src/pages/contratos/ui/ContratosPage.tsx`
- Modify: `src/pages/pagamentos/ui/PagamentosPage.tsx`
- Modify: `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`
- Modify: `src/pages/pdd/ui/PddPage.tsx`
- Modify: `src/pages/pricing/ui/PricingPage.tsx`
- Modify: `src/pages/simulacao/ui/SimulacaoPage.tsx`
- Modify: `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`
- Modify: `src/pages/repasse/ui/RepassePage.tsx`
- Modify: `src/pages/detalhamento/ui/DetalhamentoPage.tsx`
- Modify: `src/pages/anexos-elegibilidade/ui/AnexosElegibilidadePage.tsx`
- Modify: `src/pages/anexos-pdd/ui/AnexosPddPage.tsx`
- Modify: `src/pages/anexos-rating/ui/AnexosRatingPage.tsx`

Apply these replacements across ALL page files:

- [ ] **Step 1: Update padding and section spacing**

In every page file, apply these changes:
- `p-4 lg:p-6` -> `p-5 lg:p-8` (main content padding)
- `space-y-6` -> `space-y-8` (section gaps)
- `space-y-4` -> `space-y-6` (sub-section gaps)
- `gap-3` -> `gap-4` (grid gaps — but NOT inside non-KPI contexts; check each occurrence)

Do NOT change:
- `gap-6` — already at target
- `gap-1`, `gap-1.5`, `gap-2` — these are micro-gaps in trend/comparison rows, leave them

- [ ] **Step 2: Verify build**

Run: `pnpm dev` — visually check dashboard page loads without errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ src/pages/anexos-*/
git commit -m "style: increase spacing across all pages for more breathing room"
```

---

## Chunk 3: KPI Card Sparkline

### Task 10: Add Sparkline component to KpiCard

**Files:**
- Modify: `src/widgets/kpi-grid/ui/KpiCard.tsx`

- [ ] **Step 1: Add sparklineData prop to interface**

Add to the `KpiCardProps` interface:

```typescript
sparklineData?: number[];
```

- [ ] **Step 2: Add sparkline color derivation function**

Add this function at the bottom of the file (after `getComparisonColor`):

```typescript
function getSparklineColor(
  data: number[],
  positiveIsGood: boolean = true,
): string {
  const first = data[0];
  const last = data[data.length - 1];
  if (last > first) return positiveIsGood ? 'var(--color-success)' : 'var(--color-destructive)';
  if (last < first) return positiveIsGood ? 'var(--color-destructive)' : 'var(--color-success)';
  return 'var(--color-muted-foreground)';
}
```

- [ ] **Step 3: Add sparkline rendering inside the component**

Add imports at the top:

```typescript
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
```

Add `sparklineData` to the destructured props.

After the `{comparison && ...}` block (after the closing `</div>` of the comparison section, around line 109), add:

```tsx
{sparklineData && sparklineData.length >= 2 && (
  <div className="mt-3 h-9 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={sparklineData.map((v) => ({ v }))}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <defs>
          <linearGradient id={`sparkline-fill-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={getSparklineColor(sparklineData, comparison?.positiveIsGood)} stopOpacity={0.15} />
            <stop offset="100%" stopColor={getSparklineColor(sparklineData, comparison?.positiveIsGood)} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="v"
          stroke={getSparklineColor(sparklineData, comparison?.positiveIsGood)}
          strokeWidth={1.5}
          dot={false}
          fill={`url(#sparkline-fill-${label})`}
          fillOpacity={1}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
)}
```

- [ ] **Step 4: Add skeleton sparkline to loading state**

In the loading return block, after the second `<Skeleton>`, add:

```tsx
<Skeleton className="h-9 w-full mt-3 bg-white/10" />
```

- [ ] **Step 5: Verify build**

Run: `pnpm dev` — KPI cards should render without sparklines (no data passed yet). No errors.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/kpi-grid/ui/KpiCard.tsx
git commit -m "feat: add sparkline support to KpiCard"
```

---

### Task 11: Pass sparkline data in DashboardPage

**Files:**
- Modify: `src/pages/dashboard/ui/DashboardPage.tsx`

- [ ] **Step 1: Add mock sparkline data for visual testing**

After the `const { data: faixaData, ... }` line, add temporary mock data:

```typescript
const mockSparklines = {
  total_contratos: [240, 245, 252, 258, 265, 270, 274, 276, 278],
  saldo_nominal: [380e6, 390e6, 400e6, 410e6, 420e6, 430e6, 435e6, 440e6, 443.4e6],
  saldo_devedor: [360e6, 370e6, 380e6, 390e6, 395e6, 400e6, 410e6, 415e6, 419.47e6],
  valor_atraso: [1.8e6, 1.9e6, 2.0e6, 1.95e6, 2.1e6, 2.05e6, 2.1e6, 2.15e6, 2.17e6],
  inadimplencia_pct: [0.55, 0.53, 0.52, 0.51, 0.50, 0.50, 0.49, 0.49, 0.49],
  over_90: [0.35, 0.34, 0.33, 0.32, 0.31, 0.30, 0.30, 0.29, 0.29],
};
```

- [ ] **Step 2: Pass sparklineData to each KpiCard**

Update each KpiCard to include `sparklineData`:

```tsx
<KpiCard label="Total Contratos" value={formatNumber(summary?.total_contratos ?? 278)} sparklineData={mockSparklines.total_contratos} animationIndex={0} />
<KpiCard label="Saldo Nominal" value={formatCurrency(summary?.saldo_nominal ?? 443.4e6)} sparklineData={mockSparklines.saldo_nominal} animationIndex={1} />
<KpiCard label="Saldo Devedor" value={formatCurrency(summary?.saldo_devedor ?? 419.47e6)} sparklineData={mockSparklines.saldo_devedor} animationIndex={2} />
<KpiCard label="Valor Atraso" value={formatCurrency(summary?.valor_atraso ?? 2.17e6)} sparklineData={mockSparklines.valor_atraso} animationIndex={3} />
<KpiCard label="Inadimplencia %" value={formatPercent(summary?.inadimplencia_pct ?? 0.49)} sparklineData={mockSparklines.inadimplencia_pct} animationIndex={4} />
<KpiCard label="Over 90%" value={formatPercent(summary?.contratos_com_atraso ?? 0.29)} sparklineData={mockSparklines.over_90} animationIndex={5} />
```

- [ ] **Step 3: Verify visually**

Run: `pnpm dev` — navigate to `/dashboard`. Each KPI card should show a small sparkline below the value/trend area.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/ui/DashboardPage.tsx
git commit -m "feat: add sparkline data to dashboard KPI cards"
```

---

## Chunk 4: DataProvider Migration

### Task 12: Update DataProvider with dateRange and projetos

**Files:**
- Modify: `src/shared/providers/DataProvider.tsx`

- [ ] **Step 1: Update interfaces and state**

Replace the entire file content with:

```typescript
'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

export interface DatePeriod {
  start: string;
  end: string;
}

export interface DateRange {
  start: string;
  end: string;
}

interface DataFilters {
  dateRange: DateRange;
  projetos: string[];
  comparePeriod: DatePeriod | null;
  compareEnabled: boolean;
}

interface DataFiltersContextValue extends DataFilters {
  setDateRange: (range: DateRange) => void;
  setProjetos: (projetos: string[]) => void;
  setComparePeriod: (period: DatePeriod | null) => void;
  setCompareEnabled: (enabled: boolean) => void;
  projetoOptions: string[];
  // Backward-compatible aliases
  dataBase: string;
  projeto: string;
  setDataBase: (value: string) => void;
  setProjeto: (value: string) => void;
  dataBaseOptions: { value: string; label: string }[];
}

const DataFiltersContext = createContext<DataFiltersContextValue | null>(null);

const DEFAULT_DATA_BASE_OPTIONS = [
  { value: '2026-01-31', label: 'jan. de 2026' },
  { value: '2025-12-31', label: 'dez. de 2025' },
  { value: '2025-11-30', label: 'nov. de 2025' },
  { value: '2025-10-31', label: 'out. de 2025' },
  { value: '2025-09-30', label: 'set. de 2025' },
  { value: '2025-08-31', label: 'ago. de 2025' },
  { value: '2025-07-31', label: 'jul. de 2025' },
  { value: '2025-06-30', label: 'jun. de 2025' },
  { value: '2025-05-31', label: 'mai. de 2025' },
];

const DEFAULT_PROJETO_OPTIONS = ['AUTORIA BY ORNARE', 'BOSSA OM HOME'];

interface DataProviderProps {
  children: ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const [dateRange, setDateRange] = useState<DateRange>({
    start: DEFAULT_DATA_BASE_OPTIONS[DEFAULT_DATA_BASE_OPTIONS.length - 1].value,
    end: DEFAULT_DATA_BASE_OPTIONS[0].value,
  });
  const [projetos, setProjetos] = useState<string[]>(DEFAULT_PROJETO_OPTIONS);
  const [comparePeriod, setComparePeriod] = useState<DatePeriod | null>(null);
  const [compareEnabled, setCompareEnabledState] = useState(false);

  const handleSetCompareEnabled = useCallback((enabled: boolean) => {
    setCompareEnabledState(enabled);
    if (!enabled) {
      setComparePeriod(null);
    }
  }, []);

  const setDataBase = useCallback((value: string) => {
    setDateRange((prev) => ({ ...prev, end: value }));
  }, []);

  const setProjeto = useCallback((value: string) => {
    setProjetos([value]);
  }, []);

  const value = useMemo<DataFiltersContextValue>(() => ({
    dateRange,
    projetos,
    comparePeriod,
    compareEnabled,
    setDateRange,
    setProjetos,
    setComparePeriod,
    setCompareEnabled: handleSetCompareEnabled,
    projetoOptions: DEFAULT_PROJETO_OPTIONS,
    dataBase: dateRange.end,
    projeto: projetos[0] ?? '',
    setDataBase,
    setProjeto,
    dataBaseOptions: DEFAULT_DATA_BASE_OPTIONS,
  }), [dateRange, projetos, comparePeriod, compareEnabled, handleSetCompareEnabled, setDataBase, setProjeto]);

  return (
    <DataFiltersContext.Provider value={value}>
      {children}
    </DataFiltersContext.Provider>
  );
}

export function useDataFilters(): DataFiltersContextValue {
  const ctx = useContext(DataFiltersContext);
  if (!ctx) {
    throw new Error('useDataFilters deve ser usado dentro de <DataProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: Verify all existing hooks still compile**

Run: `pnpm build` — all hooks use `const { dataBase, projeto } = useDataFilters()` which still works via aliases.

- [ ] **Step 3: Commit**

```bash
git add src/shared/providers/DataProvider.tsx
git commit -m "feat: add dateRange and projetos[] to DataProvider with backward-compat aliases"
```

---

## Chunk 5: MonthRangePicker

### Task 13: Create MonthRangePicker component

**Files:**
- Create: `src/shared/ui/month-range-picker.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface MonthRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  minDate?: string;
  maxDate?: string;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function monthIsBefore(a: string, b: string): boolean {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  return pa.year < pb.year || (pa.year === pb.year && pa.month < pb.month);
}

function monthIsAfter(a: string, b: string): boolean {
  return monthIsBefore(b, a);
}

function monthsEqual(a: string, b: string): boolean {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  return pa.year === pb.year && pa.month === pb.month;
}

function formatTriggerLabel(start: string, end: string): string {
  const s = parseYearMonth(start);
  const e = parseYearMonth(end);
  const fmt = (ym: { year: number; month: number }) =>
    `${MONTHS[ym.month].toLowerCase()}/${ym.year}`;
  if (s.year === e.year && s.month === e.month) return fmt(s);
  return `${fmt(s)} — ${fmt(e)}`;
}

function monthInRange(dateStr: string, start: string, end: string): boolean {
  return !monthIsBefore(dateStr, start) && !monthIsAfter(dateStr, end);
}

export function MonthRangePicker({
  startDate,
  endDate,
  onRangeChange,
  minDate = '2025-05-31',
  maxDate = '2026-01-31',
}: MonthRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseYearMonth(endDate).year);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = useState(startDate);

  const handleMonthClick = useCallback(
    (year: number, month: number) => {
      const dateStr = lastDayOfMonth(year, month);

      if (selecting === 'start') {
        setTempStart(dateStr);
        setSelecting('end');
      } else {
        let start = tempStart;
        let end = dateStr;
        if (monthIsBefore(end, start)) {
          [start, end] = [end, start];
        }
        onRangeChange(start, end);
        setSelecting('start');
        setOpen(false);
      }
    },
    [selecting, tempStart, onRangeChange],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSelecting('start');
        setTempStart(startDate);
        setViewYear(parseYearMonth(endDate).year);
      }
    },
    [startDate, endDate],
  );

  const minParsed = parseYearMonth(minDate);
  const maxParsed = parseYearMonth(maxDate);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-auto min-w-[140px] justify-start gap-2 px-3 text-sm font-normal"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{formatTriggerLabel(startDate, endDate)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4" align="start">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            disabled={viewYear <= minParsed.year}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display font-semibold text-sm">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            disabled={viewYear >= maxParsed.year}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Proximo ano"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          {selecting === 'start' ? 'Selecione o mes inicial' : 'Selecione o mes final'}
        </p>

        <div role="grid" className="grid grid-cols-4 gap-1.5">
          {MONTHS.map((name, i) => {
            const dateStr = lastDayOfMonth(viewYear, i);
            const isDisabled =
              (viewYear < minParsed.year || (viewYear === minParsed.year && i < minParsed.month)) ||
              (viewYear > maxParsed.year || (viewYear === maxParsed.year && i > maxParsed.month));

            const isStart = monthsEqual(dateStr, startDate);
            const isEnd = monthsEqual(dateStr, endDate);
            const isInRange = monthInRange(dateStr, startDate, endDate);
            const isTempStart = selecting === 'end' && monthsEqual(dateStr, tempStart);

            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                disabled={isDisabled}
                aria-selected={isStart || isEnd}
                aria-disabled={isDisabled}
                onClick={() => handleMonthClick(viewYear, i)}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
                  'hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                  isDisabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                  !isDisabled && !isStart && !isEnd && !isTempStart && isInRange && 'bg-primary/10 text-primary',
                  (isStart || isEnd) && 'bg-primary text-primary-foreground',
                  isTempStart && 'bg-primary/60 text-primary-foreground',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm dev` — no errors (component not used yet).

- [ ] **Step 3: Commit**

```bash
git add src/shared/ui/month-range-picker.tsx
git commit -m "feat: create MonthRangePicker component"
```

---

## Chunk 6: MultiSelectCombobox

### Task 14: Create MultiSelectCombobox component

**Files:**
- Create: `src/shared/ui/multi-select-combobox.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';

interface MultiSelectComboboxProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

function getTriggerLabel(selected: string[], total: number): string {
  if (selected.length === 0) return 'Nenhum selecionado';
  if (selected.length === total) return 'Todos os empreendimentos';
  if (selected.length === 1) return selected[0];
  return `${selected.length} empreendimentos`;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Empreendimentos',
  searchPlaceholder = 'Buscar empreendimentos...',
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(lower));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleItem = useCallback(
    (item: string) => {
      const next = selectedSet.has(item)
        ? selected.filter((s) => s !== item)
        : [...selected, item];
      onChange(next);
    },
    [selected, selectedSet, onChange],
  );

  const selectOnly = useCallback(
    (item: string) => {
      onChange([item]);
    },
    [onChange],
  );

  const selectAll = useCallback(() => onChange([...options]), [options, onChange]);
  const selectNone = useCallback(() => onChange([]), [onChange]);

  const triggerLabel = getTriggerLabel(selected, options.length);
  const isWarning = selected.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-auto min-w-[140px] max-w-[220px] justify-between gap-2 px-3 text-sm font-normal',
            isWarning && 'border-destructive/50 text-destructive',
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3 pb-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="max-h-[200px] overflow-y-auto px-1">
          {filtered.map((item) => {
            const isSelected = selectedSet.has(item);
            return (
              <div
                key={item}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/10 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-white/20 bg-transparent',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate text-sm">{item}</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectOnly(item)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-foreground transition-all md:opacity-0 max-md:opacity-60"
                >
                  somente
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhum resultado
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            Nenhum
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm dev` — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ui/multi-select-combobox.tsx
git commit -m "feat: create MultiSelectCombobox with search and 'somente' button"
```

---

## Chunk 7: GlobalFilters Integration

### Task 15: Integrate new filter components into GlobalFilters

**Files:**
- Modify: `src/widgets/global-filters/ui/GlobalFilters.tsx`

- [ ] **Step 1: Replace the entire GlobalFilters component**

```tsx
'use client';

import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { MultiSelectCombobox } from '@/shared/ui/multi-select-combobox';
import { Switch } from '@/shared/ui/switch';
import { useDataFilters } from '@/shared/providers/DataProvider';

export function GlobalFilters() {
  let ctx: ReturnType<typeof useDataFilters> | null = null;
  try {
    ctx = useDataFilters();
  } catch {
    return null;
  }

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <MonthRangePicker
        startDate={ctx.dateRange.start}
        endDate={ctx.dateRange.end}
        onRangeChange={(start, end) => ctx!.setDateRange({ start, end })}
      />

      <MultiSelectCombobox
        options={ctx.projetoOptions}
        selected={ctx.projetos}
        onChange={ctx.setProjetos}
      />

      <div className="hidden items-center gap-2 sm:flex">
        <Switch
          checked={ctx.compareEnabled}
          onCheckedChange={ctx.setCompareEnabled}
          aria-label="Comparar periodos"
        />
        <span className="hidden text-xs text-muted-foreground whitespace-nowrap md:inline">
          Comparar
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build and visual check**

Run: `pnpm dev` — navigate to `/dashboard`:
- MonthRangePicker should show the date range trigger
- MultiSelectCombobox should show "Todos os empreendimentos"
- Compare toggle should still work

- [ ] **Step 3: Commit**

```bash
git add src/widgets/global-filters/ui/GlobalFilters.tsx
git commit -m "feat: integrate MonthRangePicker and MultiSelectCombobox into GlobalFilters"
```

---

### Task 16: Final visual verification

- [ ] **Step 1: Full visual check**

Run `pnpm dev` and navigate through all pages:
- `/dashboard` — KPIs with sparklines, new filters, updated spacing
- `/contratos` — updated spacing, no comments
- `/pagamentos` — updated spacing
- `/fluxo-de-caixa` — updated spacing
- `/pdd` — updated spacing
- `/pricing` — updated spacing
- `/simulacao` — updated spacing
- `/elegibilidade` — updated spacing, no comments
- `/repasse` — updated spacing, no comments
- `/detalhamento` — updated spacing
- `/anexos/rating` — updated spacing, no comments
- `/anexos/pdd` — updated spacing, no comments
- `/anexos/elegibilidade` — updated spacing

Check:
- Background gradient blobs are visible but not overwhelming
- Cards have glassmorphism effect (frosted look over blobs)
- Spacing feels more generous
- No JSX or inline comments remain in source

- [ ] **Step 2: Build check**

Run: `pnpm build` — should complete without errors.
