# Multi-Report Dashboards Design

## Overview

Refactor the dashboard platform from static, predefined pages to a dynamic, client-managed report system organized in groups. Clients create report groups, build dashboards via AI (explore mode) or import from templates, and navigate between them through a reorganized sidebar. The header is simplified to show only breadcrumb navigation and period selector, with all other filters moved into the filter panel.

## Architecture

### Hierarchy

```
Client (OM, BRZ, CONX, IMCASA)
  └── datasets: DatasetConfig[]          # configured by admin at client setup
  └── groups: Group[]                     # created by client
        └── reports: Report[]             # created via explore or template import
              └── blocks: Block[]         # dashboard content (KPIs, charts, tables)
                    └── dataset: string   # AI chooses per block
```

### Key Concepts

- **Client**: top-level entity with one or more BigQuery datasets (configured by admin)
- **Group**: organizational folder created by client (name only, no dataset binding)
- **Report**: a dashboard created via AI explore or imported from a template. Uses the existing `CanvasPage` structure: `blockMap` (Record<string, CanvasBlock>) + `layout` (CanvasRow[]) for row-based grid layout with colSpan support.
- **Block**: reuses the existing `CanvasBlock` union type from `src/shared/config/agents/types.ts` (TextBlock, KpiBlock, SingleKpiBlock, ChartBlock, TableBlock, SkeletonBlock). Each block gains an optional `dataset` field on `BaseBlock` to identify which client dataset it queries. The AI sets this field when creating/filling blocks.
- **Template**: read-only starter dashboards (converted from current static pages), managed by admin

### Block and Report Data Model

Reports reuse the existing canvas types. A saved report in Firestore maps to:

```typescript
// Existing types (no changes)
interface CanvasRow { id: string; blockIds: string[] }
interface CanvasPage {
  id: string; title: string; description?: string;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
}

// Extended: BaseBlock gains optional dataset field
interface BaseBlock {
  id: string;
  colSpan?: 1 | 2 | 3;
  dataset?: string;  // NEW: BigQuery dataset name (from client's DatasetConfig)
}

// Firestore report document stores CanvasPage-compatible structure
interface ReportDocument {
  name: string;
  order: number;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

The existing `canvas-store.ts` (which manages pages in explore mode) will be reused for edit mode by loading the report's `blockMap` + `layout` into it. Save persists the canvas store state back to Firestore.

## Design

### 1. Header (Simplified)

The header is reduced to essential navigation and period selection.

**Layout:**
```
[Breadcrumb: Group / Report] [Edit btn]  ----spacer----  [Period picker] [Filters btn]
```

**Components:**
- **Breadcrumb**: `{groupName} / {reportName}`. Group name is clickable (navigates to group). Report name is static.
- **Edit button**: pencil icon next to report name. Activates in-place edit mode.
- **Period picker**: `MonthRangePicker` extracted from current `GlobalFilters`.
- **Filters button**: gear icon with active filter count badge. Opens `FilterPanel`.

**What moves out of the header:**
- View mode toggle (snapshot/accumulated) -> FilterPanel
- Compare toggle + comparison period picker -> FilterPanel
- Active filter badges -> FilterPanel only

### 2. FilterPanel (Expanded)

Receives controls migrated from the header. New section order:

```
FilterPanel
  ├── VISUALIZACAO
  │     └── View mode toggle: [Ultimo mes] [Acumulado]
  ├── COMPARACAO
  │     ├── Compare toggle
  │     └── Comparison period picker (visible when compare enabled)
  ├── GERAL
  │     ├── Empreendimentos (multi-select combobox)
  │     ├── Test as user toggle (admin only)
  │     └── Debug mode toggle (admin only)
  ├── FILTROS AVANCADOS
  │     ├── Rating (A-H)
  │     ├── Elegibilidade
  │     ├── Faixa LTV
  │     ├── Faixa Atraso
  │     ├── Tipo Proponente
  │     └── Grupos Repasse
  └── ACOES
        └── Export PDF button
