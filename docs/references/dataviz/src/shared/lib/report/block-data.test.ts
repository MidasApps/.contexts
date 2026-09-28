import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import {
  DATA_FIELDS,
  dataFields,
  withoutMaterializedData,
  configurationMap,
  materializedData,
  isDataApplied,
  configurationSignature,
  isSameConfiguration,
} from './block-data';
import {
  applyComparisonToBlock,
  applyMetricRowsToBlock,
  applySparklineRowsToKpi,
} from '@/shared/hooks/useReportData';

/** Bloco solto no shape do Firestore, sem o rigor do tipo em cada fixture. */
function makeBlock(props: Record<string, unknown>): CanvasBlock {
  return props as unknown as CanvasBlock;
}

/** O bloco como saco de campos — para afirmar sobre presença/ausência. */
function fieldsOf(block: CanvasBlock): Record<string, unknown> {
  return block as unknown as Record<string, unknown>;
}

/** Campo → valor serializado, para comparar o bloco antes e depois de escrever. */
function snapshot(block: CanvasBlock): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fieldsOf(block)).map(([k, v]) => [k, JSON.stringify(v)]),
  );
}

/**
 * O documento do relatório descreve CONFIGURAÇÃO; o número vem da métrica a
 * cada carga (ADR-0015). Estas funções são a fronteira entre as duas coisas —
 * usadas para decidir o que se grava no Firestore e o que se devolve ao bloco
 * que está na tela.
 */
