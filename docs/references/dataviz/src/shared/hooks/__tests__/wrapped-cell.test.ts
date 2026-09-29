import { describe, it, expect } from 'vitest';
import type { CanvasBlock, DonutBlock, GaugeBlock, SingleKpiBlock } from '@/shared/config/agents/types';
import { applyMetricRowsToBlock, applySparklineRowsToKpi } from '@/shared/hooks/useReportData';

/**
 * Nenhum bloco pode exibir `[object Object]`.
 *
 * DATE, DATETIME, TIMESTAMP e TIME chegam do BigQuery embrulhados em
 * `{ value: ... }`, e o embrulho atravessa o JSON da API — `String()` sobre ele
 * produz literalmente `[object Object]`. Três indicadores do Vila Rosa
 * exibiam isso: "Data Consulta" (covenants/certidoes), "Previsão de Entrega"
 * (covenants/empreendimento) e "Data da Medição" (covenants/evolucao-obra).
 *
 * O KPI era o único ramo de `applyMetricRowsToBlock` que nem desembrulhava a
 * célula nem protegia o `String()` de fallback. Medidor, rosca e sparkline
 * também não desembrulhavam — não imprimiam o objeto, mas trocavam o número
 * por `NaN`, por zero ou pelo valor velho, em silêncio.
 */

/** Bloco solto no shape do Firestore, sem o rigor do tipo em cada fixture. */
function block(props: Record<string, unknown>): CanvasBlock {
  return props as unknown as CanvasBlock;
}

/** A célula como o navegador a recebe: o embrulho já passou pelo JSON. */
const DATA = { value: '2026-09-15' };

describe('indicador com célula de data', () => {
  it('o KPI mostra a data, não [object Object]', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'covenants.certidoes_data_consulta', label: 'Data Consulta' });
    applyMetricRowsToBlock(b, [{ value: DATA }]);
    expect((b as SingleKpiBlock).value).toBe('15/09/2026');
  });

  it('nenhum formato declarado continua sem inventar moeda nem percentual', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', label: 'Previsão de Entrega' });
    applyMetricRowsToBlock(b, [{ value: DATA }]);
    expect((b as SingleKpiBlock).value).not.toMatch(/R\$|%/);
  });

  /* A coluna nem sempre se chama `value`: o ramo cai na primeira do resultado. */
  it('vale também quando a coluna tem outro nome', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', label: 'Data da Medição' });
    applyMetricRowsToBlock(b, [{ data_medicao: DATA }]);
    expect((b as SingleKpiBlock).value).toBe('15/09/2026');
  });

  /*
   * A garantia geral, e não só para data: o que sobrar de objeto vira o traço
   * de "sem valor" que o bloco já usa. Um cartão que não sabe o número diz que
   * não sabe; não mostra o nome interno de uma classe.
   */
  it('objeto que não é embrulho vira traço, nunca [object Object]', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', label: 'L' });
    applyMetricRowsToBlock(b, [{ value: { a: 1, b: 2 } }]);
    expect((b as SingleKpiBlock).value).toBe('—');
  });

  it('texto que não é número segue passando cru', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', label: 'L' });
    applyMetricRowsToBlock(b, [{ value: 'Adimplente' }]);
    expect((b as SingleKpiBlock).value).toBe('Adimplente');
  });

  it('número embrulhado formata como número', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', label: 'L', format: 'number' });
    applyMetricRowsToBlock(b, [{ value: { value: '1234' } }]);
    expect((b as SingleKpiBlock).value).toBe('1.234');
  });
});

/**
 * Os três que erravam em silêncio. Aqui o embrulho não vira texto — vira
 * `NaN`, e cada bloco o descarta de um jeito diferente: o medidor mantinha o
 * valor que veio do template, a rosca zerava a fatia e a sparkline apagava o
 * ponto. Nenhum deles avisava.
 */
describe('demais blocos com célula embrulhada', () => {
  it('o medidor lê o número, em vez de manter o valor velho', () => {
    const b = block({ id: 'g', type: 'gauge', metricId: 'm', label: 'L', value: 99, threshold: 1.2 });
    applyMetricRowsToBlock(b, [{ value: { value: '1.35' } }]);
    expect((b as GaugeBlock).value).toBe(1.35);
  });

  it('a rosca lê o número, em vez de zerar a fatia', () => {
    const b = block({ id: 'd', type: 'donut', metricId: 'm', label: 'L', slices: [] });
    applyMetricRowsToBlock(b, [{ faixa: { value: 'Sem atraso' }, value: { value: '42' } }]);
    expect((b as DonutBlock).slices).toEqual([{ name: 'Sem atraso', value: 42 }]);
  });

  it('a sparkline mantém os pontos embrulhados', () => {
    const b = block({ id: 'k', type: 'kpi', metricId: 'm', sparklineMetricId: 's', label: 'L' }) as SingleKpiBlock;
    applySparklineRowsToKpi(b, [
      { bucket: { value: '2026-01-01' }, value: { value: '10' } },
      { bucket: { value: '2026-02-01' }, value: { value: '12' } },
    ]);
    expect(b.sparklineData).toEqual([10, 12]);
    expect(b.sparklineMonths).toEqual(['2026-01-01', '2026-02-01']);
  });
});
