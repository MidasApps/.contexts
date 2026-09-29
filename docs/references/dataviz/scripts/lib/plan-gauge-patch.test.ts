/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { patchBlockMap, TARGET_GAUGE } from './plan-gauge-patch.mjs';

const OLD = {
  id: 'gauge-pe-divida-limite', type: 'gauge', label: 'Dívida vs. Limite do Plano Empresário', value: 0,
  threshold: 45000000, format: 'currency', reverseScale: true, metricId: 'covenants.plano_empresario_divida', colSpan: 2,
};

describe('patch do medidor do plano empresário', () => {
  it('troca o medidor antigo pelo do template, mantendo id e largura', () => {
    const next = patchBlockMap({ [OLD.id]: OLD, outro: { id: 'outro', type: 'kpi' } });
    expect(next?.[OLD.id]).toMatchObject({
      metricId: 'covenants.plano_empresario_uso_pct', threshold: 100, suffix: '%', colSpan: 2,
    });
    expect(next?.[OLD.id]).not.toHaveProperty('format');
    expect(next?.outro).toEqual({ id: 'outro', type: 'kpi' });
  });

  it('é idempotente: documento já corrigido não tem o que trocar', () => {
    expect(patchBlockMap({ [OLD.id]: { ...TARGET_GAUGE } })).toBeNull();
  });

  it('não toca gauge da dívida com limite próprio', () => {
    expect(patchBlockMap({ g: { ...OLD, id: 'g', threshold: 20000000 } })).toBeNull();
  });
});