describe('configuração × dado materializado', () => {
  const kpi = makeBlock({
    id: 'k1', type: 'kpi', metricId: 'carteira.saldo', label: 'Saldo',
    colSpan: 2, format: 'currency', value: 'R$ 12,3 mi',
  });
  const chart = makeBlock({
    id: 'c1', type: 'chart', metricId: 'carteira.evolucao', chartType: 'line',
    xAxisKey: 'mes', dataKeys: ['saldo'], data: [{ mes: '2026-01', saldo: 10 }],
  });
  const table = makeBlock({
    id: 't1', type: 'table', metricId: 'carteira.inadimplentes', title: 'Atrasos',
    columns: [{ header: 'Contrato', accessorKey: 'id_contrato' }],
    rows: [{ id_contrato: 'A-1' }], totalRows: 3412,
  });
  const donut = makeBlock({
    id: 'd1', type: 'donut', metricId: 'recebiveis.pre_pos', title: 'Recebíveis',
    slices: [{ name: 'Pré', value: 1 }],
  });
  const gauge = makeBlock({
    id: 'g1', type: 'gauge', metricId: 'covenant.cobertura', label: 'Cobertura',
    threshold: 1.2, suffix: 'x', value: 1.34,
  });

  describe('dataFields', () => {
    it('bloco SEM metricId não tem campo de dado — o valor ali foi autorado', () => {
      const literal = makeBlock({ id: 'k0', type: 'kpi', label: 'Meta', value: '100' });
      expect(dataFields(literal)).toEqual([]);
    });

    /*
     * `deltaPercent`/`deltaDirection` acompanham o `metricId`, não a
     * sparkline: quem os escreve no modo comparativo é
     * `applyComparisonToBlock`, e um KPI sem série histórica também os
     * recebe. Fora desta lista eles iriam parar no Firestore, congelando no
     * documento a comparação de um período que ninguém mais está vendo.
     */
    it('KPI com métrica inclui o selo de variação', () => {
      expect(dataFields(kpi)).toEqual(['value', 'deltaPercent', 'deltaDirection', 'trendDirection']);
    });

    it('KPI com sparklineMetricId inclui também os campos da série', () => {
      const withSparkline = makeBlock({ ...kpi, sparklineMetricId: 'carteira.saldo_mensal' });
      expect(dataFields(withSparkline)).toEqual([
        'value', 'deltaPercent', 'deltaDirection', 'trendDirection',
        'sparklineData', 'sparklineMonths', 'trend', 'trendDirection',
      ]);
    });

    it('bloco de texto não tem dado a limpar', () => {
      expect(dataFields(makeBlock({ id: 'x', type: 'text', content: 'Nota' }))).toEqual([]);
    });
  });

  describe('withoutMaterializedData — o que vai para o Firestore', () => {
    it('KPI perde o valor formatado e mantém a amarração e o layout', () => {
      const cleaned = fieldsOf(withoutMaterializedData(kpi));
      expect(cleaned).not.toHaveProperty('value');
      expect(cleaned).toMatchObject({
        id: 'k1', type: 'kpi', metricId: 'carteira.saldo', label: 'Saldo',
        colSpan: 2, format: 'currency',
      });
    });

    it('gráfico perde data[] e mantém xAxisKey/dataKeys', () => {
      const cleaned = fieldsOf(withoutMaterializedData(chart));
      expect(cleaned).not.toHaveProperty('data');
      expect(cleaned).toMatchObject({ xAxisKey: 'mes', dataKeys: ['saldo'] });
    });

    it('tabela perde rows[] e a contagem daquela execução, mantendo as colunas', () => {
      const cleaned = fieldsOf(withoutMaterializedData(table));
      expect(cleaned).not.toHaveProperty('rows');
      expect(cleaned).not.toHaveProperty('totalRows');
      expect(cleaned).toMatchObject({ columns: [{ header: 'Contrato', accessorKey: 'id_contrato' }] });
    });

    it('donut perde slices[] e gauge perde o valor', () => {
      expect(withoutMaterializedData(donut)).not.toHaveProperty('slices');
      const cleaned = fieldsOf(withoutMaterializedData(gauge));
      expect(cleaned).not.toHaveProperty('value');
      expect(cleaned).toMatchObject({ threshold: 1.2, suffix: 'x' });
    });

    it('sparkline só é limpa quando tem métrica própria', () => {
      const authored = makeBlock({ ...kpi, sparklineData: [1, 2], trend: '+3%' });
      expect(withoutMaterializedData(authored)).toMatchObject({ sparklineData: [1, 2], trend: '+3%' });

      const doPipeline = makeBlock({ ...authored, sparklineMetricId: 's.m' });
      const cleaned = fieldsOf(withoutMaterializedData(doPipeline));
      expect(cleaned).not.toHaveProperty('sparklineData');
      expect(cleaned).not.toHaveProperty('trend');
      expect(cleaned).toMatchObject({ sparklineMetricId: 's.m' });
    });

    it('bloco sem métrica atravessa intacto — apagar ali seria destruir configuração', () => {
      const literal = makeBlock({ id: 'k0', type: 'kpi', label: 'Meta', value: '100' });
      expect(withoutMaterializedData(literal)).toBe(literal);
    });

    it('não muta o bloco de origem', () => {
      withoutMaterializedData(kpi);
      expect(kpi).toHaveProperty('value', 'R$ 12,3 mi');
    });
  });

  describe('configurationMap', () => {
    it('limpa cada bloco e preserva as chaves do mapa (em ordem canônica)', () => {
      const config = configurationMap({ k1: kpi, c1: chart, t1: table });
      expect(Object.keys(config)).toEqual(['c1', 'k1', 't1']);
      expect(JSON.stringify(config)).not.toContain('R$ 12,3 mi');
      expect(JSON.stringify(config)).not.toContain('A-1');
    });

  });

  describe('configurationSignature', () => {
    /**
     * É a propriedade que segura o ciclo canvas → hook → canvas: o dado que
     * volta para o bloco não pode mexer na assinatura que dispara a busca.
     */
    it('é indiferente ao dado que chegou depois', () => {
      expect(configurationSignature({ k1: kpi })).toBe(
        configurationSignature({ k1: withoutMaterializedData(kpi) }),
      );
    });

    /**
     * O documento e o canvas descrevem o mesmo relatório em ordens diferentes
     * (o canvas reconstrói o `blockMap` na ordem do `layout`). Sem ordem
     * canônica, abrir a edição contaria como alteração de conteúdo.
     */
    it('é indiferente à ordem de inserção das chaves', () => {
      expect(configurationSignature({ c1: chart, k1: kpi })).toBe(
        configurationSignature({ k1: kpi, c1: chart }),
      );
    });

    it('MUDA quando um bloco novo entra', () => {
      expect(configurationSignature({ k1: kpi, c1: chart })).not.toBe(
        configurationSignature({ k1: kpi }),
      );
    });

    it('MUDA quando a configuração do bloco muda', () => {
      const renamed = makeBlock({ ...kpi, label: 'Saldo em aberto' });
      expect(configurationSignature({ k1: renamed })).not.toBe(
        configurationSignature({ k1: kpi }),
      );
    });

    it('isSameConfiguration trata mapa ausente sem confundir com mapa vazio', () => {
      expect(isSameConfiguration(undefined, undefined)).toBe(true);
      expect(isSameConfiguration({}, undefined)).toBe(false);
      expect(isSameConfiguration({ k1: kpi }, { k1: withoutMaterializedData(kpi) })).toBe(true);
    });
  });

  describe('materializedData — o complemento, devolvido ao bloco na tela', () => {
    it('extrai só os campos vindos da métrica', () => {
      expect(materializedData(kpi)).toEqual({ value: 'R$ 12,3 mi' });
      expect(materializedData(table)).toEqual({ rows: [{ id_contrato: 'A-1' }], totalRows: 3412 });
    });

    it('bloco cuja métrica não voltou não gera escrita', () => {
      expect(materializedData(withoutMaterializedData(kpi))).toEqual({});
    });
  });

  describe('isDataApplied', () => {
    it('true quando o bloco já está com o mesmo dado (não escreve de novo)', () => {
      expect(isDataApplied(kpi, { value: 'R$ 12,3 mi' })).toBe(true);
      expect(isDataApplied(chart, materializedData(chart))).toBe(true);
    });

    it('false quando o valor mudou ou ainda não existe', () => {
      expect(isDataApplied(kpi, { value: 'R$ 13,0 mi' })).toBe(false);
      expect(isDataApplied(withoutMaterializedData(kpi), { value: 'R$ 12,3 mi' })).toBe(false);
    });
  });

  /**
   * O espelho: `applyMetricRowsToBlock` (em `useReportData`) é quem ESCREVE o
   * dado no bloco, e `dataFields` é quem sabe removê-lo. Os dois vivem em
   * arquivos diferentes, então a garantia não pode ser um comentário: campo
   * novo escrito lá sem par aqui vira número congelado dentro do documento de
   * configuração, meses depois, sem ninguém perceber.
   *
   * A direção é "tudo que se escreve tem de ser removível". O contrário não
   * vale: `totalRows` está na lista de propósito, sem produtor atual.
   */
  describe('espelho de applyMetricRowsToBlock', () => {
    const cases: Array<{ name: string; block: CanvasBlock; rows: Array<Record<string, unknown>> }> = [
      {
        name: 'kpi',
        block: makeBlock({ id: 'k', type: 'kpi', metricId: 'm', label: 'L', format: 'number' }),
        rows: [{ value: 42 }],
      },
      {
        name: 'gauge',
        block: makeBlock({ id: 'g', type: 'gauge', metricId: 'm', label: 'L', threshold: 1.2 }),
        rows: [{ value: 1.4 }],
      },
      {
        name: 'chart',
        block: makeBlock({
          id: 'c', type: 'chart', metricId: 'm', chartType: 'line',
          xAxisKey: 'bucket', dataKeys: ['value'],
        }),
        rows: [{ bucket: '2026-01', value: 10 }],
      },
      {
        name: 'table',
        block: makeBlock({
          id: 't', type: 'table', metricId: 'm',
          columns: [{ header: 'Contrato', accessorKey: 'id_contrato' }],
        }),
        rows: [{ id_contrato: 'A-1' }],
      },
      {
        name: 'donut',
        block: makeBlock({ id: 'd', type: 'donut', metricId: 'm' }),
        rows: [{ categoria: 'Pré', value: 5 }],
      },
      {
        name: 'progress',
        block: makeBlock({ id: 'p', type: 'progress', metricId: 'm', label: 'L', target: 100 }),
        rows: [{ value: 78 }],
      },
      {
        name: 'targets',
        block: makeBlock({ id: 'tg', type: 'targets', metricId: 'm' }),
        rows: [{ label: 'Cobertura', value: 1.38, target: 1.2 }],
      },
      {
        name: 'comparison',
        block: makeBlock({ id: 'cp', type: 'comparison', metricId: 'm', label: 'L' }),
        rows: [{ bucket: '2026-01', value: 5.24 }, { bucket: '2026-02', value: 4.81 }],
      },
      {
        name: 'sparkrows',
        block: makeBlock({ id: 'sr', type: 'sparkrows', metricId: 'm' }),
        rows: [{ bucket: '2026-01', saldo: 10 }, { bucket: '2026-02', saldo: 12 }],
      },
      {
        name: 'scatter',
        block: makeBlock({ id: 'sc', type: 'scatter', metricId: 'm' }),
        rows: [{ x: 0.72, y: 34 }, { x: 0.81, y: 96 }],
      },
      {
        name: 'heatmap',
        block: makeBlock({ id: 'hm', type: 'heatmap', metricId: 'm' }),
        rows: [{ row: '2024', col: '6m', value: 0.031 }],
      },
      {
        name: 'funnel',
        block: makeBlock({ id: 'fn', type: 'funnel', metricId: 'm' }),
        rows: [{ etapa: 'Elegíveis', value: 820 }, { etapa: 'Repassados', value: 314 }],
      },
      {
        name: 'sankey',
        block: makeBlock({ id: 'sk', type: 'sankey', metricId: 'm' }),
        rows: [{ origem: 'Adimplente', destino: 'Atraso 1-30', value: 47 }],
      },
      {
        name: 'boxplot',
        block: makeBlock({ id: 'bp', type: 'boxplot', metricId: 'm' }),
        rows: [{ grupo: '2024', min: 0.1, q1: 0.3, mediana: 0.5, q3: 0.7, max: 0.9 }],
      },
      {
        name: 'treemap',
        block: makeBlock({ id: 'tm', type: 'treemap', metricId: 'm' }),
        rows: [{ torre: 'A', value: 1200 }],
      },
    ];

    /**
     * A lista de casos acima é escrita à mão, e por isso envelhece. Esta guarda
     * existe para pegar isso — mas ela também era uma lista à mão, e envelheceu
     * do mesmo jeito: `funnel`, `sankey`, `boxplot` e `treemap` entraram em
     * `applyMetricRowsToBlock` e em `DATA_FIELDS` e nunca chegaram aqui, de
     * modo que a guarda passava verde sobre quatro tipos que não conhecia.
     *
     * Agora ela lê o próprio `DATA_FIELDS`. Uma guarda contra drift não pode
     * ser a segunda cópia manual da coisa que ela vigia.
     */
    it('todo tipo que o pipeline preenche tem caso neste espelho', () => {
      const withCase = new Set(cases.map((c) => c.name));
      for (const blockType of Object.keys(DATA_FIELDS)) {
        expect(withCase, `tipo "${blockType}" preenchido pelo pipeline e sem caso de espelho`)
          .toContain(blockType);
      }
    });

    for (const { name, block, rows } of cases) {
      it(`todo campo que o pipeline escreve em ${name} é removível`, () => {
        const before = new Set(Object.keys(fieldsOf(block)));
        applyMetricRowsToBlock(block, rows);
        const written = Object.keys(fieldsOf(block)).filter((field) => !before.has(field));

        expect(written.length).toBeGreaterThan(0);
        expect(dataFields(block)).toEqual(expect.arrayContaining(written));
        expect(fieldsOf(withoutMaterializedData(block))).toEqual(
          expect.not.objectContaining(Object.fromEntries(written.map((c) => [c, expect.anything()]))),
        );
      });
    }

    /**
     * O terceiro escritor, que não tinha espelho nenhum.
     *
     * `applyComparisonToBlock` escreve no bloco tanto quanto os outros dois —
     * `deltaPercent`/`deltaDirection` no KPI, medidor e progresso, `previous`
     * na comparação, `data` remesclada no gráfico. `deltaDirection` foi somado
     * à mão a `DATA_FIELDS` quando a ADR-0027 separou a direção do
     * comparativo da direção da sparkline; nada garantia que o próximo campo
     * também fosse. Sem esta guarda, ele iria para o Firestore e congelaria no
     * documento a comparação de um período que ninguém mais está vendo.
     */
    const comparisonCases: Array<{ name: string; block: CanvasBlock; rows: Array<Record<string, unknown>> }> = [
      {
        name: 'kpi',
        block: makeBlock({ id: 'k', type: 'kpi', metricId: 'm', label: 'L', format: 'number' }),
        rows: [{ value: 100 }],
      },
      {
        name: 'gauge',
        block: makeBlock({ id: 'g', type: 'gauge', metricId: 'm', label: 'L', threshold: 1.2 }),
        rows: [{ value: 1.1 }],
      },
      {
        name: 'progress',
        block: makeBlock({ id: 'p', type: 'progress', metricId: 'm', label: 'L', target: 100 }),
        rows: [{ value: 70 }],
      },
      {
        name: 'comparison',
        block: makeBlock({ id: 'cp', type: 'comparison', metricId: 'm', label: 'L' }),
        rows: [{ bucket: '2026-01', value: 5 }, { bucket: '2026-02', value: 6 }],
      },
      {
        name: 'chart',
        block: makeBlock({
          id: 'c', type: 'chart', metricId: 'm', chartType: 'line',
          xAxisKey: 'bucket', dataKeys: ['value'],
        }),
        rows: [{ bucket: '2026-01', value: 10 }, { bucket: '2026-02', value: 12 }],
      },
    ];

    for (const { name, block, rows } of comparisonCases) {
      it(`todo campo que o comparativo escreve em ${name} é removível`, () => {
        // O comparativo roda DEPOIS da métrica — no gráfico ele remescla o
        // `data` que ela produziu, então a ordem aqui é a do `useReportData`.
        applyMetricRowsToBlock(block, rows);
        // Campo NOVO não basta como critério: em `comparison` e `chart` o
        // comparativo reescreve `previous`/`data`, que a métrica já tinha
        // criado. O que interessa é o campo que mudou de valor.
        const before = snapshot(block);
        applyComparisonToBlock(block, rows, [{ bucket: '2025-12', value: 8 }]);
        const after = snapshot(block);
        const written = Object.keys(after).filter((field) => after[field] !== before[field]);

        expect(written.length).toBeGreaterThan(0);
        expect(dataFields(block)).toEqual(expect.arrayContaining(written));
      });
    }

    it('todo campo que a sparkline escreve é removível', () => {
      const block = makeBlock({
        id: 'k', type: 'kpi', metricId: 'm', sparklineMetricId: 's', label: 'L',
      });
      const before = new Set(Object.keys(fieldsOf(block)));
      applySparklineRowsToKpi(
        block as unknown as Parameters<typeof applySparklineRowsToKpi>[0],
        [{ bucket: '2026-01', value: 10 }, { bucket: '2026-02', value: 12 }],
      );
      const written = Object.keys(fieldsOf(block)).filter((field) => !before.has(field));

      expect(written).toEqual(
        expect.arrayContaining(['sparklineData', 'sparklineMonths', 'trend', 'trendDirection']),
      );
      expect(dataFields(block)).toEqual(expect.arrayContaining(written));
    });
  });
});
