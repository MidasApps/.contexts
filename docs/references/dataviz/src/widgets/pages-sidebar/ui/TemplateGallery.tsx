'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TEMPLATE_CATEGORIES,
  type TemplateSegment,
} from '@/shared/config/dashboard-templates';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { useReports } from '@/shared/hooks/useReports';
import { useTemplates } from '@/shared/hooks/useTemplates';
import { useProductsList } from '@/shared/hooks/useProducts';
import { useAvailableProducts } from '@/shared/hooks/useActiveProduct';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { useAppStore } from '@/shared/stores/app-store';
import {
  BarChart3,
  PieChart,
  Activity,
  Gauge,
  LineChart,
  Table2,
  Layers,
  ArrowRight,
  Crown,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Carteira: BarChart3,
  Risco: PieChart,
  Operacional: Activity,
  Covenants: Crown,
};

const SEGMENT_META: Record<TemplateSegment, { label: string; color: string }> = {
  sbpe: { label: 'SBPE', color: '#10B981' },
  mcmv: { label: 'MCMV', color: '#3B82F6' },
  both: { label: 'SBPE+MCMV', color: '#A1A1AA' },
};

type SegmentFilter = 'all' | TemplateSegment;

interface TemplateGalleryProps {
  groupId: string;
  onClose: () => void;
}

interface BlockSummary {
  kpis: { id: string; label: string }[];
  charts: { id: string; title: string; chartType?: string }[];
  tables: { id: string; title: string; columns: number }[];
}

function summarizeBlocks(blockMap: Record<string, CanvasBlock>): BlockSummary {
  const summary: BlockSummary = { kpis: [], charts: [], tables: [] };
  for (const [id, block] of Object.entries(blockMap)) {
    if (block.type === 'kpi' || block.type === 'kpis') {
      const label = (block as { label?: string }).label ?? id;
      summary.kpis.push({ id, label });
    } else if (block.type === 'chart') {
      const b = block as { title?: string; chartType?: string };
      summary.charts.push({ id, title: b.title ?? id, chartType: b.chartType });
    } else if (block.type === 'table') {
      const b = block as { title?: string; columns?: unknown[] };
      summary.tables.push({ id, title: b.title ?? id, columns: b.columns?.length ?? 0 });
    }
  }
  return summary;
}

const CHART_TYPE_LABEL: Record<string, string> = {
  bar: 'Barras',
  line: 'Linha',
  area: 'Área',
  composed: 'Composto',
  'stacked-bar': 'Empilhado',
};

