import { describe, it, expect } from 'vitest';
import { resolveDerivedMetric } from './resolve-metric';
import type { Metric } from '@/shared/schemas/metric';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';
import type { Relation } from '@/shared/schemas/relation';

function binding(datasetId: string, map: Record<string, string>): ClientDatasetBinding {
  return {
    id: 'main',
    dataSourceId: 'ds',
    datasetId,
    contractRef: 'x',
    schemaBindings: map,
    schema: {},
    isPrimary: true,
  } as unknown as ClientDatasetBinding;
}

const pricePerM2: Metric = {
  id: 'imoveis.preco_m2',
  label: 'Preço/m²',
  requires: ['produtos.unidades.valor', 'produtos.unidades.area'],
  recipe: {
    kind: 'derived',
    primaryEntity: 'produtos.unidades',
    joins: [],
    terms: [
      { id: 'valor', aggregation: 'sum', valueRef: 'produtos.unidades.valor' },
      { id: 'area', aggregation: 'sum', valueRef: 'produtos.unidades.area' },
    ],
    expression: 'valor / area',
    groupByRefs: [],
    filters: [],
  },
  version: '1.0.0',
  status: 'active',
  type: 'kpi',
  createdAt: 0,
  updatedAt: 0,
} as unknown as Metric;

describe('resolveDerivedMetric', () => {
  it('cross-entity num contrato: SELECT com a expression sobre aggs', () => {
    const r = resolveDerivedMetric({
      metric: pricePerM2,
      bindingsByContract: {
        produtos: binding('prod_ds', { 'unidades.valor': 'vl_total', 'unidades.area': 'area_m2' }),
      },
      relations: [],
      projectIdByContract: { produtos: 'meu-projeto' },
    });
    expect(r.sql).toContain('SUM(`vl_total`) / SUM(`area_m2`) AS value');
    expect(r.sql).toContain('FROM `meu-projeto.prod_ds.unidades`');
  });

  it('cross-contract: JOIN entre datasets via relação', () => {
    const ticket: Metric = {
      ...pricePerM2,
      id: 'credito.ticket_segmento',
      requires: ['contratos.contratos.valor', 'clientes.proponentes.segmento'],
      recipe: {
        kind: 'derived',
        primaryEntity: 'contratos.contratos',
        joins: [{ relationId: 'contrato-cliente' }],
        groupByRefs: ['clientes.proponentes.segmento'],
        terms: [
          { id: 'tot', aggregation: 'sum', valueRef: 'contratos.contratos.valor' },
          { id: 'n', aggregation: 'count' },
        ],
        expression: 'tot / n',
        filters: [],
      },
    } as unknown as Metric;
    const rel: Relation = {
      id: 'contrato-cliente',
      label: '',
      leftRef: 'contratos.contratos.cliente_id',
      rightRef: 'clientes.proponentes.id',
      cardinality: 'many-to-one',
      createdAt: 0,
      updatedAt: 0,
    } as unknown as Relation;
    const r = resolveDerivedMetric({
      metric: ticket,
      bindingsByContract: {
        contratos: binding('cred_ds', { 'contratos.valor': 'valor', 'contratos.cliente_id': 'cli_id' }),
        clientes: binding('cli_ds', { 'proponentes.id': 'id', 'proponentes.segmento': 'seg' }),
      },
      relations: [rel],
      projectIdByContract: { contratos: 'meu-projeto', clientes: 'meu-projeto' },
    });
    expect(r.sql).toContain('JOIN `meu-projeto.cli_ds.proponentes`');
    expect(r.sql).toContain('`cli_id` = `id`');
    expect(r.sql).toContain('GROUP BY');
  });

  it('fail-loud: contrato sem binding', () => {
    expect(() =>
      resolveDerivedMetric({ metric: pricePerM2, bindingsByContract: {}, relations: [] }),
    ).toThrow(/contrato "produtos"/i);
  });

  it('fail-loud: relação inexistente', () => {
    const m = {
      ...pricePerM2,
      recipe: { ...pricePerM2.recipe, joins: [{ relationId: 'nope' }] },
    } as unknown as Metric;
    expect(() =>
      resolveDerivedMetric({
        metric: m,
        bindingsByContract: { produtos: binding('p_d', { 'unidades.valor': 'v', 'unidades.area': 'a' }) },
        relations: [],
      }),
    ).toThrow(/relação "nope"/i);
  });
});
