import { describe, it, expect } from 'vitest';
import type { CanvasBlock, SingleKpiBlock, ComparisonBlock } from '@/shared/config/agents/types';
import { applyComparisonToBlock, applySparklineRowsToKpi } from '../useReportData';

/**
 * O que o período comparativo escreve no bloco — e o que ele se recusa a
 * escrever.
 *
 * A regra que não é óbvia: métrica fixada em `MAX(data_base_report)` devolve o
 * MESMO número para qualquer período. As duas consultas voltam idênticas e a
 * variação daria 0,0% sempre — um selo de "sem variação" onde não houve
 * comparação nenhuma. É pior que selo nenhum: afirma um achado inexistente,
 * no mesmo espírito do "— 0%" que já foi removido deste card antes.
 */

const kpi = () => ({
  id: 'k', type: 'kpi', metricId: 'm', label: 'Inadimplência', value: '4,81%',
} as unknown as SingleKpiBlock);

const rows = (v: number) => [{ value: v }];

describe('applyComparisonToBlock', () => {
  it('KPI ganha a variação contra o período comparativo', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(120), rows(100));
    expect(b.deltaPercent).toBe('20,0%');
    expect(b.deltaDirection).toBe('up');
  });

  it('queda vira direção para baixo', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(80), rows(100));
    expect(b.deltaPercent).toBe('-20,0%');
    expect(b.deltaDirection).toBe('down');
  });

  /** Zero exato não recebe seta: apontar direção que não houve é afirmar. */
  it('sem variação não inventa direção', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(100), rows(100));
    expect(b.deltaPercent).toBe('0,0%');
    expect(b.deltaDirection).toBeUndefined();
  });

  it('métrica fixada no último mês NÃO recebe selo', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(100), rows(100), false);
    expect(b.deltaPercent).toBeUndefined();
    expect(b.deltaDirection).toBeUndefined();
  });

  it('base zero não produz variação infinita', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(50), rows(0));
    expect(b.deltaPercent).toBeUndefined();
  });

  it('período comparativo sem linhas não mexe no bloco', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(50), []);
    expect(b.deltaPercent).toBeUndefined();
  });

  it('bloco de comparação recebe o valor do período, não um percentual', () => {
    const b = { id: 'c', type: 'comparison', metricId: 'm', label: 'X', current: 120 } as unknown as ComparisonBlock;
    applyComparisonToBlock(b as CanvasBlock, rows(120), rows(97));
    expect(b.previous).toBe(97);
  });

  it('gráfico recebe a série sobreposta', () => {
    const b = {
      id: 'g', type: 'chart', metricId: 'm', chartType: 'line',
      xAxisKey: 'mes', dataKeys: ['v'], data: [{ mes: '2026-06', v: 1 }],
    } as unknown as CanvasBlock;
    applyComparisonToBlock(b, rows(10), [{ mes: '2026-01', v: 5 }]);
    expect((b as { data: Array<Record<string, unknown>> }).data[0]!.__cmp_v).toBe(5);
  });

  /**
   * A guarda do "valor representativo" é de KPI e comparação, que reduzem o
   * período a UM número. Ela estava antes do gráfico e abortava a sobreposição
   * de toda série sem coluna `value`: em `{bucket, credit, debit}` o
   * representativo caía no `bucket`, uma data. O gráfico de Entradas & Saídas
   * ficava sem comparativo enquanto o de Inadimplência funcionava.
   */
  it('série multi SEM coluna `value` também é sobreposta', () => {
    const b = {
      id: 'g', type: 'chart', metricId: 'm', chartType: 'bar',
      xAxisKey: 'bucket', dataKeys: ['credit', 'debit'],
      data: [{ bucket: '2026-06', credit: 1, debit: 2 }],
    } as unknown as CanvasBlock;
    applyComparisonToBlock(b, [{ bucket: '2026-06', credit: 1, debit: 2 }], [
      { bucket: '2026-01', credit: 30, debit: 40 },
    ]);
    const row = (b as { data: Array<Record<string, unknown>> }).data[0]!;
    expect(row.__cmp_credit).toBe(30);
    expect(row.__cmp_debit).toBe(40);
  });

  /** Tabela precisaria de outra leitura; inventar "anterior" seria pior. */
  it('tabela não é tocada pelo comparativo', () => {
    const b = {
      id: 't', type: 'table', metricId: 'm',
      columns: [{ header: 'H', accessorKey: 'h' }], rows: [{ h: 1 }],
    } as unknown as CanvasBlock;
    const before = JSON.stringify(b);
    applyComparisonToBlock(b, rows(10), rows(5));
    expect(JSON.stringify(b)).toBe(before);
  });
});

