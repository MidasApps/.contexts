# Indicator-Level Permissions Design

**Date:** 2026-03-15
**Status:** Approved

## Goal

Add indicator-level permissions to the existing RBAC system. Groups and users can control which specific indicators (KPIs, charts, tables) are visible per page, per client.

## Context

The current permission system controls access at two levels: **routes** (pages) and **clients**. Groups define allowed routes, and `clientAccess` can override routes per client. This design adds a third level: **indicators** — following the same group + client override pattern.

Indicators already self-register in the Zustand store via `useRegisterIndicators`. The change is to standardize fixed IDs and check permissions before rendering.

## Indicator Catalog

Each indicator gets a stable ID following the convention `{page}.{metric}`.

Examples:
- `dashboard.total_contratos`
- `dashboard.saldo_devedor`
- `dashboard.inadimplencia`
- `contratos.valor_contratado`
- `pdd.provisao_total`
- `elegibilidade.atraso_90d`

A constant `ALL_INDICATORS` (similar to `ALL_ROUTES`) lists all available indicators with metadata:

```typescript
export const ALL_INDICATORS = [
  { id: 'dashboard.total_contratos', label: 'Total de Contratos', page: 'Visão Geral', type: 'kpi' },
  { id: 'dashboard.saldo_devedor', label: 'Saldo Devedor', page: 'Visão Geral', type: 'kpi' },
  // ...
] as const;
```

This constant lives in `src/features/admin/model/types.ts` alongside `ALL_ROUTES`.

IDs are declared in each page's `useRegisterIndicators` call and must match the catalog.

## Firestore Data Model

### Groups — new fields

```typescript
interface GroupDoc {
  name: string;
  description: string;
  routes: string[];
  indicators?: string[] | null;       // NEW — null/absent = all allowed, [] = none allowed
  indicatorDenyMode?: 'hidden' | 'placeholder'; // NEW — default: 'hidden'
  createdAt: Timestamp;
}
```

### Users — new field in clientAccess

```typescript
interface ClientAccess {
  clientId: string;
  routeOverrides?: string[] | null;
  indicatorOverrides?: string[] | null; // NEW — null/absent = use group, [] = none allowed
}
```

### Backward Compatibility

- `indicators` field absent or `null` → all indicators allowed (existing groups unchanged)
- `indicators: []` → all indicators blocked
- `indicatorOverrides` absent or `null` → use group indicators
- `indicatorOverrides: []` → all indicators blocked for that client
- `indicatorDenyMode` absent → defaults to `'hidden'`

## Permission Logic

### Hook: useIndicatorPermissions

New hook in `src/shared/hooks/useIndicatorPermissions.ts`:

```typescript
interface UseIndicatorPermissions {
  canAccessIndicator(clientId: string, indicatorId: string): boolean;
  denyMode: 'hidden' | 'placeholder';
}
```

Resolution order:
1. **Admin** (email domain match) → always allowed
2. **indicatorOverrides** exists for the active client → use overrides
3. **Otherwise** → union of `indicators` from all user's groups
4. **Field absent/null** → all allowed (backward-compatible)

The hook reads from the same Firestore data already fetched by `useUserPermissions`. The `useUserPermissions` hook will be extended to also return `indicators` and `indicatorDenyMode` from the groups, and `indicatorOverrides` from clientAccess. `useIndicatorPermissions` consumes this data.

### Updated useUserPermissions data

```typescript
// Extended state in useUserPermissions
const [userDoc, setUserDoc] = useState<{
  groups: string[];
  clientAccess: {
    clientId: string;
    routeOverrides?: string[] | null;
    indicatorOverrides?: string[] | null;  // NEW
  }[];
} | null>(null);

// Groups now also carry indicators
interface GroupWithId {
  id: string;
  routes: string[];
  indicators?: string[] | null;           // NEW
  indicatorDenyMode?: 'hidden' | 'placeholder'; // NEW
}
```

## UI Components

### IndicatorGuard

New wrapper component in `src/shared/ui/indicator-guard.tsx`:

```typescript
interface IndicatorGuardProps {
  id: string;          // indicator ID, e.g. 'dashboard.total_contratos'
  children: ReactNode;
}
```

Behavior:
- `canAccessIndicator` returns `true` → render children normally
- `canAccessIndicator` returns `false` + `denyMode === 'hidden'` → render `null`
- `canAccessIndicator` returns `false` + `denyMode === 'placeholder'` → render a locked placeholder card (lock icon + "Sem permissão de visualização")

### Integration Points

Each KpiCard, ChartWidget, and DataTableWidget in page components gets wrapped with `<IndicatorGuard>`:

```tsx
<IndicatorGuard id="dashboard.total_contratos">
  <KpiCard title="Total de Contratos" value={data.totalContratos} ... />
</IndicatorGuard>
```

Layout containers (CSS grid) should handle missing children gracefully — the existing grid layouts already auto-flow, so hidden indicators won't leave gaps.

## Admin Panel

### Group Edit — new "Indicadores" section

- Checkboxes grouped by page (Visão Geral, Contratos, PDD, etc.)
- "Selecionar todos" / "Limpar" per page group
- Toggle: "Modo quando negado: Ocultar / Mostrar com cadeado"
- When no indicators are selected and field is null, show label "Todos liberados (padrão)"

### User Edit — indicatorOverrides per client

- In the client access section, optional "Indicadores" override
- Same checkbox UI as groups
- Toggle to enable/disable override (null = use group defaults)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/features/admin/model/types.ts` | Modify | Add `ALL_INDICATORS`, update `GroupDoc`, `ClientAccess` |
| `src/shared/hooks/useUserPermissions.ts` | Modify | Read `indicators`/`indicatorDenyMode` from groups, `indicatorOverrides` from clientAccess |
| `src/shared/hooks/useIndicatorPermissions.ts` | Create | New hook with `canAccessIndicator` + `denyMode` |
| `src/shared/ui/indicator-guard.tsx` | Create | `<IndicatorGuard>` wrapper component |
| `src/pages/*/ui/*.tsx` | Modify | Add `id` to each `useRegisterIndicators` call, wrap with `<IndicatorGuard>` |
| `src/features/admin/ui/GroupForm.tsx` | Modify | Add indicators checkbox section |
| `src/features/admin/ui/UserForm.tsx` | Modify | Add indicatorOverrides per client |

## Non-Goals

- Server-side indicator filtering (BigQuery returns all data; filtering is UI-only)
- Dynamic indicator discovery from Firestore (catalog is code-defined)
- Per-indicator permissions in the AI sidebar (sidebar sees all registered indicators regardless)
