import { describe, it, expect } from 'vitest';
import { collectMetricErrors } from '../useReportData';

describe('collectMetricErrors', () => {
  it('coleta erro por métrica que falhou', () => {
    const results = {
      'covenants.indice_recebivel': { ok: true, data: [{ v: 1 }] },
      'covenants.obra_serie': { ok: false, error: 'Erro ao executar métrica' },
    };
    expect(collectMetricErrors(results)).toEqual({ 'covenants.obra_serie': 'Erro ao executar métrica' });
  });
  it('sem falhas → objeto vazio', () => {
    expect(collectMetricErrors({ a: { ok: true, data: [] } })).toEqual({});
  });
});
