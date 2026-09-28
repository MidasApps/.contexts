# Indicator-Level Permissions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add indicator-level permissions so groups/users can control which KPIs, charts, and tables are visible per page per client.

**Architecture:** Extend the existing group/clientAccess RBAC with an `indicators` field (list of allowed indicator IDs). A new `IndicatorGuard` wrapper component checks permissions before rendering each indicator. Admin panel gets indicator selection UI mirroring the existing route checkbox pattern.

**Tech Stack:** Next.js 16, Firebase/Firestore, Zustand, TypeScript, Tailwind CSS, shadcn/ui

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/features/admin/model/types.ts` | Modify | Add `ALL_INDICATORS`, update `GroupDoc`, `ClientAccess` |
| `src/shared/hooks/useUserPermissions.ts` | Modify | Read indicator fields from groups and clientAccess |
| `src/shared/hooks/useIndicatorPermissions.ts` | Create | `canAccessIndicator()` + `denyMode` |
| `src/shared/ui/indicator-guard.tsx` | Create | `<IndicatorGuard>` wrapper |
| `src/features/admin/ui/IndicatorCheckboxGrid.tsx` | Create | Checkbox grid for indicator selection (like RouteCheckboxGrid) |
| `src/features/admin/ui/GroupForm.tsx` | Modify | Add indicators section + deny mode toggle |
| `src/features/admin/ui/UserForm.tsx` | Modify | Add indicatorOverrides per client |
| `src/pages/dashboard/ui/DashboardPage.tsx` | Modify | Wrap KPIs/charts/tables with IndicatorGuard |
| `src/pages/contratos/ui/ContratosPage.tsx` | Modify | Wrap indicators |
| `src/pages/pagamentos/ui/PagamentosPage.tsx` | Modify | Wrap indicators |
| `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx` | Modify | Wrap indicators |
| `src/pages/pdd/ui/PddPage.tsx` | Modify | Wrap indicators |
| `src/pages/pricing/ui/PricingPage.tsx` | Modify | Wrap indicators |
| `src/pages/simulacao/ui/SimulacaoPage.tsx` | Modify | Wrap indicators |
| `src/pages/elegibilidade/ui/ElegibilidadePage.tsx` | Modify | Wrap indicators |
| `src/pages/repasse/ui/RepassePage.tsx` | Modify | Wrap indicators |
| `src/pages/detalhamento/ui/DetalhamentoPage.tsx` | Modify | Wrap indicators |

---

## Task 1: Define ALL_INDICATORS and update Firestore types

**Files:**
- Modify: `src/features/admin/model/types.ts`

- [ ] **Step 1: Add ALL_INDICATORS constant and update interfaces**

Add the indicator catalog after `ALL_ROUTES`. Update `GroupDoc` and `ClientAccess` with new fields.

```typescript
// Add after ALL_ROUTES:

