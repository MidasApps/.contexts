import { describe, it, expect } from 'vitest';
import { rejectUnknownMetric } from './metric-guard';

const catalog = [
  'covenants.inadimplencia_total',
  'covenants.inadimplencia_over90',
  'covenants.ltv_medio',
  'covenants.saldo_devedor',
  'dashboard.contratos_ativos',
];

describe('rejectUnknownMetric', () => {
  it('deixa passar métrica que existe', () => {
    expect(rejectUnknownMetric(catalog, 'covenants.ltv_medio')).toBeNull();
  });

  /**
   * Bloco com métrica inexistente nunca carrega dado, e o usuário só descobre
   * olhando a página quebrada — depois de a IA anunciar sucesso.
   */
  it('recusa métrica inventada e sugere as do mesmo domínio', () => {
    const r = rejectUnknownMetric(catalog, 'covenants.taxa_de_repasse');
    expect(r?.error).toBe('METRIC_NOT_FOUND');
    expect(r?.candidatos).toContain('covenants.ltv_medio');
    expect(r?.message).toMatch(/não existe no catálogo/i);
  });

  it('sugere por pedaço do slug quando o domínio não bate', () => {
    const r = rejectUnknownMetric(catalog, 'play.inadimplencia_90_dias');
    expect(r?.candidatos).toEqual(
      expect.arrayContaining(['covenants.inadimplencia_total', 'covenants.inadimplencia_over90']),
    );
  });

  it('sem nada parecido, manda avisar o usuário em vez de criar', () => {
    const r = rejectUnknownMetric(catalog, 'rh.turnover');
    expect(r?.candidatos).toEqual([]);
    expect(r?.message).toMatch(/não crie o bloco/i);
  });

  // Refs de catálogo degradam soft; só resolução de dado é fail-loud.
  it('sem catálogo não opina', () => {
    expect(rejectUnknownMetric(undefined, 'qualquer.coisa')).toBeNull();
    expect(rejectUnknownMetric([], 'qualquer.coisa')).toBeNull();
  });
});
