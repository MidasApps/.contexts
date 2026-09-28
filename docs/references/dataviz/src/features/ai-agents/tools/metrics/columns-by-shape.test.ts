import { describe, it, expect } from 'vitest';
import { checkColumns, blockKeysHint } from './columns-by-shape';
import { authorableSpecs } from '@/features/report-authoring/schema/block-specs';

describe('checkColumns', () => {
  it('exige `value` sozinho no scalar', () => {
    expect(checkColumns('scalar', ['value']).ok).toBe(true);
    expect(checkColumns('scalar', ['total']).ok).toBe(false);
    expect(checkColumns('scalar', ['value', 'bucket']).ok).toBe(false);
  });

  it('exige bucket e value na timeseries, nessa ordem', () => {
    expect(checkColumns('timeseries', ['bucket', 'value']).ok).toBe(true);
    expect(checkColumns('timeseries', ['value', 'bucket']).ok).toBe(false);
    expect(checkColumns('timeseries', ['mes', 'value']).ok).toBe(false);
  });

  it('aceita qualquer número de séries depois do bucket', () => {
    expect(checkColumns('timeseries_multi', ['bucket', 'entradas', 'saidas']).ok).toBe(true);
    expect(checkColumns('timeseries_pivot', ['bucket', 'a', 'b', 'c']).ok).toBe(true);
    expect(checkColumns('timeseries_multi', ['bucket']).ok).toBe(false);
  });

  it('deixa o nome da dimensão livre no breakdown, mas exige `value`', () => {
    expect(checkColumns('breakdown', ['faixa_atraso', 'value']).ok).toBe(true);
    expect(checkColumns('breakdown', ['faixa_atraso', 'total']).ok).toBe(false);
  });

  it('não opina sobre `rows` além de exigir alguma coluna', () => {
    expect(checkColumns('rows', ['contrato', 'cliente', 'saldo']).ok).toBe(true);
    expect(checkColumns('rows', []).ok).toBe(false);
  });

  it('diz o que está errado, com o que veio e o que se esperava', () => {
    const r = checkColumns('scalar', ['total']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('total');
      expect(r.error).toContain('value');
    }
  });

  /**
   * Anti-drift: a régua por bloco (`block-specs.expectedColumns`) e a régua por
   * forma (aqui) descrevem o mesmo contrato. Se um bloco mudar as colunas que
   * espera, este teste falha antes de a métrica criada pela IA ficar vazia.
   * Entram só os blocos de forma única e sem nome livre (`<dimensão>`).
   */
  it('casa com expectedColumns dos blocos de forma única', () => {
    const checked = authorableSpecs().filter(
      (s) => s.accepts.length === 1
        && s.expectedColumns.length > 0
        && !s.expectedColumns.some((c) => c.includes('<')),
    );
    expect(checked.length).toBeGreaterThan(4);

    for (const spec of checked) {
      const r = checkColumns(spec.accepts[0]!, spec.expectedColumns);
      expect(r.ok, `${spec.type} (${spec.accepts[0]}): ${r.ok ? '' : r.error}`).toBe(true);
    }
  });
});

/**
 * Visto no primeiro uso real: métrica criada com bucket/value e gráfico montado
 * com xAxisKey "mes" — a linha desenha e o eixo X fica em branco.
 */
describe('blockKeysHint', () => {
  it('diz o eixo e as séries com os nomes que a query devolve', () => {
    const hint = blockKeysHint(['bucket', 'value']);
    expect(hint).toContain('xAxisKey: "bucket"');
    expect(hint).toContain('dataKeys: ["value"]');
  });

  it('lista todas as séries de uma métrica multi', () => {
    expect(blockKeysHint(['bucket', 'entradas', 'saidas'])).toContain('["entradas", "saidas"]');
  });

  it('cala a boca no escalar — não há eixo a informar', () => {
    expect(blockKeysHint(['value'])).toBeUndefined();
  });
});