/**
 * A família do "um número por período".
 *
 * KPI, gauge e progresso respondem à mesma pergunta e agora respondem do mesmo
 * jeito. Antes só o KPI mostrava a variação: nos cartões de covenant — que são
 * gauge e progresso — o modo comparativo parecia simplesmente não funcionar.
 */
describe('gauge e progresso — mesma leitura do KPI', () => {
  it.each(['gauge', 'progress'])('%s recebe o selo de variação', (type) => {
    const b = { id: 'b', type, metricId: 'm', label: 'X', value: 120, threshold: 1, target: 1 } as unknown as CanvasBlock;
    applyComparisonToBlock(b, rows(120), rows(100));
    const target = b as unknown as { deltaPercent?: string; deltaDirection?: string };
    expect(target.deltaPercent).toBe('20,0%');
    expect(target.deltaDirection).toBe('up');
  });

  it.each(['gauge', 'progress'])('%s sem métrica sensível ao período não recebe selo', (type) => {
    const b = { id: 'b', type, metricId: 'm', label: 'X', value: 120, threshold: 1, target: 1 } as unknown as CanvasBlock;
    applyComparisonToBlock(b, rows(120), rows(100), false);
    expect((b as unknown as { deltaPercent?: string }).deltaPercent).toBeUndefined();
  });
});

/**
 * A colisão que só apareceu quando os dois passaram a funcionar juntos.
 *
 * `applySparklineRowsToKpi` escreve `trend` + `trendDirection` (mês contra mês
 * anterior da própria série) e roda DEPOIS do comparativo no `useReportData`.
 * Enquanto nenhum KPI tinha sparkline e nenhum recebia selo, os dois nunca se
 * encontraram. Agora 38 cartões têm série e todos podem receber selo: se o
 * comparativo escrever em `trendDirection`, a sparkline o sobrescreve e o card
 * exibe a PORCENTAGEM de um período com a SETA do outro — "-20,0%" apontando
 * para cima. São duas leituras; precisam de dois campos.
 */
describe('applyComparisonToBlock × sparkline', () => {
  it('escreve a direção em campo próprio, sem disputar com a da série', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(80), rows(100));

    expect(b.deltaPercent).toBe('-20,0%');
    expect(b.deltaDirection).toBe('down');
  });

  it('não sobrescreve a direção que a sparkline já escreveu', () => {
    const b = kpi();
    // A série mensal subiu no último mês…
    b.trend = '5,0%';
    b.trendDirection = 'up';

    // …e o período comparativo caiu. As duas coisas são verdade ao mesmo tempo.
    applyComparisonToBlock(b as CanvasBlock, rows(80), rows(100));

    expect(b.trendDirection).toBe('up');
    expect(b.deltaDirection).toBe('down');
  });

  it('variação exatamente zero não inventa direção em nenhum dos dois campos', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(100), rows(100));

    expect(b.deltaDirection).toBeUndefined();
    expect(b.trendDirection).toBeUndefined();
  });

  /**
   * A ordem REAL do `useReportData`: o comparativo escreve no primeiro laço
   * (`metricBindings`) e a sparkline no segundo (`sparklineBindings`), no mesmo
   * bloco do mesmo `newBlockMap`. O teste acima prova que o comparativo não
   * pisa na sparkline; este prova o sentido que de fato acontece — a sparkline
   * é quem escreve por último e teria a última palavra sobre qualquer campo
   * compartilhado.
   */
  it('a sparkline, que escreve depois, não apaga o selo do comparativo', () => {
    const b = kpi();
    applyComparisonToBlock(b as CanvasBlock, rows(80), rows(100));
    // A série mensal do próprio KPI subiu no último mês — direção oposta à do
    // comparativo, que é justamente o caso em que compartilhar campo mentiria.
    applySparklineRowsToKpi(b, [{ bucket: '2026-05-01', value: 10 }, { bucket: '2026-06-01', value: 12 }]);

    expect(b.deltaPercent).toBe('-20,0%');
    expect(b.deltaDirection).toBe('down');
    // pt-BR desde o conserto do separador: o selo vizinho sempre foi pt-BR.
    expect(b.trend).toBe('20,0%');
    expect(b.trendDirection).toBe('up');
  });
});