export const ALL_INDICATORS = [
  // Dashboard - Visão Geral
  { id: 'dashboard.total_contratos', label: 'Total de Contratos', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.saldo_nominal', label: 'Saldo Nominal', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.saldo_devedor', label: 'Saldo Devedor', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.valor_atraso', label: 'Valor em Atraso', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.inadimplencia', label: 'Inadimplência', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.over_90', label: 'Atraso > 90 dias', page: 'Visão Geral', type: 'kpi' as const },
  { id: 'dashboard.evolucao_saldo', label: 'Evolução do Saldo Devedor', page: 'Visão Geral', type: 'chart' as const },
  { id: 'dashboard.faixa_atraso_chart', label: 'Contratos por Faixa de Atraso', page: 'Visão Geral', type: 'chart' as const },
  { id: 'dashboard.faixa_atraso_table', label: 'Indicadores por Faixa de Atraso', page: 'Visão Geral', type: 'table' as const },

  // Contratos
  { id: 'contratos.resumo_empreendimento', label: 'Resumo por Empreendimento', page: 'Contratos', type: 'table' as const },
  { id: 'contratos.unidades_comercializadas', label: 'Unidades Comercializadas', page: 'Contratos', type: 'chart' as const },
  { id: 'contratos.rating_empreendimento', label: 'Rating x Empreendimento', page: 'Contratos', type: 'chart' as const },
  { id: 'contratos.evolucao_rating', label: 'Evolução do Rating', page: 'Contratos', type: 'chart' as const },
  { id: 'contratos.evolucao_saldo', label: 'Evolução do Saldo Devedor', page: 'Contratos', type: 'chart' as const },
  { id: 'contratos.saldo_atraso', label: 'Saldo em Atraso ao Longo do Tempo', page: 'Contratos', type: 'chart' as const },
  { id: 'contratos.evolucao_valor_atraso', label: 'Evolução do Valor em Atraso', page: 'Contratos', type: 'chart' as const },

  // Pagamentos
  { id: 'pagamentos.detalhamento', label: 'Detalhamento dos Pagamentos', page: 'Pagamentos', type: 'table' as const },
  { id: 'pagamentos.composicao', label: 'Composição dos Pagamentos', page: 'Pagamentos', type: 'chart' as const },

  // Fluxo de Caixa
  { id: 'fluxo.parcela_ajustado', label: 'Fluxo de Parcela Ajustado ao Risco', page: 'Fluxo de Caixa', type: 'chart' as const },
  { id: 'fluxo.esperado_mensal', label: 'Fluxo Esperado Mensal', page: 'Fluxo de Caixa', type: 'chart' as const },
  { id: 'fluxo.tabela_mensal', label: 'Fluxo Mensal', page: 'Fluxo de Caixa', type: 'table' as const },

  // PDD
  { id: 'pdd.total_liquid', label: 'Total PDD Liquid', page: 'PDD', type: 'kpi' as const },
  { id: 'pdd.total_bacen', label: 'Total PDD Mín. Bacen', page: 'PDD', type: 'kpi' as const },
  { id: 'pdd.delta_total', label: 'Delta Total', page: 'PDD', type: 'kpi' as const },
  { id: 'pdd.liquid_vs_bacen', label: 'PDD Liquid vs PDD Mínimo Bacen', page: 'PDD', type: 'chart' as const },
  { id: 'pdd.por_rating', label: 'PDD por Rating Liquid', page: 'PDD', type: 'table' as const },

  // Pricing
  { id: 'pricing.total', label: 'Pricing Total', page: 'Pricing', type: 'kpi' as const },
  { id: 'pricing.desagio_medio', label: 'Deságio Médio', page: 'Pricing', type: 'kpi' as const },
  { id: 'pricing.por_rating', label: 'Pricing por Rating Liquid', page: 'Pricing', type: 'table' as const },
  { id: 'pricing.por_elegibilidade', label: 'Pricing por Elegibilidade', page: 'Pricing', type: 'table' as const },

  // Simulação
  { id: 'simulacao.ltv_80_contratos', label: 'Contratos com LTV > 80%', page: 'Simulação', type: 'kpi' as const },
  { id: 'simulacao.ltv_80_saldo', label: 'Saldo Devedor com LTV > 80%', page: 'Simulação', type: 'kpi' as const },
  { id: 'simulacao.ltv_faixa', label: 'LTV Banco por Faixa', page: 'Simulação', type: 'chart' as const },
  { id: 'simulacao.matriz_ltv', label: 'Matriz LTV x LTV Stress', page: 'Simulação', type: 'table' as const },

  // Elegibilidade / Inadimplência
  { id: 'elegibilidade.contratos_inadimplentes', label: 'Contratos Inadimplentes', page: 'Inadimplência', type: 'kpi' as const },
  { id: 'elegibilidade.valor_atraso', label: 'Valor em Atraso', page: 'Inadimplência', type: 'kpi' as const },
  { id: 'elegibilidade.inadimplencia', label: 'Inadimplência', page: 'Inadimplência', type: 'kpi' as const },
  { id: 'elegibilidade.total_contratos', label: 'Total de Contratos', page: 'Inadimplência', type: 'kpi' as const },
  { id: 'elegibilidade.faixa_atraso', label: 'Inadimplência por Faixa de Atraso', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.por_safra_table', label: 'Inadimplência por Safra', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.matriz_cobranca', label: 'Matriz de Cobrança', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.restricoes_rating', label: 'Restrições por Rating', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.restricoes_tipo', label: 'Restrições por Tipo', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.restricoes_faixa', label: 'Restrições por Faixa de Valor', page: 'Inadimplência', type: 'table' as const },
  { id: 'elegibilidade.faixa_atraso_chart', label: 'Contratos por Faixa de Atraso', page: 'Inadimplência', type: 'chart' as const },
  { id: 'elegibilidade.por_safra_chart', label: 'Inadimplência por Safra', page: 'Inadimplência', type: 'chart' as const },
  { id: 'elegibilidade.ltv_faixa', label: 'LTV por Faixa', page: 'Inadimplência', type: 'chart' as const },

  // Repasse
  { id: 'repasse.total_contratos', label: 'Total de Contratos', page: 'Repasse', type: 'kpi' as const },
  { id: 'repasse.saldo_devedor', label: 'Saldo Devedor Total', page: 'Repasse', type: 'kpi' as const },
  { id: 'repasse.indice_medio', label: 'Índice de Repasse Médio', page: 'Repasse', type: 'kpi' as const },
  { id: 'repasse.restricoes', label: 'Restrições Cadastrais', page: 'Repasse', type: 'kpi' as const },
  { id: 'repasse.grupos_estrategia', label: 'Grupos de Estratégia', page: 'Repasse', type: 'table' as const },
  { id: 'repasse.descricao_grupos', label: 'Descrição dos Grupos', page: 'Repasse', type: 'table' as const },
  { id: 'repasse.saldo_por_grupo', label: 'Saldo Devedor por Grupo', page: 'Repasse', type: 'chart' as const },

  // Detalhamento
  { id: 'detalhamento.contratos_carteira', label: 'Contratos da Carteira', page: 'Detalhamento', type: 'table' as const },
] as const;

export type IndicatorId = (typeof ALL_INDICATORS)[number]['id'];

// Page names used in ALL_INDICATORS for grouping in UI
export const INDICATOR_PAGES = [
  'Visão Geral', 'Contratos', 'Pagamentos', 'Fluxo de Caixa',
  'PDD', 'Pricing', 'Simulação', 'Inadimplência', 'Repasse', 'Detalhamento',
] as const;
```

Update `GroupDoc`:

```typescript
export interface GroupDoc {
  name: string;
  description: string;
  routes: string[];
  indicators?: string[] | null;                    // NEW
  indicatorDenyMode?: 'hidden' | 'placeholder';    // NEW
  createdAt: Timestamp;
}
```

Update `ClientAccess`:

```typescript
export interface ClientAccess {
  clientId: string;
  routeOverrides?: string[] | null;
  indicatorOverrides?: string[] | null;            // NEW
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/model/types.ts
git commit -m "feat: add ALL_INDICATORS catalog and indicator permission types"
```

---

## Task 2: Extend useUserPermissions to carry indicator data

**Files:**
- Modify: `src/shared/hooks/useUserPermissions.ts`

- [ ] **Step 1: Update state and group interfaces**

Update `GroupWithId` to include indicator fields. Update `userDoc` state to include `indicatorOverrides` in clientAccess. Add computed `baseIndicators` and `indicatorDenyMode`.

```typescript
interface GroupWithId {
  id: string;
  routes: string[];
  indicators?: string[] | null;                     // NEW
  indicatorDenyMode?: 'hidden' | 'placeholder';     // NEW
}
```

Update the `userDoc` state type to include `indicatorOverrides`:

```typescript
const [userDoc, setUserDoc] = useState<{
  groups: string[];
  clientAccess: {
    clientId: string;
    routeOverrides?: string[] | null;
    indicatorOverrides?: string[] | null;           // NEW
  }[];
} | null>(null);
```

Update the `setUserDoc` call to read `indicatorOverrides`:

```typescript
setUserDoc({
  groups: data.groups ?? [],
  clientAccess: (data.clientAccess ?? []).map((ca: Record<string, unknown>) => ({
    clientId: ca.clientId as string,
    routeOverrides: ca.routeOverrides as string[] | null | undefined,
    indicatorOverrides: ca.indicatorOverrides as string[] | null | undefined,
  })),
});
```

Update `setAllGroups` to read indicator fields:

```typescript
setAllGroups(gSnap.docs.map((d) => {
  const data = d.data();
  return {
    id: d.id,
    routes: (data.routes as string[]) ?? [],
    indicators: data.indicators as string[] | null | undefined,
    indicatorDenyMode: data.indicatorDenyMode as 'hidden' | 'placeholder' | undefined,
  };
}));
```

Add computed `baseIndicators` (union of all group indicators, `null` means all allowed):

```typescript
const baseIndicators = useMemo(() => {
  if (!userDoc) return null;
  const userGroupIds = new Set(userDoc.groups);
  const userGroups = allGroups.filter((g) => userGroupIds.has(g.id));

  // If any group has indicators=null/undefined, that means "all allowed"
  if (userGroups.some((g) => g.indicators == null)) return null;

  const indicators = new Set<string>();
  for (const g of userGroups) {
    if (g.indicators) g.indicators.forEach((i) => indicators.add(i));
  }
  return [...indicators];
}, [userDoc, allGroups]);
```

Add computed `indicatorDenyMode` (first group's setting wins, default 'hidden'):

```typescript
const indicatorDenyMode = useMemo(() => {
  if (!userDoc) return 'hidden' as const;
  const userGroupIds = new Set(userDoc.groups);
  for (const g of allGroups) {
    if (userGroupIds.has(g.id) && g.indicatorDenyMode) {
      return g.indicatorDenyMode;
    }
  }
  return 'hidden' as const;
}, [userDoc, allGroups]);
```

Update the return statement:

```typescript
return {
  isAdmin, loading,
  canAccessClient, canAccessRoute, accessibleClientIds, baseRoutes,
  baseIndicators, indicatorDenyMode, userDoc,  // NEW
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useUserPermissions.ts
git commit -m "feat: extend useUserPermissions with indicator data"
```

---

## Task 3: Create useIndicatorPermissions hook

**Files:**
- Create: `src/shared/hooks/useIndicatorPermissions.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useCallback } from 'react';
import { useUserPermissions } from './useUserPermissions';
import { useAppStore } from '@/shared/stores/app-store';

export function useIndicatorPermissions() {
  const {
    isAdmin,
    loading,
    baseIndicators,
    indicatorDenyMode,
    userDoc,
  } = useUserPermissions();
  const activeClientId = useAppStore((s) => s.activeClientId);

  const canAccessIndicator = useCallback(
    (indicatorId: string, clientId?: string): boolean => {
      if (isAdmin) return true;
      if (!userDoc) return false;

      const cid = clientId ?? activeClientId;
      const ca = userDoc.clientAccess.find((c) => c.clientId === cid);

      // Check client-level indicator overrides first
      if (ca && Array.isArray(ca.indicatorOverrides)) {
        return ca.indicatorOverrides.includes(indicatorId);
      }

      // Fall back to group-level indicators
      if (baseIndicators === null) return true; // null = all allowed
      return baseIndicators.includes(indicatorId);
    },
    [isAdmin, userDoc, activeClientId, baseIndicators],
  );

  return {
    canAccessIndicator,
    denyMode: indicatorDenyMode,
    loading,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useIndicatorPermissions.ts
git commit -m "feat: create useIndicatorPermissions hook"
```

---

## Task 4: Create IndicatorGuard component

**Files:**
- Create: `src/shared/ui/indicator-guard.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { type ReactNode } from 'react';
import { useIndicatorPermissions } from '@/shared/hooks/useIndicatorPermissions';
import { Lock } from 'lucide-react';

interface IndicatorGuardProps {
  id: string;
  children: ReactNode;
}

export function IndicatorGuard({ id, children }: IndicatorGuardProps) {
  const { canAccessIndicator, denyMode, loading } = useIndicatorPermissions();

  // While loading, render children (avoid layout shift)
  if (loading) return <>{children}</>;

  if (canAccessIndicator(id)) return <>{children}</>;

  if (denyMode === 'hidden') return null;

  // Placeholder mode
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
      <Lock className="h-5 w-5 text-white/20" strokeWidth={1.5} />
      <p className="text-xs text-white/30">Sem permissão de visualização</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/ui/indicator-guard.tsx
git commit -m "feat: create IndicatorGuard wrapper component"
```

---

## Task 5: Create IndicatorCheckboxGrid for admin panel

**Files:**
- Create: `src/features/admin/ui/IndicatorCheckboxGrid.tsx`

- [ ] **Step 1: Create the component**

Follow the same pattern as `RouteCheckboxGrid.tsx` but using `ALL_INDICATORS` and `INDICATOR_PAGES`.

```tsx
'use client';

import { ALL_INDICATORS, INDICATOR_PAGES } from '@/features/admin/model/types';
import { cn } from '@/shared/lib/utils';

interface IndicatorCheckboxGridProps {
  selected: string[];
  onChange: (indicators: string[]) => void;
}

export function IndicatorCheckboxGrid({ selected, onChange }: IndicatorCheckboxGridProps) {
  const groupedIndicators = INDICATOR_PAGES.map((page) => ({
    page,
    indicators: ALL_INDICATORS.filter((i) => i.page === page),
  }));

  const handleTogglePage = (page: string) => {
    const pageIds = ALL_INDICATORS.filter((i) => i.page === page).map((i) => i.id);
    const allSelected = pageIds.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((id) => !pageIds.includes(id)));
    } else {
      const newSelected = [...selected];
      for (const id of pageIds) {
        if (!newSelected.includes(id)) newSelected.push(id);
      }
      onChange(newSelected);
    }
  };

  const handleToggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((i) => i !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'kpi': return '■';
      case 'chart': return '◆';
      case 'table': return '▣';
      default: return '●';
    }
  };

  return (
    <div className="space-y-4">
      {groupedIndicators.map(({ page, indicators }) => {
        if (indicators.length === 0) return null;
        const pageIds = indicators.map((i) => i.id);
        const allSelected = pageIds.every((id) => selected.includes(id));

        return (
          <div key={page} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                {page}
              </span>
              <button
                type="button"
                onClick={() => handleTogglePage(page)}
                className="text-[11px] text-[#F3A169] hover:text-[#F3A169]/80 transition-colors"
              >
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {indicators.map((indicator) => {
                const isChecked = selected.includes(indicator.id);
                return (
                  <label
                    key={indicator.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      isChecked
                        ? 'border-[#F3A169]/40 bg-[#F3A169]/10'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(indicator.id)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        'size-3.5 rounded flex items-center justify-center border flex-shrink-0',
                        isChecked
                          ? 'bg-[#F3A169] border-[#F3A169]'
                          : 'border-white/20 bg-transparent'
                      )}
                    >
                      {isChecked && (
                        <svg className="size-2.5 text-black" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={cn('text-[10px] text-white/30 shrink-0', isChecked && 'text-white/50')}>
                      {typeIcon(indicator.type)}
                    </span>
                    <span className={cn('text-xs truncate', isChecked ? 'text-white/90' : 'text-white/60')}>
                      {indicator.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/ui/IndicatorCheckboxGrid.tsx
git commit -m "feat: create IndicatorCheckboxGrid for admin panel"
```

---

## Task 6: Update GroupForm with indicator section

**Files:**
- Modify: `src/features/admin/ui/GroupForm.tsx`

- [ ] **Step 1: Add indicators state and deny mode**

Add state variables:

```typescript
const [indicators, setIndicators] = useState<string[] | null>(null);
const [indicatorDenyMode, setIndicatorDenyMode] = useState<'hidden' | 'placeholder'>('hidden');
const [indicatorsEnabled, setIndicatorsEnabled] = useState(false);
```

In the `useEffect` that loads group data, add:

```typescript
if (group) {
  // ... existing fields ...
  setIndicators(group.indicators ?? null);
  setIndicatorDenyMode(group.indicatorDenyMode ?? 'hidden');
  setIndicatorsEnabled(group.indicators != null);
} else {
  // ... existing resets ...
  setIndicators(null);
  setIndicatorDenyMode('hidden');
  setIndicatorsEnabled(false);
}
```

Note: The `Group` runtime type in `types.ts` will need the new fields. Update the `Group` interface:

```typescript
export interface Group extends Omit<GroupDoc, 'createdAt'> {
  id: string;
}
```

This already inherits from `GroupDoc`, so it automatically includes `indicators` and `indicatorDenyMode`.

- [ ] **Step 2: Add indicator UI section**

After the Routes section, add:

```tsx
{/* Indicators */}
<div>
  <div className="flex items-center justify-between mb-3">
    <label className="text-[11px] text-white/50 uppercase tracking-wider">
      Indicadores
    </label>
    <button
      type="button"
      onClick={() => {
        if (indicatorsEnabled) {
          setIndicatorsEnabled(false);
          setIndicators(null);
        } else {
          setIndicatorsEnabled(true);
          setIndicators([]);
        }
      }}
      className={cn(
        'text-[11px] rounded-lg px-2.5 py-1 border transition-colors',
        indicatorsEnabled
          ? 'bg-[#F3A169]/15 border-[#F3A169]/40 text-[#F3A169]'
          : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60'
      )}
    >
      {indicatorsEnabled ? 'Restringir indicadores' : 'Todos liberados (padrão)'}
    </button>
  </div>

  {indicatorsEnabled && (
    <>
      {/* Deny mode toggle */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] text-white/40">Quando negado:</span>
        <button
          type="button"
          onClick={() => setIndicatorDenyMode('hidden')}
          className={cn(
            'text-[11px] rounded-lg px-2.5 py-1 border transition-colors',
            indicatorDenyMode === 'hidden'
              ? 'bg-[#F3A169]/15 border-[#F3A169]/40 text-[#F3A169]'
              : 'bg-white/[0.02] border-white/[0.06] text-white/40'
          )}
        >
          Ocultar
        </button>
        <button
          type="button"
          onClick={() => setIndicatorDenyMode('placeholder')}
          className={cn(
            'text-[11px] rounded-lg px-2.5 py-1 border transition-colors',
            indicatorDenyMode === 'placeholder'
              ? 'bg-[#F3A169]/15 border-[#F3A169]/40 text-[#F3A169]'
              : 'bg-white/[0.02] border-white/[0.06] text-white/40'
          )}
        >
          Mostrar com cadeado
        </button>
      </div>

      <IndicatorCheckboxGrid
        selected={indicators ?? []}
        onChange={setIndicators}
      />
    </>
  )}
</div>
```

Import `IndicatorCheckboxGrid` and `cn` at the top.

- [ ] **Step 3: Update handleSave to include indicator fields**

```typescript
const payload = {
  name: nome.trim(),
  description: descricao.trim(),
  routes,
  indicators: indicatorsEnabled ? indicators : null,
  indicatorDenyMode: indicatorsEnabled ? indicatorDenyMode : undefined,
};
```

Pass this to both `onCreate` and `onUpdate`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/GroupForm.tsx
git commit -m "feat: add indicator selection to GroupForm"
```

---

## Task 7: Update UserForm with indicator overrides

**Files:**
- Modify: `src/features/admin/ui/UserForm.tsx`

- [ ] **Step 1: Add indicator override state**

Add to `ClientRouteConfig` (rename to `ClientOverrideConfig`):

```typescript
interface ClientOverrideConfig {
  useGroupRoutes: boolean;
  customRoutes: string[];
  useGroupIndicators: boolean;    // NEW
  customIndicators: string[];     // NEW
}
```

Update all references. In `useEffect` loading user data:

```typescript
configs[ca.clientId] = {
  useGroupRoutes: ca.routeOverrides == null,
  customRoutes: ca.routeOverrides ?? [],
  useGroupIndicators: ca.indicatorOverrides == null,     // NEW
  customIndicators: ca.indicatorOverrides ?? [],         // NEW
};
```

Default in `toggleClient`:

```typescript
{ useGroupRoutes: true, customRoutes: [], useGroupIndicators: true, customIndicators: [] }
```

- [ ] **Step 2: Add indicator override UI in expanded client section**

After the route config section inside the expanded client area, add:

```tsx
{/* Indicator config */}
<div className="pt-3 border-t border-white/[0.06] space-y-3">
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={() => updateClientConfig(client.id, { useGroupIndicators: true })}
      className={cn(
        'text-xs rounded-lg px-3 py-1.5 border transition-colors',
        config.useGroupIndicators
          ? 'bg-[#F3A169]/15 border-[#F3A169]/40 text-[#F3A169]'
          : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60'
      )}
    >
      Usar indicadores do grupo
    </button>
    <button
      type="button"
      onClick={() => updateClientConfig(client.id, { useGroupIndicators: false })}
      className={cn(
        'text-xs rounded-lg px-3 py-1.5 border transition-colors',
        !config.useGroupIndicators
          ? 'bg-[#F3A169]/15 border-[#F3A169]/40 text-[#F3A169]'
          : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60'
      )}
    >
      Indicadores personalizados
    </button>
  </div>

  {!config.useGroupIndicators && (
    <IndicatorCheckboxGrid
      selected={config.customIndicators}
      onChange={(indicators) => updateClientConfig(client.id, { customIndicators: indicators })}
    />
  )}
</div>
```

Import `IndicatorCheckboxGrid`.

- [ ] **Step 3: Update handleSave to include indicator overrides**

```typescript
const clientAccess: ClientAccess[] = selectedClients.map((clientId) => {
  const config = getClientConfig(clientId);
  return {
    clientId,
    routeOverrides: config.useGroupRoutes ? null : config.customRoutes,
    indicatorOverrides: config.useGroupIndicators ? null : config.customIndicators,  // NEW
  };
});
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/UserForm.tsx
git commit -m "feat: add indicator overrides to UserForm"
```

---

## Task 8: Wrap page indicators with IndicatorGuard

**Files:**
- Modify: All page components in `src/pages/*/ui/`

For each page, wrap each KpiCard, ChartWidget, and DataTableWidget with `<IndicatorGuard id="...">`. Import `IndicatorGuard` from `@/shared/ui/indicator-guard`.

The ID for each wrapper must match the corresponding entry in `ALL_INDICATORS`.

- [ ] **Step 1: Wrap DashboardPage indicators**

File: `src/pages/dashboard/ui/DashboardPage.tsx`

Each of the 6 KPI cards in the grid gets wrapped:
```tsx
<IndicatorGuard id="dashboard.total_contratos">
  <KpiCard ... />
</IndicatorGuard>
```

The 2 chart sections and 1 table section also get wrapped with their respective IDs.

- [ ] **Step 2: Wrap ContratosPage indicators**

File: `src/pages/contratos/ui/ContratosPage.tsx`

Wrap the summary table and all 6 chart sections.

- [ ] **Step 3: Wrap PagamentosPage indicators**

File: `src/pages/pagamentos/ui/PagamentosPage.tsx`

Wrap the detail table and composition chart.

- [ ] **Step 4: Wrap FluxoDeCaixaPage indicators**

File: `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx`

Wrap 2 charts and 1 table.

- [ ] **Step 5: Wrap PddPage indicators**

File: `src/pages/pdd/ui/PddPage.tsx`

Wrap 3 KPIs, 1 chart, 1 table.

- [ ] **Step 6: Wrap PricingPage indicators**

File: `src/pages/pricing/ui/PricingPage.tsx`

Wrap 2 KPIs and 2 tables.

- [ ] **Step 7: Wrap SimulacaoPage indicators**

File: `src/pages/simulacao/ui/SimulacaoPage.tsx`

Wrap 2 KPIs, 1 chart, 1 table.

- [ ] **Step 8: Wrap ElegibilidadePage indicators**

File: `src/pages/elegibilidade/ui/ElegibilidadePage.tsx`

Wrap 4+ KPIs, 6+ tables, 3+ charts. This is the largest page.

- [ ] **Step 9: Wrap RepassePage indicators**

File: `src/pages/repasse/ui/RepassePage.tsx`

Wrap 4 KPIs, 2 tables, 1 chart.

- [ ] **Step 10: Wrap DetalhamentoPage indicators**

File: `src/pages/detalhamento/ui/DetalhamentoPage.tsx`

Wrap 1 table.

- [ ] **Step 11: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 12: Commit**

```bash
git add src/pages/
git commit -m "feat: wrap all page indicators with IndicatorGuard"
```

---

## Task 9: Update useAdminGroups to read new fields

**Files:**
- Modify: `src/features/admin/model/useAdminGroups.ts`

- [ ] **Step 1: Ensure group data includes indicator fields**

Check that the `fetch` function reads `indicators` and `indicatorDenyMode` from Firestore docs. Since it maps doc data to `Group` (which extends `GroupDoc`), it should work automatically — but verify the mapping is complete.

If the current code destructures specific fields, add the new ones. If it spreads `data`, no change needed.

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add src/features/admin/model/useAdminGroups.ts
git commit -m "feat: ensure admin groups read indicator fields from Firestore"
```

---

## Verification

After all tasks:

- [ ] **Final build check**: `npx tsc --noEmit` passes cleanly
- [ ] **Manual test as admin**: All pages render normally, no console errors
- [ ] **Manual test admin panel**: Group form shows indicator section, User form shows indicator overrides per client