export function TemplateGallery({ groupId, onClose }: TemplateGalleryProps) {
  const router = useRouter();
  const { create } = useReports(groupId);
  const { templates, loading: templatesLoading } = useTemplates();
  const { products } = useProductsList();
  const availableProducts = useAvailableProducts();
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const [productFilter, setProductFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');

  // Produtos contratados pelo cliente ativo (cliente legado → todos; vazio
  // durante o load → sem escopo, mostra tudo).
  const clientProductIds = useMemo(
    () => new Set(availableProducts.map((p) => p.id)),
    [availableProducts],
  );

  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  // Chips de produto derivados dos productRefs efetivamente referenciados
  // pelos templates (não de um enum fixo), intersectados com os produtos
  // contratados pelo cliente.
  const productOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of templates) for (const id of t.productRefs ?? []) ids.add(id);
    return Array.from(ids)
      .filter((id) => clientProductIds.size === 0 || clientProductIds.has(id))
      .map((id) => ({
        id,
        name: productById[id]?.name ?? id,
        color: productById[id]?.color,
      }));
  }, [templates, productById, clientProductIds]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // Escopo por produto contratado: esconde templates cujos productRefs o
      // cliente não assinou (size===0 = load/sem bindings → não filtra).
      if (
        clientProductIds.size > 0 &&
        !(t.productRefs ?? []).some((id) => clientProductIds.has(id))
      ) {
        return false;
      }
      if (productFilter !== 'all' && !(t.productRefs ?? []).includes(productFilter)) return false;
      if (segmentFilter !== 'all') {
        // segment 'both' passa por qualquer filtro de segmento; ausente = só
        // passa quando filtro é 'all'.
        if (!t.segment) return false;
        if (t.segment !== 'both' && t.segment !== segmentFilter) return false;
      }
      return true;
    });
  }, [templates, productFilter, segmentFilter, clientProductIds]);

  const [selectedId, setSelectedId] = useState<string>('');

  // Se o template selecionado deixou de passar pelo filtro, escolhe o primeiro
  // dos visíveis.
  const effectiveSelectedId = useMemo(() => {
    if (filteredTemplates.some((t) => t.id === selectedId)) return selectedId;
    return filteredTemplates[0]?.id ?? selectedId;
  }, [filteredTemplates, selectedId]);

  const selected = useMemo(
    () =>
      templates.find((t) => t.id === effectiveSelectedId) ?? templates[0],
    [templates, effectiveSelectedId],
  );

  const summary = useMemo(() => (selected ? summarizeBlocks(selected.blockMap) : null), [selected]);
  const totalBlocks = selected ? Object.keys(selected.blockMap).length : 0;
  const totalMetrics = selected?.metricRefs?.length ?? 0;
  const totalRows = selected?.layout?.length ?? 0;

  const handleImport = async (template: TemplateRecord) => {
    const blockMap = JSON.parse(JSON.stringify(template.blockMap));
    const layout = JSON.parse(JSON.stringify(template.layout));
    const queries = template.queries ? JSON.parse(JSON.stringify(template.queries)) : undefined;
    const filters = template.filters ? JSON.parse(JSON.stringify(template.filters)) : undefined;
    const reportId = await create(
      template.name,
      blockMap,
      layout,
      queries,
      template.description,
      filters,
      template.id,
      template.productRefs,
      template.metricRefs,
    );
    setActiveReport(groupId, reportId);
    onClose();
    router.push(`/g/${groupId}/r/${reportId}`);
  };

  if (templatesLoading) {
    return <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground/60">Carregando templates…</div>;
  }
  if (templates.length === 0) {
    return <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground/60">Nenhum template disponível. Crie um em Admin → Dashboard Templates.</div>;
  }

  if (!selected || !summary) return null;

  return (
    <div className="flex h-[640px] max-h-[80vh]">
      {/* ─── Sidebar: filtros + categorias + templates ─── */}
      <aside className="w-[260px] shrink-0 border-r border-border overflow-y-auto">
        {/* Filtros */}
        <div className="p-3 border-b border-border space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80 mb-1.5">Produto</p>
            <div className="flex flex-wrap gap-1">
              <FilterChip
                active={productFilter === 'all'}
                onClick={() => setProductFilter('all')}
                label="Todos"
              />
              {productOptions.map((p) => (
                <FilterChip
                  key={p.id}
                  active={productFilter === p.id}
                  onClick={() => setProductFilter(p.id)}
                  label={p.name}
                  color={p.color}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80 mb-1.5">Segmento</p>
            <div className="flex flex-wrap gap-1">
              <FilterChip
                active={segmentFilter === 'all'}
                onClick={() => setSegmentFilter('all')}
                label="Todos"
              />
              {(['sbpe', 'mcmv'] as TemplateSegment[]).map((seg) => {
                const meta = SEGMENT_META[seg];
                return (
                  <FilterChip
                    key={seg}
                    active={segmentFilter === seg}
                    onClick={() => setSegmentFilter(seg)}
                    label={meta.label}
                    color={meta.color}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-5">
          {TEMPLATE_CATEGORIES.map((category) => {
            const templates = filteredTemplates.filter((t) => t.category === category);
            if (templates.length === 0) return null;
            const Icon = CATEGORY_ICONS[category] ?? BarChart3;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 px-2 mb-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground/60" strokeWidth={1.5} />
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80">{category}</p>
                </div>
                <div className="space-y-0.5">
                  {templates.map((t) => {
                    const isSelected = t.id === effectiveSelectedId;
                    const count = Object.keys(t.blockMap).length;
                    const firstColor =
                      productById[t.productRefs?.[0] ?? '']?.color ?? 'var(--color-muted-foreground)';
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-muted/50 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: firstColor }}
                        />
                        <span className="text-[12px] font-medium truncate flex-1">{t.name}</span>
                        {t.segment && t.segment !== 'both' && (
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wider px-1 rounded shrink-0"
                            style={{
                              color: SEGMENT_META[t.segment].color,
                              background: `${SEGMENT_META[t.segment].color}1a`,
                            }}
                          >
                            {SEGMENT_META[t.segment].label}
                          </span>
                        )}
                        <span
                          className={`text-[10px] tabular-nums shrink-0 ${
                            isSelected ? 'text-muted-foreground' : 'text-muted-foreground/40'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ─── Detail panel ─── */}
      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  {selected.category}
                </span>
                {(selected.productRefs ?? []).map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      color: productById[id]?.color ?? undefined,
                      background: productById[id]?.color ? `${productById[id]!.color}1a` : 'var(--color-muted)',
                      border: `1px solid ${productById[id]?.color ?? 'var(--color-border)'}33`,
                    }}
                  >
                    {productById[id]?.name ?? id}
                  </span>
                ))}
                {selected.segment && selected.segment !== 'both' && (
                  <SegmentTag segment={selected.segment} />
                )}
              </div>
              <h2 className="text-[20px] font-semibold text-foreground tracking-tight">{selected.name}</h2>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-[520px]">{selected.description}</p>
            </div>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-2 mt-4">
            <StatBadge icon={Layers} label={`${totalBlocks} blocos`} />
            <StatBadge icon={Gauge} label={`${summary.kpis.length} KPIs`} />
            <StatBadge icon={LineChart} label={`${summary.charts.length} gráficos`} />
            <StatBadge icon={Table2} label={`${summary.tables.length} tabelas`} />
            <div className="flex-1" />
            <span className="text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
              {totalRows} linhas · {totalMetrics} métricas
            </span>
          </div>
        </header>

        {/* Body — indicators detail */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {summary.kpis.length > 0 && (
            <Section title="KPIs" count={summary.kpis.length} icon={Gauge}>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {summary.kpis.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 text-[12px] text-foreground/75">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    {k.label}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {summary.charts.length > 0 && (
            <Section title="Gráficos" count={summary.charts.length} icon={LineChart}>
              <ul className="space-y-1.5">
                {summary.charts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex items-center gap-2 text-foreground/75 min-w-0">
                      <span className="h-1 w-1 rounded-full bg-[#76614C] shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </span>
                    {c.chartType && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {CHART_TYPE_LABEL[c.chartType] ?? c.chartType}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {summary.tables.length > 0 && (
            <Section title="Tabelas" count={summary.tables.length} icon={Table2}>
              <ul className="space-y-1.5">
                {summary.tables.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex items-center gap-2 text-foreground/75 min-w-0">
                      <span className="h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
                      <span className="truncate">{t.title}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{t.columns} colunas</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Métricas linkadas */}
          {selected.metricRefs?.length > 0 && (
            <Section title="Métricas vinculadas" count={selected.metricRefs.length} icon={Layers}>
              <div className="flex flex-wrap gap-1.5">
                {selected.metricRefs.map((id) => (
                  <code
                    key={id}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border"
                  >
                    {id}
                  </code>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2.5">
                IDs em <code className="text-muted-foreground/80">metrics/</code> no Firestore —
                cada métrica carrega <code className="text-muted-foreground/80">requires[]</code> apontando para
                atributos do Data Contract canônico.
              </p>
            </Section>
          )}
        </div>

        {/* Footer action */}
        <footer className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground/80">
            O template será criado em um novo relatório com os blocos pré-configurados.
          </p>
          <button
            onClick={() => handleImport(selected)}
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-[#0A0B10] px-4 py-2 text-[12px] font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Usar este template
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </section>
    </div>
  );
}

function StatBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 border border-border text-[10px] text-muted-foreground">
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {label}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium transition-colors ${
        active
          ? 'border-transparent text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
      }`}
      style={
        active
          ? {
              background: color ? `${color}26` : 'var(--color-muted)',
              borderColor: color ? `${color}66` : 'var(--color-border)',
              color: color ?? '#fff',
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

function SegmentTag({ segment }: { segment: TemplateSegment }) {
  const meta = SEGMENT_META[segment];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: meta.color,
        background: `${meta.color}1a`,
        border: `1px solid ${meta.color}33`,
      }}
    >
      {meta.label}
    </span>
  );
}

function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/80" strokeWidth={1.5} />
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {title} <span className="text-muted-foreground/40 ml-1">({count})</span>
        </h3>
      </div>
      {children}
    </div>
  );
}
