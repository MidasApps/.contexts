# Phase 1: Header Simplification + Filter Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the header to show only breadcrumb + period picker + filters button, moving all other controls (view mode, comparison, filter badges) into the FilterPanel.

**Architecture:** The current `GlobalFilters` component in the header contains view mode toggle, comparison controls, filter badges, and date pickers. We extract the `MonthRangePicker` for the header and migrate everything else into `FilterPanel`. The `AppBar` gets a new breadcrumb prop for page context. All existing pages continue working with old routes.

**Tech Stack:** React, Tailwind CSS v4, Lucide React icons, shadcn/ui, Zustand, React Context (DataProvider)

**Spec:** `docs/superpowers/specs/2026-04-14-multi-report-dashboards-design.md` (Section 1 + 2)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/widgets/app-bar/ui/AppBar.tsx` | Add breadcrumb, period picker, filters button directly (no longer delegates to GlobalFilters) |
| Modify | `src/widgets/filter-panel/ui/FilterPanel.tsx` | Add Visualizacao (view mode) and Comparacao sections at the top |
| Modify | `src/widgets/global-filters/ui/GlobalFilters.tsx` | Simplify to thin wrapper: just period picker + filters button (or deprecate) |
| Modify | `src/widgets/global-filters/index.ts` | Update exports if needed |
| Skip | `src/pages/explore/ui/CanvasPanel.tsx` | Uses GlobalFilters standalone (not inside AppBar) — keep using deprecated stub, do NOT modify |
| Modify | `src/pages/dashboard/ui/DashboardPage.tsx` | Update AppBar usage (no more children override needed) |
| Modify | `src/pages/pdd/ui/PddPage.tsx` | Update AppBar usage |
| Modify | `src/pages/pricing/ui/PricingPage.tsx` | Update AppBar usage |
| Modify | `src/pages/simulacao/ui/SimulacaoPage.tsx` | Update AppBar usage |
| Modify | `src/pages/elegibilidade/ui/ElegibilidadePage.tsx` | Update AppBar usage |
| Modify | `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx` | Update AppBar usage |
| Modify | `src/pages/contratos/ui/ContratosPage.tsx` | Update AppBar usage |
| Modify | `src/pages/pagamentos/ui/PagamentosPage.tsx` | Update AppBar usage |
| Modify | `src/pages/detalhamento/ui/DetalhamentoPage.tsx` | Update AppBar usage |
| Modify | `src/pages/repasse/ui/RepassePage.tsx` | Update AppBar usage |
| Modify | `src/pages/anexos-rating/ui/AnexosRatingPage.tsx` | Update AppBar usage |
| Modify | `src/pages/anexos-elegibilidade/ui/AnexosElegibilidadePage.tsx` | Update AppBar usage |
| Modify | `src/pages/anexos-pdd/ui/AnexosPddPage.tsx` | Update AppBar usage |
| Modify | `src/features/admin/ui/AdminPage.tsx` | Update AppBar usage |

---

### Task 1: Add View Mode and Comparison sections to FilterPanel

**Files:**
- Modify: `src/widgets/filter-panel/ui/FilterPanel.tsx`

- [ ] **Step 1: Add view mode section to FilterPanel**

Add a new "Visualizacao" section at the top of the FilterPanel content area (before "Geral"), with the snapshot/accumulated toggle. Add the imports for `Camera`, `Layers`, `GitCompare`, and `MonthRangePicker`.

In `FilterPanel.tsx`, add the new imports:

```tsx
import { Camera, Layers, GitCompare } from 'lucide-react';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
```

Then inside the `{/* Content */}` div, before the `{/* ── Geral ── */}` section, add:

```tsx
{/* ── Visualizacao ── */}
<div className="space-y-3">
  <p className="text-[10px] uppercase tracking-widest text-white/30 px-1">Visualização</p>

  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
    <div className="flex items-center gap-3">
      <Layers className="h-4 w-4 text-white/30 shrink-0" strokeWidth={1.5} />
      <span className="text-[12px] font-medium text-white/70 flex-1">Modo de visualização</span>
    </div>
    <div className="flex items-center rounded-full border border-white/[0.14] bg-white/[0.03] p-0.5 mt-2.5">
      <button
        onClick={() => ctx!.setViewMode('snapshot')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors flex-1 justify-center',
          ctx!.viewMode === 'snapshot'
            ? 'bg-[#F3A169]/15 text-[#F3A169]'
            : 'text-white/30 hover:text-white/50'
        )}
      >
        <Camera className="h-3 w-3" strokeWidth={1.5} />
        Último mês
      </button>
      <button
        onClick={() => ctx!.setViewMode('accumulated')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors flex-1 justify-center',
          ctx!.viewMode === 'accumulated'
            ? 'bg-[#F3A169]/15 text-[#F3A169]'
            : 'text-white/30 hover:text-white/50'
        )}
      >
        <Layers className="h-3 w-3" strokeWidth={1.5} />
        Acumulado
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add comparison section to FilterPanel**