```

**Active filter count** (shown as badge on header filters button): counts non-default view mode + active comparison + filtered projetos + any advanced filters.

### 3. Sidebar Navigation (Groups + Reports)

**Layout:**
```
┌──────────────────────────┐
│ [Logo / ClientSwitcher]  │
├──────────────────────────┤
│ [MCMV] [SBPE] [Cov] [+] │  <- group tabs (horizontal scroll)
├──────────────────────────┤
│ RELATORIOS               │
│  ● Visao Geral           │
│  ○ Contratos             │
│  ○ Inadimplencia         │
│                          │
│  + Novo relatorio        │
├──────────────────────────┤
│ NAVEGACAO / CHAT  (tabs) │
│                          │
│ [Analise Conversacional] │
├──────────────────────────┤
│ [User profile] [Logout]  │
└──────────────────────────┘
```

**Group tabs behavior:**
- Horizontal scroll with fade if many groups
- "+" button creates inline (editable text field directly in tab row)
- Context menu (right-click or "..." on hover): Rename, Delete
- Active group has highlighted style
- Switching group loads that group's report list

**Report list behavior:**
- Simple list with active indicator
- Context menu on each item: Rename, Duplicate, Move to another group, Delete
- "+ Novo relatorio" opens modal: "Criar do zero" (goes to explore) | "Importar template"
- Clicking a report navigates to dashboard preview

**Collapsed sidebar:**
- Shows first letter icon of active group
- Hover/click opens popover with report list

**Empty state:**
- If client has no groups/reports, show empty state with CTA to create first group

**Old navigation (NAV_ITEMS):**
- Removed entirely. No more static menu items.
- Current pages continue to exist as templates only.

### 4. Templates

Current static dashboards become importable templates.

**Data model:**
```
templates/{templateId}
  - name: string
  - description: string
  - category: string                      # "Carteira", "Risco", "Operacional"
  - blockMap: Record<string, CanvasBlock>  # same structure as a saved report
  - layout: CanvasRow[]
  - thumbnail?: string                    # optional static preview
  - order: number
```

**Template categories (from current NAV_ITEMS groups):**
- Carteira: Visao Geral, Contratos, Pagamentos, Fluxo de Caixa
- Risco: PDD, Pricing, Simulacao de LTV
- Operacional: Inadimplencia, Estrategia de Repasse, Detalhamento

**Import flow:**
1. User clicks "+ Novo relatorio" in a group
2. Modal opens: "Criar do zero" | "Importar template"
3. "Importar template" shows gallery grouped by category
4. User selects template -> blocks are copied to a new report in the group
5. Report is created with template name (editable), fully customizable afterwards

**Management:**
- Templates are global, managed by admin (us)
- Clients use them as starting points only

### 5. Edit Mode (In-Place)

**Activation:** Click edit button (pencil) in header.

**Header changes in edit mode:**
```
[Group / Report (editing)]  ----spacer----  [Cancel] [Save]  [Period] [Filters]
```

**Page changes:**
- Blocks gain subtle border/overlay indicating editability
- Hover on block shows toolbar: move (drag), delete, configure
- Empty area at bottom shows "+ Adicionar bloco" button
- Reorder blocks via drag-and-drop

**Chat integration:**
- Entering edit mode auto-switches sidebar to "Chat" tab
- Chat works like current `/explore` — user asks AI to create/modify blocks
- AI has context: which report is being edited, which blocks exist
- Natural commands: "add a delinquency chart by vintage", "change this KPI to show average LTV"

**Adding blocks:**
- Via chat (AI creates the block)
- Via "+ Adicionar bloco" button -> block type selector (KPI, chart, table) -> opens chat focused on that block

**Save / Cancel:**
- Save: persists changes to Firestore (updates report's `blocks` and `updatedAt`)
- Cancel: discards changes, returns to preview with previous state
- Confirmation dialog on cancel if unsaved changes exist

### 6. Multi-Dataset per Client

**Current model:**
```typescript
interface ClientConfig {
  dataset: string  // single dataset
}
```

**New model:**
```typescript
interface DatasetConfig {
  id: string
  name: string          // e.g., "MCMV", "SBPE"
  dataset: string       // BigQuery dataset name
  description?: string
}

