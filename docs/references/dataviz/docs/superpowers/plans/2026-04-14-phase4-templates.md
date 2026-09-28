# Phase 4: Templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert current static dashboard pages into importable templates that clients can use as starting points for their reports.

**Architecture:** Create a hardcoded template registry (`dashboard-templates.ts`) with CanvasPage definitions for each current dashboard (Visão Geral, Contratos, PDD, etc.). Each template defines block structure (types, titles, chart configs, table columns) without data — data is fetched at render time. Update the NewReportModal to show a template gallery grouped by category. Importing a template copies its blockMap + layout into a new report via `createReport()`.

**Tech Stack:** React, TypeScript, shadcn/ui, Firestore (via existing reports CRUD)

**Spec:** `docs/superpowers/specs/2026-04-14-multi-report-dashboards-design.md` (Section 4)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/shared/config/dashboard-templates.ts` | Template registry: CanvasPage definitions for all dashboard types |
| Modify | `src/widgets/nav-sidebar/ui/NewReportModal.tsx` | Enable template import with gallery UI |
| Create | `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` | Template selection grid grouped by category |

---

### Task 1: Create template registry

**Files:**
- Create: `src/shared/config/dashboard-templates.ts`

- [ ] **Step 1: Create template definitions**

Each template is a `CanvasPage`-compatible structure with block definitions. Blocks have structure (type, title, chart config) but **empty data arrays** — the AI or future render logic fills them.

```tsx
import type { CanvasBlock, CanvasRow } from '@/shared/config/agents/types';

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional';
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
}

function kpi(id: string, label: string, description?: string): CanvasBlock {
  return {
    id,
    type: 'kpi',
    label,
    value: '—',
    description,
  };
}

function chart(
  id: string,
  title: string,
  chartType: 'bar' | 'line' | 'area' | 'composed' | 'stacked-bar',
  dataKeys: string[],
  xAxisKey: string,
  colSpan?: 1 | 2 | 3,
): CanvasBlock {
  return {
    id,
    type: 'chart',
    chartType,
    title,
    data: [],
    dataKeys,
    xAxisKey,
    colSpan,
  };
}

function table(
  id: string,
  title: string,
  columns: Array<{ header: string; accessorKey: string; format?: 'currency' | 'percent' | 'number' }>,
  colSpan?: 1 | 2 | 3,
): CanvasBlock {
  return {
    id,
    type: 'table',
    title,
    columns,
    rows: [],
    colSpan,
  };
}

function row(blockIds: string[]): CanvasRow {
  return { id: crypto.randomUUID(), blockIds };
}

// ─── Templates ───