After the Visualizacao section, before Geral, add the Comparacao section:

```tsx
{/* ── Comparacao ── */}
<div className="space-y-3">
  <p className="text-[10px] uppercase tracking-widest text-white/30 px-1">Comparação</p>

  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
    <div className="flex items-center gap-3">
      <GitCompare className="h-4 w-4 text-white/30 shrink-0" strokeWidth={1.5} />
      <span className="text-[12px] font-medium text-white/70 flex-1">Comparar períodos</span>
      <Switch
        checked={ctx!.compareEnabled}
        onCheckedChange={ctx!.setCompareEnabled}
        aria-label="Ativar comparação"
      />
    </div>
    {ctx!.compareEnabled && (
      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/40 mb-2">Período comparativo</p>
        <MonthRangePicker
          startDate={ctx!.comparePeriod?.start ?? ''}
          endDate={ctx!.comparePeriod?.end ?? ''}
          onRangeChange={(start, end) => ctx!.setComparePeriod({ start, end })}
          minDate={ctx!.dataBaseOptions.at(-1)?.value}
          maxDate={ctx!.dataBaseOptions[0]?.value}
          label="comparativo"
          active
          placeholder="Selecionar período"
        />
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 3: Update active filter count in FilterPanel**

Update `totalActive` in FilterPanel to also count view mode and comparison:

Replace the line:
```tsx
const totalActive = ctx.activeFilterCount;
```

With:
```tsx
const totalActive = ctx.activeFilterCount
  + (ctx.viewMode !== 'snapshot' ? 1 : 0)
  + (ctx.compareEnabled ? 1 : 0)
  + (ctx.projetos.length > 0 && ctx.projetos.length < ctx.projetoOptions.length ? 1 : 0);
