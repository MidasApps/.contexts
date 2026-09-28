import { describe, it, expect } from 'vitest';
import { Metric, MetricDoc, MetricId, AttributeRef } from '../metric';

const baseTimestamp = new Date('2026-05-11T00:00:00Z');

const validMetric = {
  id: 'pdd.total',
  label: 'PDD Total',
  description: 'Provisão para devedores duvidosos consolidada',
  type: 'kpi' as const,
  category: 'risco',
  unit: 'BRL',
  requires: [
    'canonical.contratos.saldo_devedor',
    'canonical.contratos.dias_atraso',
  ],
  version: '1.0.0',
  status: 'active' as const,
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
};

describe('MetricId', () => {
  it('aceita formato domain.slug', () => {
    expect(() => MetricId.parse('pdd.total')).not.toThrow();
    expect(() => MetricId.parse('carteira.ltv_medio')).not.toThrow();
  });

  it('rejeita id sem ponto', () => {
    expect(() => MetricId.parse('pdd_total')).toThrow();
  });

  it('rejeita id com múltiplos pontos', () => {
    expect(() => MetricId.parse('pdd.por.safra')).toThrow();
  });

  it('rejeita id começando com número', () => {
    expect(() => MetricId.parse('90dias.inad')).toThrow();
  });
});

describe('AttributeRef', () => {
  it('aceita ref fully-qualified', () => {
    expect(() =>
      AttributeRef.parse('canonical.contratos.saldo_devedor'),
    ).not.toThrow();
  });

  it('aceita contractId com hífen (Slug-like)', () => {
    expect(() =>
      AttributeRef.parse('credit-v2.contratos.saldo_devedor'),
    ).not.toThrow();
  });

  it('rejeita ref com 2 segmentos', () => {
    expect(() => AttributeRef.parse('contratos.saldo_devedor')).toThrow();
  });

  it('rejeita ref com 4 segmentos', () => {
    expect(() =>
      AttributeRef.parse('canonical.credit.contratos.saldo'),
    ).toThrow();
  });
});

describe('Metric', () => {
  it('aceita métrica válida', () => {
    expect(() => Metric.parse(validMetric)).not.toThrow();
  });

  it('exige pelo menos 1 attribute em requires', () => {
    expect(() =>
      Metric.parse({ ...validMetric, requires: [] }),
    ).toThrow();
  });

  it('valida cada ref em requires', () => {
    expect(() =>
      Metric.parse({
        ...validMetric,
        requires: ['saldo_devedor'],
      }),
    ).toThrow();
  });

  it('rejeita type fora do enum', () => {
    expect(() =>
      Metric.parse({ ...validMetric, type: 'gauge' }),
    ).toThrow();
  });

  it('default de version é 1.0.0', () => {
    const { version, ...withoutVersion } = validMetric;
    void version;
    const parsed = MetricDoc.parse(withoutVersion);
    expect(parsed.version).toBe('1.0.0');
  });

  it('default de status é active', () => {
    const { status, ...withoutStatus } = validMetric;
    void status;
    const parsed = MetricDoc.parse(withoutStatus);
    expect(parsed.status).toBe('active');
  });

  it('aceita description e category null', () => {
    expect(() =>
      Metric.parse({
        ...validMetric,
        description: null,
        category: null,
        unit: null,
      }),
    ).not.toThrow();
  });

  it('aceita métrica deprecated', () => {
    const parsed = Metric.parse({ ...validMetric, status: 'deprecated' });
    expect(parsed.status).toBe('deprecated');
  });

  it('id deve seguir MetricId regex', () => {
    expect(() =>
      Metric.parse({ ...validMetric, id: 'PDD.total' }),
    ).toThrow();
  });
});

describe('DerivedRecipe', () => {
  const baseMetric = {
    id: 'imoveis.preco_m2',
    label: 'Preço/m²',
    requires: ['produtos.unidades.valor', 'produtos.unidades.area'],
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
  };

  it('aceita recipe derived bem formado', () => {
    const m = Metric.parse({
      ...baseMetric,
      recipe: {
        kind: 'derived',
        primaryEntity: 'produtos.unidades',
        joins: [],
        terms: [
          { id: 'valor', aggregation: 'sum', valueRef: 'produtos.unidades.valor' },
          { id: 'area', aggregation: 'sum', valueRef: 'produtos.unidades.area' },
        ],
        expression: 'valor / area',
      },
    });
    expect(m.recipe?.kind).toBe('derived');
  });

  it('rejeita primaryEntity que não é "contractId.entity"', () => {
    expect(() =>
      Metric.parse({
        ...baseMetric,
        recipe: {
          kind: 'derived',
          primaryEntity: 'unidades',
          joins: [],
          terms: [{ id: 'n', aggregation: 'count' }],
          expression: 'n',
        },
      }),
    ).toThrow();
  });
});

describe('ownerClientId', () => {
  const base = {
    id: 'pdd.total',
    label: 'PDD',
    requires: ['canonical.contratos.saldo_devedor'],
    createdAt: 0,
    updatedAt: 0,
  };
  it('default é null (métrica global)', () => {
    // `base` não tem ownerClientId → o default null deve ser aplicado.
    expect(MetricDoc.parse({ ...base }).ownerClientId).toBeNull();
  });
  it('aceita um Slug de cliente', () => {
    expect(Metric.parse({ ...base, ownerClientId: 'brz' }).ownerClientId).toBe('brz');
  });
  it('rejeita ownerClientId não-Slug', () => {
    expect(() => Metric.parse({ ...base, ownerClientId: 'BRZ Cliente' })).toThrow();
  });
});
