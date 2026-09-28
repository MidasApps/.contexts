import { describe, it, expect } from 'vitest';
import { pageFilterableFields, metricsHonoringKey } from './page-filter';

/**
 * ADR-0026 — o vocabulário do filtro é o campo do INDICADOR.
 *
 * `chat.extrato` mostra `banco` (nome, vindo de JOIN) e `categoria`; declara os
 * dois como filtráveis. `covenants.saldo` não filtra nada. `covenants.serie`
 * cita `{filter.banco}` mas não declara o campo — cita e não compara.
 */
const contextOf = {
  clientId: 'vila-rosa',
  metrics: [
    {
      id: 'chat.extrato',
      name: 'Extrato',
      requires: [],
      recipe: {
        kind: 'sql',
        template: 'SELECT b.nome_reduzido AS banco FROM {transacoes} t WHERE {filter.banco} AND {filter.categoria}',
      },
      filterFields: {
        banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
        categoria: { expr: 'cat.traduzida', field: 'categoria' },
      },
    },
    {
      id: 'covenants.saldo',
      name: 'Saldo',
      requires: [],
      recipe: { kind: 'sql', template: 'SELECT 1 FROM {contratos}' },
    },
    {
      id: 'covenants.serie',
      name: 'Série',
      requires: [],
      recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} WHERE {filter.banco}' },
    },
    {
      id: 'covenants.agregada',
      name: 'Agregada',
      requires: [],
      recipe: { kind: 'aggregation', primaryEntity: 'contratos' },
    },
  ],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const blockMap = { b1: { metricId: 'chat.extrato' }, b2: { metricId: 'covenants.saldo' } };

describe('pageFilterableFields', () => {
  it('lista os campos que os indicadores da página declaram', () => {
    const fields = pageFilterableFields(contextOf, blockMap, []);

    expect(fields).toEqual([
      { campo: 'banco', chave: 'banco', metricId: 'chat.extrato', label: 'Banco', jaDeclarado: false },
      { campo: 'categoria', chave: 'categoria', metricId: 'chat.extrato', label: undefined, jaDeclarado: false },
    ]);
  });

  it('marca o que a página já declarou, em vez de escondê-lo', () => {
    const fields = pageFilterableFields(contextOf, blockMap, ['banco']);

    expect(fields.find((c) => c.campo === 'banco')?.jaDeclarado).toBe(true);
    expect(fields.find((c) => c.campo === 'categoria')?.jaDeclarado).toBe(false);
  });

  /*
   * Declaração sem `field` serve para a métrica OBEDECER ao filtro, não para
   * alimentá-lo: não há coluna no resultado de onde tirar as opções.
   */
  it('ignora declaração sem campo de exibição', () => {
    const soExpr = {
      ...contextOf,
      metrics: [{
        id: 'chat.extrato',
        recipe: { kind: 'sql', template: 'WHERE {filter.banco}' },
        filterFields: { banco: { expr: 't.banco_codigo' } },
      }],
    };

    expect(pageFilterableFields(soExpr, blockMap, [])).toEqual([]);
  });

  it('página sem blocos não oferece campo nenhum', () => {
    expect(pageFilterableFields(contextOf, undefined, [])).toEqual([]);
  });
});

describe('metricsHonoringKey', () => {
  it('separa quem reage, quem ignora e quem cita sem saber comparar', () => {
    const r = metricsHonoringKey(
      contextOf,
      { ...blockMap, b3: { metricId: 'covenants.serie' } },
      'banco',
    );

    expect(r.honoring).toEqual(['chat.extrato']);
    expect(r.ignoring).toEqual(['covenants.saldo']);
    expect(r.withoutComparison).toEqual(['covenants.serie']);
  });

  /*
   * `aggregation`/`derived` não têm template para inspecionar — o resolver
   * aplica os filtros por construção. Chutar "ignora" seria mentir.
   */
  it('não opina sobre métrica sem template', () => {
    const r = metricsHonoringKey(contextOf, { b: { metricId: 'covenants.agregada' } }, 'banco');

    expect(r.honoring).toEqual([]);
    expect(r.ignoring).toEqual([]);
    expect(r.withoutComparison).toEqual([]);
  });

  /*
   * Pin no template (`{filter.banco:transacoes.banco_codigo}`) compara sozinho,
   * sem precisar de declaração — é como os filtros de tempo funcionam.
   */
  it('pin no template conta como saber comparar', () => {
    const withPin = {
      ...contextOf,
      metrics: [{
        id: 'chat.pin',
        recipe: { kind: 'sql', template: 'WHERE {filter.banco:transacoes.banco_codigo}' },
      }],
    };

    const r = metricsHonoringKey(withPin, { b: { metricId: 'chat.pin' } }, 'banco');
    expect(r.honoring).toEqual(['chat.pin']);
    expect(r.withoutComparison).toEqual([]);
  });

  it('página sem blocos não tem quem reaja', () => {
    expect(metricsHonoringKey(contextOf, undefined, 'banco'))
      .toEqual({ honoring: [], ignoring: [], withoutComparison: [] });
  });
});
