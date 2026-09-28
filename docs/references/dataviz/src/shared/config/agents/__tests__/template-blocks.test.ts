import { describe, it, expect } from 'vitest';
import { makeEmptyBlock, deriveMetricRefs } from '../template-blocks';
import type { CanvasBlock } from '../types';

describe('makeEmptyBlock', () => {
  it('cria KPI com defaults e id único', () => {
    const b = makeEmptyBlock('kpi');
    expect(b.type).toBe('kpi');
    expect(b.id).toBeTruthy();
    expect(makeEmptyBlock('kpi').id).not.toBe(b.id);
  });
  it('cria chart/table/text', () => {
    expect(makeEmptyBlock('chart').type).toBe('chart');
    expect(makeEmptyBlock('table').type).toBe('table');
    expect(makeEmptyBlock('text').type).toBe('text');
  });
});

describe('deriveMetricRefs', () => {
  it('extrai metricId únicos, ignora blocos sem metricId', () => {
    const blockMap: Record<string, CanvasBlock> = {
      a: { id: 'a', type: 'kpi', label: 'A', value: '—', metricId: 'dashboard.x' },
      b: { id: 'b', type: 'chart', chartType: 'bar', data: [], dataKeys: [], xAxisKey: 'n', metricId: 'dashboard.x' },
      c: { id: 'c', type: 'text', content: 'oi' },
      d: { id: 'd', type: 'table', columns: [], rows: [], metricId: 'pdd.y' },
    };
    expect(deriveMetricRefs(blockMap).sort()).toEqual(['dashboard.x', 'pdd.y']);
  });
});
