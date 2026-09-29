/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { templates, groups } from '../real-estate.mjs';
import { metrics as CATALOG } from '../../metrics/real-estate.mjs';
import { DashboardTemplateDoc, TemplateId } from '@/shared/schemas/dashboard-template';
import { blockSpec, type BlockType } from '@/features/report-authoring/schema/block-specs';
import type { MetricShape } from '@/shared/schemas/metric';

interface Block { id: string; type: BlockType; threshold?: number; format?: string; yFormat?: string; xFormat?: string; metricId?: string; sparklineMetricId?: string; columns?: Array<{ accessorKey: string }>; dataKeys?: string[]; xAxisKey?: string }
interface Template { id: string; blockMap: Record<string, Block>; layout: Array<{ id: string; blockIds: string[] }>; metricRefs: string[] }
const byId = new Map((CATALOG as Array<{ id: string; shape: MetricShape; outputColumns: string[]; recipe: { template: string } }>).map((m) => [m.id, m]));
const isInPoints = (t: string) => /^SELECT \* REPLACE \(/.test(t);
const templateList = templates as Template[];

describe('templates imobiliaria-*', () => {
  it('são 25 páginas em 8 grupos, com ids únicos e válidos', () => {
    expect(templateList).toHaveLength(25);
    expect(groups).toHaveLength(8);
    expect(new Set(templateList.map((t) => t.id)).size).toBe(25);
    for (const t of templateList) expect(TemplateId.safeParse(t.id).success, t.id).toBe(true);
  });

  it('passam no schema DashboardTemplateDoc', () => {
    for (const t of templateList) {
      const r = DashboardTemplateDoc.safeParse({ ...t, createdAt: 0, updatedAt: 0 });
      expect(r.success, `${t.id}: ${JSON.stringify(r.success ? '' : r.error.issues.slice(0, 2))}`).toBe(true);
    }
  });

  it('todo metricId existe no catálogo e o bloco aceita a forma da métrica', () => {
    const errors: string[] = [];
    for (const t of templateList) {
      for (const b of Object.values(t.blockMap)) {
        for (const ref of [b.metricId, b.sparklineMetricId]) {
          if (!ref) continue;
          const m = byId.get(ref);
          if (!m) { errors.push(`${t.id}/${b.id}: métrica ${ref} não existe`); continue; }
          if (ref === b.sparklineMetricId) { if (m.shape !== 'timeseries') errors.push(`${t.id}/${b.id}: sparkline ${ref} precisa ser timeseries {bucket,value}`); continue; }
          const spec = blockSpec(b.type);
          if (!spec.accepts.includes(m.shape)) errors.push(`${t.id}/${b.id}: ${b.type} não aceita ${m.shape} (${ref})`);
          // KPI e tabela multiplicam percent por 100; gauge/progress/chart/heatmap/scatter não — a escala da métrica tem de casar com o bloco.
          // Desde a ADR-0032, KPI e tabela respeitam `percentPointColumns`: métrica em pontos DECLARADA é segura neles.
          const inPoints = isInPoints(m.recipe.template);
          const declaresPoints = Boolean((m as { percentPointColumns?: string[] }).percentPointColumns?.length);
          const multipliesBy100 = b.type === 'kpi' || b.type === 'table';
          if (inPoints && multipliesBy100 && !declaresPoints) errors.push(`${t.id}/${b.id}: ${ref} está em pontos mas ${b.type} multiplica por 100`);
          // ADR-0033: gauge/progress/gráfico levam métrica em fração para pontos sozinhos; o que resta
          // cobrar é o limite configurado no bloco, que em `percent` é sempre em pontos.
          if (b.type === 'gauge' && b.format === 'percent' && Math.abs(b.threshold ?? 0) > 0 && Math.abs(b.threshold ?? 0) < 1) errors.push(`${t.id}/${b.id}: threshold de gauge percent em fração (use pontos)`);
          if (b.type === 'table') for (const c of b.columns ?? []) if (!m.outputColumns.includes(c.accessorKey)) errors.push(`${t.id}/${b.id}: coluna ${c.accessorKey} não existe em ${ref}`);
          if (b.type === 'chart') {
            for (const k of b.dataKeys ?? []) if (!m.outputColumns.includes(k)) errors.push(`${t.id}/${b.id}: dataKey ${k} não existe em ${ref}`);
            if (b.xAxisKey && !m.outputColumns.includes(b.xAxisKey)) errors.push(`${t.id}/${b.id}: xAxisKey ${b.xAxisKey} não existe em ${ref}`);
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it('layout referencia só blocos do blockMap, sem repetir, e metricRefs cobre os blocos', () => {
    for (const t of templateList) {
      const ids = t.layout.flatMap((r) => r.blockIds);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      for (const id of ids) expect(t.blockMap[id], `${t.id}: ${id}`).toBeDefined();
      expect(ids.length).toBe(Object.keys(t.blockMap).length);
      for (const b of Object.values(t.blockMap)) if (b.metricId) expect(t.metricRefs).toContain(b.metricId);
    }
  });

  it('o catálogo inteiro é usado por alguma página', () => {
    const usedIds = new Set(templateList.flatMap((t) => t.metricRefs));
    const orphans = [...byId.keys()].filter((id) => !usedIds.has(id));
    expect(orphans).toEqual([]);
  });
});