```

- [ ] **Step 4: Verify the app compiles**

Run: `pnpm build`
Expected: Build succeeds (new sections in FilterPanel, existing functionality intact)

- [ ] **Step 5: Commit**

```bash
git add src/widgets/filter-panel/ui/FilterPanel.tsx
git commit -m "feat(filters): add view mode and comparison sections to FilterPanel"
```

---

### Task 2: Refactor AppBar to show breadcrumb + period + filters button

**Files:**
- Modify: `src/widgets/app-bar/ui/AppBar.tsx`

- [ ] **Step 1: Rewrite AppBar with new layout**

Replace the full content of `AppBar.tsx` with the new header layout: breadcrumb on the left, period picker + filters button on the right. The AppBar now manages its own filter panel state and renders the period picker directly.

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { FilterPanel } from '@/widgets/filter-panel';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { Menu, Settings2, ChevronRight } from 'lucide-react';

interface AppBarProps {
  /** Page title shown in breadcrumb (e.g. "Visão Geral") */
  pageTitle?: string;
  /** @deprecated Use pageTitle instead */
  title?: string;
  /** Group name for breadcrumb prefix (future: from route params) */
  groupName?: string;
  onToggleSidebar?: () => void;
  className?: string;
  /** @deprecated AppBar now manages its own content. Children are ignored. */
  children?: React.ReactNode;
}

export function AppBar({
  pageTitle,
  title,
  groupName,
  onToggleSidebar,
  className,
}: AppBarProps) {
  // Backward compat: title falls back to pageTitle
  const displayTitle = pageTitle || title || 'Dashboard';
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  let ctx: ReturnType<typeof useDataFilters> | null = null;
  try {
    ctx = useDataFilters();
  } catch {
    return (
      <header className={cn('shrink-0 border-b border-white/[0.10]', className)}>
        <div className="flex h-[72px] items-center gap-3 px-5 lg:px-8">
          <span className="text-[14px] font-semibold text-white/90">{displayTitle}</span>
        </div>
      </header>
    );
  }

  const minDate = ctx.dataBaseOptions.at(-1)?.value;
  const maxDate = ctx.dataBaseOptions[0]?.value;

  const totalActive = ctx.activeFilterCount
    + (ctx.viewMode !== 'snapshot' ? 1 : 0)
    + (ctx.compareEnabled ? 1 : 0)
    + (ctx.projetos.length > 0 && ctx.projetos.length < ctx.projetoOptions.length ? 1 : 0);

  return (
    <>
      <header className={cn('shrink-0 border-b border-white/[0.10]', className)}>
        <div className="flex h-[72px] items-center gap-3 px-5 lg:px-8">
          {/* Mobile menu */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            onClick={() => {
              if (onToggleSidebar) onToggleSidebar();
              else window.dispatchEvent(new CustomEvent('toggle-nav-sidebar'));
            }}
            aria-label="Abrir menu"
          >
            <Menu className="h-4.5 w-4.5" strokeWidth={1.5} />
          </Button>

          {/* Left: Breadcrumb */}
          <div className="flex items-center gap-1.5 min-w-0">
            {groupName && (
              <>
                <span className="text-[12px] text-white/40 truncate">{groupName}</span>
                <ChevronRight className="h-3 w-3 text-white/20 shrink-0" strokeWidth={1.5} />
              </>
            )}
            <span className="text-[14px] font-semibold text-white/90 truncate">
              {displayTitle}
            </span>
          </div>

          <div className="flex-1" />

          {/* Right: Period picker + Filters button */}
          <div className="flex items-center gap-2 shrink-0">
            {ctx.dateRange.start && ctx.dateRange.end && (
              <MonthRangePicker
                startDate={ctx.dateRange.start}
                endDate={ctx.dateRange.end}
                onRangeChange={(start, end) => ctx!.setDateRange({ start, end })}
                minDate={minDate}
                maxDate={maxDate}
              />
            )}

            <button
              onClick={() => setFilterPanelOpen(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors shrink-0',
                totalActive > 0
                  ? 'border-[#F3A169]/30 bg-[#F3A169]/10 text-[#F3A169] hover:bg-[#F3A169]/20'
                  : 'border-white/[0.14] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/70'
              )}
            >
              <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Filtros</span>
              {totalActive > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F3A169] px-1 text-[9px] font-bold text-black">
                  {totalActive}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <FilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        pageTitle={pageTitle}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `pnpm build`
Expected: Build succeeds. The `title` and `children` props are kept for backward compatibility, so existing pages compile without changes. Some pages will have unused `GlobalFilters` imports — we'll clean those in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/app-bar/ui/AppBar.tsx
git commit -m "feat(header): refactor AppBar with breadcrumb + period + filters button"
```

---

### Task 3: Update all pages to use simplified AppBar

**Files:**
- Modify: All page components that use `<AppBar>`

All pages that currently pass `<GlobalFilters />` as children to `<AppBar>` need to be updated. The new AppBar handles everything internally — pages just pass `pageTitle`.

- [ ] **Step 1: Update pages that pass GlobalFilters as children**

These pages use `<AppBar title="X"><GlobalFilters /></AppBar>`. Change them all to `<AppBar pageTitle="X" />`:

**`src/pages/pdd/ui/PddPage.tsx`** — find:
```tsx
<AppBar title="PDD">
  <GlobalFilters />
</AppBar>
```
Replace with:
```tsx
<AppBar pageTitle="PDD" />
```
Remove unused `GlobalFilters` import.

**`src/pages/pricing/ui/PricingPage.tsx`** — same pattern, replace with `<AppBar pageTitle="Pricing" />`

**`src/pages/simulacao/ui/SimulacaoPage.tsx`** — replace with `<AppBar pageTitle="Simulação de LTV" />`

**`src/pages/elegibilidade/ui/ElegibilidadePage.tsx`** — replace with `<AppBar pageTitle="Inadimplência" />`

**`src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`** — replace with `<AppBar pageTitle="Fluxo de Caixa" />`

**`src/pages/contratos/ui/ContratosPage.tsx`** — replace with `<AppBar pageTitle="Contratos" />`

**`src/pages/pagamentos/ui/PagamentosPage.tsx`** — replace with `<AppBar pageTitle="Pagamentos" />`

**`src/pages/detalhamento/ui/DetalhamentoPage.tsx`** — replace with `<AppBar pageTitle="Detalhamento Base Analítica" />`