const visaoGeral: DashboardTemplate = {
  id: 'visao-geral',
  name: 'Visão Geral',
  description: 'KPIs principais, evolução do saldo e faixas de atraso',
  category: 'Carteira',
  blockMap: {
    'kpi-contratos': kpi('kpi-contratos', 'Total de Contratos'),
    'kpi-saldo-nominal': kpi('kpi-saldo-nominal', 'Saldo Nominal'),
    'kpi-saldo-devedor': kpi('kpi-saldo-devedor', 'Saldo Devedor'),
    'kpi-valor-atraso': kpi('kpi-valor-atraso', 'Valor em Atraso'),
    'kpi-inadimplencia': kpi('kpi-inadimplencia', 'Inadimplência'),
    'kpi-over90': kpi('kpi-over90', 'Atraso > 90 dias'),
    'chart-evolucao': chart('chart-evolucao', 'Evolução do Saldo Devedor', 'composed', ['saldo_devedor'], 'mes', 2),
    'chart-faixa': chart('chart-faixa', 'Contratos por Faixa de Atraso', 'bar', ['contratos'], 'faixa_atraso'),
    'table-faixa': table('table-faixa', 'Indicadores por Faixa de Atraso', [
      { header: 'Faixa', accessorKey: 'faixa_atraso' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Saldo Devedor', accessorKey: 'saldo_devedor', format: 'currency' },
      { header: 'Valor Atraso', accessorKey: 'valor_atraso', format: 'currency' },
      { header: 'Inadimplência', accessorKey: 'inadimplencia', format: 'percent' },
    ], 3),
  },
  layout: [
    row(['kpi-contratos', 'kpi-saldo-nominal', 'kpi-saldo-devedor']),
    row(['kpi-valor-atraso', 'kpi-inadimplencia', 'kpi-over90']),
    row(['chart-evolucao', 'chart-faixa']),
    row(['table-faixa']),
  ],
};

const contratos: DashboardTemplate = {
  id: 'contratos',
  name: 'Contratos',
  description: 'Resumo por empreendimento, unidades e evolução de rating',
  category: 'Carteira',
  blockMap: {
    'table-resumo': table('table-resumo', 'Resumo por Empreendimento', [
      { header: 'Empreendimento', accessorKey: 'projeto' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Saldo Devedor', accessorKey: 'saldo_devedor', format: 'currency' },
    ], 3),
    'chart-unidades': chart('chart-unidades', 'Unidades Comercializadas', 'bar', ['unidades'], 'projeto', 2),
    'chart-rating': chart('chart-rating', 'Rating x Empreendimento', 'stacked-bar', ['A', 'B', 'C', 'D'], 'projeto'),
    'chart-evolucao-saldo': chart('chart-evolucao-saldo', 'Evolução do Saldo Devedor', 'line', ['saldo_devedor'], 'mes', 2),
  },
  layout: [
    row(['table-resumo']),
    row(['chart-unidades', 'chart-rating']),
    row(['chart-evolucao-saldo']),
  ],
};

const pagamentos: DashboardTemplate = {
  id: 'pagamentos',
  name: 'Pagamentos',
  description: 'Detalhamento e composição dos pagamentos',
  category: 'Carteira',
  blockMap: {
    'chart-composicao': chart('chart-composicao', 'Composição dos Pagamentos', 'stacked-bar', ['valor_pago'], 'tipo_recebimento', 2),
    'table-detalhamento': table('table-detalhamento', 'Detalhamento dos Pagamentos', [
      { header: 'Tipo', accessorKey: 'tipo_recebimento' },
      { header: 'Valor Pago', accessorKey: 'valor_pago', format: 'currency' },
    ], 3),
  },
  layout: [
    row(['chart-composicao']),
    row(['table-detalhamento']),
  ],
};

const fluxoCaixa: DashboardTemplate = {
  id: 'fluxo-caixa',
  name: 'Fluxo de Caixa',
  description: 'Fluxo esperado mensal e ajustado ao risco',
  category: 'Carteira',
  blockMap: {
    'chart-parcela': chart('chart-parcela', 'Fluxo de Parcela Ajustado ao Risco', 'area', ['fluxo_esperado', 'fluxo_contratado'], 'data_base_fluxo', 3),
    'chart-esperado': chart('chart-esperado', 'Fluxo Esperado Mensal', 'bar', ['fluxo_esperado'], 'data_base_fluxo', 3),
    'table-mensal': table('table-mensal', 'Fluxo Mensal', [
      { header: 'Mês', accessorKey: 'data_base_fluxo' },
      { header: 'Esperado', accessorKey: 'fluxo_esperado', format: 'currency' },
      { header: 'Contratado', accessorKey: 'fluxo_contratado', format: 'currency' },
    ], 3),
  },
  layout: [
    row(['chart-parcela']),
    row(['chart-esperado']),
    row(['table-mensal']),
  ],
};

const pdd: DashboardTemplate = {
  id: 'pdd',
  name: 'PDD',
  description: 'PDD Liquid vs Bacen, delta e análise por rating',
  category: 'Risco',
  blockMap: {
    'kpi-liquid': kpi('kpi-liquid', 'Total PDD Liquid'),
    'kpi-bacen': kpi('kpi-bacen', 'Total PDD Mínima Bacen'),
    'kpi-delta': kpi('kpi-delta', 'Delta PDD Total'),
    'chart-comparativo': chart('chart-comparativo', 'PDD Liquid vs PDD Mínima Bacen', 'composed', ['pdd_liquid', 'pdd_bacen'], 'mes', 3),
    'table-rating': table('table-rating', 'PDD por Rating Liquid', [
      { header: 'Rating', accessorKey: 'rating' },
      { header: 'PDD Liquid', accessorKey: 'pdd_liquid', format: 'currency' },
      { header: 'PDD Bacen', accessorKey: 'pdd_bacen', format: 'currency' },
      { header: 'Delta', accessorKey: 'delta', format: 'currency' },
    ], 3),
  },
  layout: [
    row(['kpi-liquid', 'kpi-bacen', 'kpi-delta']),
    row(['chart-comparativo']),
    row(['table-rating']),
  ],
};

const pricing: DashboardTemplate = {
  id: 'pricing',
  name: 'Pricing',
  description: 'Pricing total, deságio médio e análise por rating/elegibilidade',
  category: 'Risco',
  blockMap: {
    'kpi-total': kpi('kpi-total', 'Pricing Total'),
    'kpi-desagio': kpi('kpi-desagio', 'Deságio Médio'),
    'table-rating': table('table-rating', 'Pricing por Rating Liquid', [
      { header: 'Rating', accessorKey: 'rating' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Pricing', accessorKey: 'pricing', format: 'currency' },
    ], 3),
    'table-elegibilidade': table('table-elegibilidade', 'Pricing por Elegibilidade', [
      { header: 'Elegibilidade', accessorKey: 'elegibilidade' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Pricing', accessorKey: 'pricing', format: 'currency' },
    ], 3),
  },
  layout: [
    row(['kpi-total', 'kpi-desagio']),
    row(['table-rating']),
    row(['table-elegibilidade']),
  ],
};

const inadimplencia: DashboardTemplate = {
  id: 'inadimplencia',
  name: 'Inadimplência',
  description: 'Análise de inadimplência por faixa, safra e cobrança',
  category: 'Operacional',
  blockMap: {
    'kpi-inadimplentes': kpi('kpi-inadimplentes', 'Contratos Inadimplentes'),
    'kpi-valor-atraso': kpi('kpi-valor-atraso', 'Valor em Atraso'),
    'kpi-inadimplencia': kpi('kpi-inadimplencia', 'Inadimplência'),
    'chart-faixa': chart('chart-faixa', 'Contratos por Faixa de Atraso', 'bar', ['contratos'], 'faixa_atraso', 2),
    'chart-safra': chart('chart-safra', 'Inadimplência por Safra', 'line', ['inadimplencia'], 'safra'),
    'table-faixa': table('table-faixa', 'Inadimplência por Faixa de Atraso', [
      { header: 'Faixa', accessorKey: 'faixa_atraso' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Valor Atraso', accessorKey: 'valor_atraso', format: 'currency' },
    ], 3),
  },
  layout: [
    row(['kpi-inadimplentes', 'kpi-valor-atraso', 'kpi-inadimplencia']),
    row(['chart-faixa', 'chart-safra']),
    row(['table-faixa']),
  ],
};

const repasse: DashboardTemplate = {
  id: 'repasse',
  name: 'Estratégia de Repasse',
  description: 'Grupos de estratégia, saldo por grupo e restrições',
  category: 'Operacional',
  blockMap: {
    'kpi-contratos': kpi('kpi-contratos', 'Total de Contratos'),
    'kpi-saldo': kpi('kpi-saldo', 'Saldo Devedor Total'),
    'kpi-indice': kpi('kpi-indice', 'Índice de Repasse Médio'),
    'table-grupos': table('table-grupos', 'Grupos de Estratégia', [
      { header: 'Grupo', accessorKey: 'grupo' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Saldo', accessorKey: 'saldo_devedor', format: 'currency' },
    ], 3),
    'chart-saldo': chart('chart-saldo', 'Saldo Devedor por Grupo', 'bar', ['saldo_devedor'], 'grupo', 3),
  },
  layout: [
    row(['kpi-contratos', 'kpi-saldo', 'kpi-indice']),
    row(['table-grupos']),
    row(['chart-saldo']),
  ],
};

const simulacaoLtv: DashboardTemplate = {
  id: 'simulacao-ltv',
  name: 'Simulação de LTV',
  description: 'Análise LTV banco, stress e distribuição por faixa',
  category: 'Risco',
  blockMap: {
    'kpi-ltv80-contratos': kpi('kpi-ltv80-contratos', 'Contratos com LTV > 80%'),
    'kpi-ltv80-saldo': kpi('kpi-ltv80-saldo', 'Saldo Devedor com LTV > 80%'),
    'chart-ltv-faixa': chart('chart-ltv-faixa', 'LTV Banco por Faixa', 'bar', ['contratos'], 'faixa_ltv', 3),
    'table-matriz': table('table-matriz', 'Matriz LTV x LTV Stress', [
      { header: 'Faixa LTV', accessorKey: 'faixa_ltv' },
      { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
      { header: 'Saldo', accessorKey: 'saldo_devedor', format: 'currency' },
      { header: 'LTV Médio', accessorKey: 'ltv_medio', format: 'percent' },
    ], 3),
  },
  layout: [
    row(['kpi-ltv80-contratos', 'kpi-ltv80-saldo']),
    row(['chart-ltv-faixa']),
    row(['table-matriz']),
  ],
};

const detalhamento: DashboardTemplate = {
  id: 'detalhamento',
  name: 'Detalhamento',
  description: 'Base analítica completa de contratos da carteira',
  category: 'Operacional',
  blockMap: {
    'table-contratos': table('table-contratos', 'Contratos da Carteira', [
      { header: 'Contrato', accessorKey: 'id_contrato' },
      { header: 'Projeto', accessorKey: 'projeto' },
      { header: 'Saldo Devedor', accessorKey: 'saldo_devedor', format: 'currency' },
      { header: 'Dias Atraso', accessorKey: 'dias_atraso', format: 'number' },
      { header: 'Rating', accessorKey: 'rating' },
      { header: 'LTV', accessorKey: 'ltv', format: 'percent' },
    ], 3),
  },
  layout: [
    row(['table-contratos']),
  ],
};

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  visaoGeral,
  contratos,
  pagamentos,
  fluxoCaixa,
  pdd,
  pricing,
  simulacaoLtv,
  inadimplencia,
  repasse,
  detalhamento,
];

export const TEMPLATE_CATEGORIES = ['Carteira', 'Risco', 'Operacional'] as const;

export function getTemplateById(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/dashboard-templates.ts
git commit -m "feat(templates): add dashboard template registry with 10 templates"
```

---

### Task 2: Create TemplateGallery component

**Files:**
- Create: `src/widgets/nav-sidebar/ui/TemplateGallery.tsx`

- [ ] **Step 1: Create template gallery UI**

A grid of template cards grouped by category, shown inside the NewReportModal when user clicks "Importar template".

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import {
  DASHBOARD_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type DashboardTemplate,
} from '@/shared/config/dashboard-templates';
import { useReports } from '@/shared/hooks/useReports';
import { useAppStore } from '@/shared/stores/app-store';
import { BarChart3, PieChart, Activity } from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Carteira: BarChart3,
  Risco: PieChart,
  Operacional: Activity,
};

interface TemplateGalleryProps {
  groupId: string;
  onClose: () => void;
}

export function TemplateGallery({ groupId, onClose }: TemplateGalleryProps) {
  const router = useRouter();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const { create } = useReports(groupId);
  const setActiveReport = useAppStore((s) => s.setActiveReport);

  const handleImport = async (template: DashboardTemplate) => {
    // Deep clone blockMap to avoid shared references
    const blockMap = JSON.parse(JSON.stringify(template.blockMap));
    const layout = JSON.parse(JSON.stringify(template.layout));
    // Assign new IDs to blocks and rows
    const idMap = new Map<string, string>();
    const newBlockMap: Record<string, any> = {};
    for (const [oldId, block] of Object.entries(blockMap)) {
      const newId = crypto.randomUUID().slice(0, 8);
      idMap.set(oldId, newId);
      newBlockMap[newId] = { ...block, id: newId };
    }
    const newLayout = layout.map((row: any) => ({
      id: crypto.randomUUID().slice(0, 8),
      blockIds: row.blockIds.map((bid: string) => idMap.get(bid) ?? bid),
    }));

    const reportId = await create(template.name, newBlockMap, newLayout);
    setActiveReport(groupId, reportId);
    onClose();
    router.push(`/g/${groupId}/r/${reportId}`);
  };

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {TEMPLATE_CATEGORIES.map((category) => {
        const templates = DASHBOARD_TEMPLATES.filter((t) => t.category === category);
        if (templates.length === 0) return null;
        const Icon = CATEGORY_ICONS[category] ?? BarChart3;

        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-widest text-white/30">{category}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleImport(template)}
                  className="flex flex-col items-start rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors text-left"
                >
                  <p className="text-[12px] font-medium text-white/80">{template.name}</p>
                  <p className="text-[10px] text-white/30 mt-0.5 line-clamp-2">{template.description}</p>
                  <p className="text-[9px] text-white/20 mt-1.5">
                    {Object.keys(template.blockMap).length} blocos
                  </p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/nav-sidebar/ui/TemplateGallery.tsx
git commit -m "feat(templates): add TemplateGallery component with category grouping"
```

---

### Task 3: Update NewReportModal to enable template import

**Files:**
- Modify: `src/widgets/nav-sidebar/ui/NewReportModal.tsx`

- [ ] **Step 1: Add template selection state and gallery**

Update the modal to have two views:
1. Initial view: "Criar do zero" + "Importar template" buttons
2. Template view: shows TemplateGallery when "Importar template" is clicked

```tsx
// Add imports
import { useState } from 'react';
import { TemplateGallery } from './TemplateGallery';
import { ArrowLeft } from 'lucide-react';
```

Add state:
```tsx
const [showTemplates, setShowTemplates] = useState(false);
```

Reset on open:
```tsx
// In the Dialog onOpenChange
onOpenChange={(v) => { if (!v) { onClose(); setShowTemplates(false); } }}
```

Replace the disabled "Importar template" button with an enabled one:
```tsx
<button
  onClick={() => setShowTemplates(true)}
  className="flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors text-left"
>
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
    <LayoutTemplate className="h-5 w-5 text-white/60" />
  </div>
  <div>
    <p className="text-[13px] font-medium text-white/90">Importar template</p>
    <p className="text-[11px] text-white/40">Comece com um dashboard pronto</p>
  </div>
</button>
```

When `showTemplates` is true, replace the dialog content with:
```tsx
{showTemplates ? (
  <>
    <DialogHeader>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowTemplates(false)}
          className="h-7 w-7 flex items-center justify-center rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <DialogTitle className="text-white text-[15px]">Escolher Template</DialogTitle>
      </div>
    </DialogHeader>
    <TemplateGallery groupId={groupId} onClose={() => { onClose(); setShowTemplates(false); }} />
  </>
) : (
  // ... existing initial view with the two buttons
)}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/widgets/nav-sidebar/ui/NewReportModal.tsx
git commit -m "feat(templates): enable template import in NewReportModal"
```

---

### Task 4: Build verification and polish

**Files:**
- Possibly adjust: multiple files

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Fix any TypeScript errors.

- [ ] **Step 2: Commit any fixes**

```bash
git add -u
git commit -m "fix: phase 4 template build polish"
```
