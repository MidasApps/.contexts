'use client';

import {
  Hash, Gauge, Target, ArrowLeftRight, BarChart3, PieChart, ScatterChart,
  Grid3x3, ListChecks, Activity, Table2, Type, Plus,
  Filter, Shuffle, BoxSelect, LayoutDashboard,
} from 'lucide-react';
import type { PaletteBlockType } from '@/shared/config/agents/template-blocks';

interface BlockPaletteProps {
  onAdd: (type: PaletteBlockType) => void;
}

interface PaletteItem {
  type: PaletteBlockType;
  label: string;
  icon: React.ElementType;
  /** Vira o `title` do botão — a mesma frase que o contrato dá à IA, encurtada. */
  hint: string;
}

/**
 * Agrupados pelo que respondem, não pelo formato: primeiro os de um número só,
 * depois os de distribuição, depois os de conjunto, e por fim o detalhe. É a
 * ordem em que se monta uma página.
 */
const GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: 'Um número',
    items: [
      { type: 'kpi', label: 'KPI', icon: Hash, hint: 'Um número único e atual' },
      { type: 'gauge', label: 'Com limite', icon: Gauge, hint: 'Número contra um mínimo contratado, com arco e folga' },
      { type: 'progress', label: 'Vs. meta', icon: Target, hint: 'Realizado contra o previsto, com barra de progresso' },
      { type: 'comparison', label: 'Vs. anterior', icon: ArrowLeftRight, hint: 'O número de agora ao lado do período anterior' },
    ],
  },
  {
    title: 'Distribuição',
    items: [
      { type: 'chart', label: 'Gráfico', icon: BarChart3, hint: 'Série no tempo ou comparação entre categorias' },
      { type: 'donut', label: 'Composição', icon: PieChart, hint: 'Como um total se reparte — rosca ou barra 100%' },
      { type: 'scatter', label: 'Dispersão', icon: ScatterChart, hint: 'Uma observação por ponto: agrupamento e outliers' },
      { type: 'heatmap', label: 'Matriz', icon: Grid3x3, hint: 'Grade linha × coluna pintada pela intensidade — safra' },
      { type: 'treemap', label: 'Concentração', icon: LayoutDashboard, hint: 'Peso por área, para muitas categorias desiguais' },
      { type: 'boxplot', label: 'Dispersão por grupo', icon: BoxSelect, hint: 'Mediana, quartis e extremos de cada grupo' },
    ],
  },
  {
    title: 'Fluxo',
    items: [
      { type: 'funnel', label: 'Funil', icon: Filter, hint: 'Etapas em sequência e onde a perda é maior' },
      { type: 'sankey', label: 'Migração', icon: Shuffle, hint: 'Quem saiu de um estado e foi para outro entre dois períodos' },
    ],
  },
  {
    title: 'Conjunto',
    items: [
      { type: 'targets', label: 'Com metas', icon: ListChecks, hint: 'Vários indicadores, cada um contra a sua meta' },
      { type: 'sparkrows', label: 'Tendências', icon: Activity, hint: 'Várias séries com histórico, uma por linha' },
    ],
  },
  {
    title: 'Detalhe',
    items: [
      { type: 'table', label: 'Tabela', icon: Table2, hint: 'Linha a linha, quando o agregado não basta' },
      { type: 'text', label: 'Texto', icon: Type, hint: 'Título de seção, nota ou explicação' },
    ],
  },
];

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80">
        <Plus className="size-3.5" /> Adicionar bloco:
      </span>
      {GROUPS.map((grupo, i) => (
        <div key={grupo.title} className="flex items-center gap-2">
          {/* Separador em vez de rótulo escrito: a paleta vive numa barra de
              ferramentas, e doze botões rotulados por grupo não caberiam. */}
          {i > 0 && <span aria-hidden="true" className="h-4 w-px bg-border" />}
          {grupo.items.map(({ type, label, icon: Icon, hint }) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              title={`${grupo.title} · ${hint}`}
              aria-label={`Adicionar bloco: ${label}. ${hint}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