interface ClientConfig {
  id: string
  name: string
  color: string
  initial: string
  datasets: DatasetConfig[]  // replaces: dataset: string
}
```

**Data flow impact:**
- Current: hooks pass a single fixed `dataset` from active client to queries
- New: each block in a report knows which dataset to use (defined by AI at creation)
- `fetchBigQuery` receives `dataset` per block, not globally
- Filters like "Empreendimentos" scope to the block's dataset

**Backward compatibility:**
- Clients with a single dataset: `datasets: [{ id: "default", name: "Principal", dataset: "current_dataset" }]`
- Simple migration: convert `dataset: string` to `datasets: [...]`

## Persistence (Firestore)

```
clients/{clientId}
  ├── config
  │     └── datasets: DatasetConfig[]
  ├── groups/{groupId}
  │     ├── name: string
  │     ├── order: number
  │     └── createdAt: timestamp
  └── groups/{groupId}/reports/{reportId}
        ├── name: string
        ├── order: number
        ├── blockMap: Record<string, CanvasBlock>   # reuses CanvasPage structure
        ├── layout: CanvasRow[]                     # row-based grid layout
        ├── filters?: CanvasPageFilters             # optional per-report filters
        ├── createdAt: timestamp
        └── updatedAt: timestamp

templates/{templateId}
  ├── name: string
  ├── description: string
  ├── category: string
  ├── blockMap: Record<string, CanvasBlock>
  ├── layout: CanvasRow[]
  ├── thumbnail?: string
  └── order: number
```

## Implementation Phases

### Phase 1: Header + Filters
- Simplify header: breadcrumb + period + filters button
- Move view mode, comparison, filter badges into FilterPanel
- Breadcrumb shows current page name only (no groups yet)
- Edit button hidden (edit mode is Phase 5)
- **Old routes remain fully functional** — static pages and NAV_ITEMS continue working as-is

### Phase 2: Multi-Dataset
- Update `ClientConfig` to support `datasets: DatasetConfig[]`
- Migrate existing single dataset configs
- Update `fetchBigQuery` to accept dataset per call
- Update client setup/admin flow
- Add `dataset?: string` field to `BaseBlock`
- **Old routes remain functional** — no navigation changes yet

### Phase 3: Groups and Reports
- New sidebar navigation: group tabs + report list
- Firestore CRUD for groups and reports
- Inline group creation, context menus for rename/delete
- "+ Novo relatorio" modal (explore or template)
- **Transition strategy**: old static routes (`/dashboard`, `/contratos`, etc.) are replaced by new dynamic routes (`/g/{groupId}/r/{reportId}`). Old routes redirect to new routing. NAV_ITEMS removed from sidebar.
- Empty state for clients with no groups
- Auto-migration: on first load, if client has no groups, optionally seed a default group with templates

### Phase 4: Templates
- Convert current static dashboard pages into template definitions
- Template gallery UI (grouped by category)
- Import flow: copy template blocks into new report
- Admin-only template management

### Phase 5: Edit Mode In-Place
- In-place block editing with toolbar (move, delete, configure)
- Chat in sidebar for AI-assisted editing
- Add block flow (via chat or button)
- Save/cancel with unsaved changes protection
- Drag-and-drop block reordering

## Routing

**Current routes (to be deprecated):**
```
/dashboard, /contratos, /pagamentos, /fluxo-de-caixa,
/pdd, /pricing, /simulacao, /elegibilidade, /repasse, /detalhamento
/anexos/rating, /anexos/pdd, /anexos/elegibilidade
```

**New routes:**
```
/g/{groupId}                    # group view (redirects to first report)
/g/{groupId}/r/{reportId}       # report preview
/g/{groupId}/r/{reportId}/edit  # report edit mode (or query param ?edit=1)
/explore                        # keep for "create from scratch" flow
/templates                      # admin-only template management (future)
```

## Error Handling

- **No groups**: empty state with CTA "Crie seu primeiro grupo"
- **No reports in group**: empty state with CTA "+ Novo relatorio"
- **Deleted report in URL**: redirect to group's first report, or group empty state
- **Deleted group in URL**: redirect to first available group, or global empty state
- **Unsaved changes on navigation**: confirmation dialog
