import { describe, it, expect } from 'vitest';
import { buildAutoFillPrompt } from './auto-fill-prompt';
import type { CanvasBlock } from '@/shared/config/agents/types';

const kpi = (id: string, label: string, metricId?: string): CanvasBlock =>
  ({ id, type: 'kpi', label, ...(metricId ? { metricId } : {}) }) as CanvasBlock;
const chart = (id: string, title: string, metricId?: string): CanvasBlock =>
  ({ id, type: 'chart', chartType: 'line', title, ...(metricId ? { metricId } : {}) }) as CanvasBlock;
const text = (id: string): CanvasBlock => ({ id, type: 'text', content: 'Nota' });

describe('buildAutoFillPrompt', () => {
  /**
   * O defeito: o documento salvo só tem configuração (ADR-0015), então o
   * critério antigo — sem `value`/`data`/`rows` — via todo bloco como vazio e
   * disparava o LLM em qualquer `?edit=1`.
   */
  it('returns null when every data block already has a metric, even without data', () => {
    const blockMap = {
      a: kpi('a', 'Vendas', 'imobiliaria.vendas_qtd_mes'),
      b: chart('b', 'VGV por mês', 'imobiliaria.vgv_mes'),
    };
    expect(buildAutoFillPrompt(blockMap)).toBeNull();
  });

  it('returns null for a blank page', () => {
    expect(buildAutoFillPrompt({})).toBeNull();
    expect(buildAutoFillPrompt(undefined)).toBeNull();
  });

  it('ignores blocks that do not consume a metric', () => {
    expect(buildAutoFillPrompt({ t: text('t') })).toBeNull();
  });

  it('names only the blocks that still lack a metric', () => {
    const blockMap = {
      a: kpi('a', 'Vendas', 'imobiliaria.vendas_qtd_mes'),
      b: kpi('b', 'Locações'),
      c: chart('c', 'Receita por mês'),
    };
    expect(buildAutoFillPrompt(blockMap)).toBe(
      'Preencha os blocos desta página que ainda não têm métrica: Locações, Receita por mês.',
    );
  });

  it('asks generically when the unbound blocks have no name', () => {
    const unnamed = { id: 'x', type: 'chart', chartType: 'bar' } as CanvasBlock;
    expect(buildAutoFillPrompt({ x: unnamed })).toBe(
      'Preencha os blocos desta página que ainda não têm métrica.',
    );
  });
});