**`src/pages/repasse/ui/RepassePage.tsx`** — replace with `<AppBar pageTitle="Estratégia de Repasse" />`

- [ ] **Step 2: Update pages that already use pageTitle or title-only**

**`src/pages/dashboard/ui/DashboardPage.tsx`** — already uses `<AppBar pageTitle="Visão Geral" />`, no change needed.

**`src/pages/anexos-elegibilidade/ui/AnexosElegibilidadePage.tsx`** — uses `<AppBar title="Anexo: Elegibilidade" />`. Change to `<AppBar pageTitle="Anexo: Elegibilidade" />`.

**`src/pages/anexos-rating/ui/AnexosRatingPage.tsx`** — update similarly to `<AppBar pageTitle="Anexo: Rating Liquid" />`.

**`src/pages/anexos-pdd/ui/AnexosPddPage.tsx`** — update to `<AppBar pageTitle="Anexo: PDD" />`.

**`src/features/admin/ui/AdminPage.tsx`** — uses `<AppBar title="Admin" pageTitle="Painel de Administração" />`. Simplify to `<AppBar pageTitle="Painel de Administração" />`.

- [ ] **Step 3: Remove unused GlobalFilters imports from all updated pages**

After updating all pages, remove any `import { GlobalFilters } from '@/widgets/global-filters'` lines that are no longer used.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Build succeeds, no unused import warnings.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ src/features/admin/
git commit -m "refactor(pages): update all pages to use simplified AppBar"
```

---

### Task 4: Clean up deprecated GlobalFilters code

**Files:**
- Modify: `src/widgets/global-filters/ui/GlobalFilters.tsx`
- Modify: `src/widgets/global-filters/index.ts`

- [ ] **Step 1: Simplify GlobalFilters to minimal export**

Since all filtering logic is now in `FilterPanel` and the period picker is in `AppBar`, `GlobalFilters` is no longer needed as a complex component. However, it may still be imported somewhere. Check for remaining usages:

Run: `grep -r "GlobalFilters" src/ --include="*.tsx" --include="*.ts" -l`

**Note:** `src/pages/explore/ui/CanvasPanel.tsx` uses `<GlobalFilters>` standalone (not inside AppBar). The deprecated stub below preserves the filter-trigger-only behavior that CanvasPanel needs. Do NOT modify CanvasPanel in this phase.

- [ ] **Step 2: Remove view mode, comparison, and filter badge code from GlobalFilters**

If GlobalFilters is still referenced, strip it down to just the filter panel trigger:

```tsx
'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { FilterPanel } from '@/widgets/filter-panel';

/** @deprecated Use AppBar directly — this component is kept for backward compat only */
export function GlobalFilters({ pageTitle }: { pageTitle?: string }) {
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  let ctx: ReturnType<typeof useDataFilters> | null = null;
  try {
    ctx = useDataFilters();
  } catch {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setFilterPanelOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors shrink-0"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Filtros
      </button>
      <FilterPanel open={filterPanelOpen} onClose={() => setFilterPanelOpen(false)} pageTitle={pageTitle} />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/global-filters/
git commit -m "refactor(global-filters): deprecate GlobalFilters, controls moved to AppBar + FilterPanel"
```

---

### Task 5: Visual QA and polish

**Files:**
- Possibly adjust: `src/widgets/app-bar/ui/AppBar.tsx`, `src/widgets/filter-panel/ui/FilterPanel.tsx`

- [ ] **Step 1: Run dev server and visually verify**

Run: `pnpm dev`

Check the following pages in the browser:
1. `/dashboard` — header shows "Visão Geral" + period picker + filters button
2. `/contratos` — header shows "Contratos" + period picker + filters button
3. `/pdd` — header shows "PDD" + period picker + filters button
4. Open FilterPanel — verify Visualizacao section with view mode toggle
5. Open FilterPanel — verify Comparacao section with toggle and conditional period picker
6. Toggle view mode in FilterPanel — verify it works (data reloads)
7. Enable comparison in FilterPanel — verify comparison period picker appears
8. Apply advanced filters — verify badge count updates on header filters button
9. Mobile responsive — verify hamburger menu still works on narrow viewport

- [ ] **Step 2: Fix any visual issues found**

Adjust spacing, alignment, or responsive behavior as needed.

- [ ] **Step 3: Final build check**

Run: `pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix(header): visual polish for simplified header and FilterPanel"
```