/**
 * As duas leituras dividem o MESMO cartão, e precisam falar a mesma língua.
 *
 * Achados na revisão do grupo 3, que revisava o cartão e não podia tocar aqui.
 * Nenhum dos dois era alcançável enquanto 0 de 46 KPIs tinham série; com 38
 * tendo, os dois passam a aparecer na tela do usuário.
 */
describe('applySparklineRowsToKpi — o que a série escreve no cartão', () => {
  const emptyKpi = () => ({ id: 'k', type: 'kpi', metricId: 'm', label: 'X' } as unknown as SingleKpiBlock);

  /*
   * `toFixed` é en-US. O selo do comparativo, escrito no MESMO bloco, usa
   * `formatNumber` (pt-BR). O cartão exibia "-15.8%" ao lado de "+12,3%" —
   * dois separadores decimais em dois selos vizinhos, no mesmo indicador.
   */
  it('escreve a tendência em pt-BR, como o selo vizinho', () => {
    const b = emptyKpi();
    applySparklineRowsToKpi(b, [{ value: 100 }, { value: 84.2 }]);

    expect(b.trend).toBe('-15,8%');
    expect(b.trendDirection).toBe('down');
  });

  /*
   * `Number(v) || 0` transformava mês sem medição em ZERO, e a curva desenhava
   * um despenhadeiro até o zero que não aconteceu. O princípio contrário já
   * está escrito neste arquivo, na matriz de safra: "célula sem valor é
   * OMITIDA, não zerada — 'ainda não aconteceu' tem de ser visualmente
   * diferente de 'deu zero'". A série do KPI violava a própria regra da casa.
   *
   * Omitir o ponto liga os vizinhos por uma reta, que afirma menos: uma
   * continuidade que não se mediu, em vez de uma queda que não houve.
   */
  it('omite o mês sem medição em vez de desenhá-lo como zero', () => {
    const b = emptyKpi();
    applySparklineRowsToKpi(b, [
      { bucket: '2026-05-01', value: 12 },
      { bucket: '2026-06-01', value: null },
      { bucket: '2026-07-01', value: 7 },
    ]);

    expect(b.sparklineData).toEqual([12, 7]);
    // O rótulo do mês omitido sai junto, senão valor e mês desalinham.
    expect(b.sparklineMonths).toEqual(['2026-05-01', '2026-07-01']);
  });

  it('a tendência ignora o mês omitido — compara medições, não buracos', () => {
    const b = emptyKpi();
    applySparklineRowsToKpi(b, [{ value: 100 }, { value: 50 }, { value: null }]);

    expect(b.trend).toBe('-50,0%');
  });

  /* Série inteira sem número não vira curva de zeros: vira ausência de curva. */
  it('sem nenhuma medição numérica, não escreve série', () => {
    const b = emptyKpi();
    applySparklineRowsToKpi(b, [{ value: null }, { value: undefined }]);

    expect(b.sparklineData).toBeUndefined();
    expect(b.trend).toBeUndefined();
  });
});
