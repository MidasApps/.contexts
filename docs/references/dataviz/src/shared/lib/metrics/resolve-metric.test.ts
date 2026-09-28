/**
 * Tests for resolveMetric — focus on the bug fixes:
 *
 *  A3 — page filter `in` (projetos) produces `IN UNNEST(@...)`; empty values → no-op.
 *  A6 — resolveColumn strictness: migrated client (non-empty schemaBindings) with a
 *       missing key throws; legacy client (empty schemaBindings) warns + falls back
 *       to attributeId.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveMetric,
  resolveDerivedMetric,
  MetricResolutionError,
  type PageFilterValue,
} from './resolve-metric';
import type { Metric } from '@/shared/schemas/metric';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';

function makeBinding(
  overrides: Partial<ClientDatasetBinding> = {},
): ClientDatasetBinding {
  return {
    id: 'ds-test',
    dataSourceId: 'bq-main',
    datasetId: 'cliente_dataset',
    contractRef: 'canonical',
    schemaBindings: {},
    schema: {},
    isPrimary: true,
    ...overrides,
  };
}

function aggMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'carteira.saldo',
    label: 'Saldo',
    requires: ['canonical.contratos.saldo_devedor'],
    type: 'kpi',
    version: '1.0.0',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    recipe: {
      kind: 'aggregation',
      primaryEntity: 'contratos',
      aggregation: 'sum',
      valueAttribute: 'contratos.saldo_devedor',
      groupByAttributes: [],
      filters: [],
    },
    ...overrides,
  } as Metric;
}

describe('resolveMetric — A3 page filter `in` (projetos)', () => {
  const baseMetric = aggMetric({
    recipe: {
      kind: 'aggregation',
      primaryEntity: 'contratos',
      aggregation: 'sum',
      valueAttribute: 'contratos.saldo_devedor',
      groupByAttributes: [],
      filters: [{ attribute: 'contratos.projeto', op: 'in', value: 'filter.projetos' }],
    },
  });

  // Binding mapping projeto/saldo → real columns (migrated client).
  const binding = makeBinding({
    schemaBindings: {
      'contratos.projeto': 'cod_projeto',
      'contratos.saldo_devedor': 'saldo',
    },
  });

  it('emits IN UNNEST(@projetos) when projetos has values', () => {
    const pageFilters: Record<string, PageFilterValue> = {
      projetos: { kind: 'in', values: ['P1', 'P2'], attribute: 'contratos.projeto' },
    };
    const resolved = resolveMetric({ metric: baseMetric, binding, pageFilters });

    expect(resolved.sql).toContain('IN UNNEST(@projetos)');
    expect(resolved.sql).toContain('`cod_projeto`');
    expect(resolved.params.projetos).toEqual(['P1', 'P2']);
  });

  it('resolves to 1=1 (no-op) when projetos is empty', () => {
    const pageFilters: Record<string, PageFilterValue> = {
      projetos: { kind: 'in', values: [], attribute: 'contratos.projeto' },
    };
    const resolved = resolveMetric({ metric: baseMetric, binding, pageFilters });

    expect(resolved.sql).not.toContain('IN UNNEST');
    expect(resolved.sql).toContain('1=1');
    expect(resolved.params.projetos).toBeUndefined();
  });

  it('resolves to 1=1 (no-op) when the page filter is absent entirely', () => {
    const resolved = resolveMetric({ metric: baseMetric, binding, pageFilters: {} });
    expect(resolved.sql).toContain('1=1');
    expect(resolved.sql).not.toContain('IN UNNEST');
  });
});

describe('resolveMetric — A6 resolveColumn strictness', () => {
  it('throws for a migrated client (non-empty schemaBindings) when key is missing', () => {
    // schemaBindings is non-empty but does NOT map `contratos.saldo_devedor`.
    const binding = makeBinding({
      schemaBindings: { 'contratos.projeto': 'cod_projeto' },
    });
    expect(() => resolveMetric({ metric: aggMetric(), binding })).toThrow(
      MetricResolutionError,
    );
  });

  it('warns and falls back to attributeId for a legacy client (empty schemaBindings)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const binding = makeBinding({ schemaBindings: {} });

    const resolved = resolveMetric({ metric: aggMetric(), binding });

    // Fallback uses the attributeId (`saldo_devedor`) as the column name.
    expect(resolved.sql).toContain('`saldo_devedor`');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('uses the mapped column when the key IS present (migrated, mapped)', () => {
    const binding = makeBinding({
      schemaBindings: { 'contratos.saldo_devedor': 'saldo_real' },
    });
    const resolved = resolveMetric({ metric: aggMetric(), binding });
    expect(resolved.sql).toContain('`saldo_real`');
  });
});

describe('resolveMetric — tableBindings (entity → physical table)', () => {
  it('uses the mapped physical table when tableBindings maps the entity', () => {
    const binding = makeBinding({
      schemaBindings: { 'contratos.saldo_devedor': 'saldo' },
      tableBindings: { contratos: 'tb_contratos_v2' },
    });
    const resolved = resolveMetric({ metric: aggMetric(), binding });

    // FROM references the mapped physical table, not the entityId.
    expect(resolved.sql).toContain('`cliente_dataset.tb_contratos_v2`');
    expect(resolved.sql).not.toContain('`cliente_dataset.contratos`');
  });

  it('falls back to the entityId as tableId when tableBindings is absent', () => {
    const binding = makeBinding({
      schemaBindings: { 'contratos.saldo_devedor': 'saldo' },
    });
    const resolved = resolveMetric({ metric: aggMetric(), binding });

    // FROM references the entityId (`contratos`) verbatim — unchanged behavior.
    expect(resolved.sql).toContain('`cliente_dataset.contratos`');
    expect(resolved.sql).not.toContain('tb_contratos_v2');
  });
});

describe('resolveMetric — filtros ambiente (G9-C.1)', () => {
  const binding = makeBinding({
    schemaBindings: {
      'contratos.saldo_devedor': 'saldo',
      'contratos.rating_liquid': 'rating',
      'contratos.dias_atraso': 'dias',
    },
  });

  it('op:in com attribute bound → IN UNNEST e ANDa com o WHERE', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] }],
    });
    expect(resolved.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(resolved.sql).toContain('`rating`');
    expect(resolved.params.contratos_rating_liquid).toEqual(['A', 'B']);
  });

  it('op:numeric_buckets → (= OR BETWEEN OR >=) parametrizado', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{
        op: 'numeric_buckets',
        attribute: 'contratos.dias_atraso',
        buckets: [{ eq: 0 }, { min: 1, max: 30 }, { min: 181 }],
      }],
    });
    expect(resolved.sql).toMatch(/`dias` = @\w+ OR `dias` BETWEEN @\w+ AND @\w+ OR `dias` >= @\w+/);
  });

  it('attribute não bound (migrado sem a key) → pula, sem alterar o SQL', () => {
    const base = resolveMetric({ metric: aggMetric(), binding });
    const withFilter = resolveMetric({
      metric: aggMetric(),
      binding, // não mapeia contratos.elegibilidade
      ambientFilters: [{ op: 'in', attribute: 'contratos.elegibilidade', values: ['Elegivel'] }],
    });
    expect(withFilter.sql).toBe(base.sql);
  });

  it('attribute mapeado para null → pula', () => {
    const b = makeBinding({ schemaBindings: { 'contratos.saldo_devedor': 'saldo', 'contratos.rating_liquid': null } });
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding: b,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('attribute de outra entidade → pula', () => {
    const resolved = resolveMetric({
      metric: aggMetric(), // primaryEntity: contratos
      binding,
      ambientFilters: [{ op: 'in', attribute: 'pagamentos.tipo', values: ['X'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('values vazios → pula', () => {
    const resolved = resolveMetric({
      metric: aggMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: [] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });

  it('recipe sql ignora ambientFilters', () => {
    const sqlMetric = aggMetric({
      recipe: { kind: 'sql', template: 'SELECT 1 AS value FROM {contratos}' },
    });
    const resolved = resolveMetric({
      metric: sqlMetric,
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(resolved.sql).not.toContain('IN UNNEST');
  });
});

describe('resolveDerivedMetric — filtros ambiente (G9-C.2a)', () => {
  // Métrica derived ratio single-contract: tot/n sobre canonical.contratos.
  const ratioMetric = {
    id: 'play.inadimplencia',
    label: 'Inadimplência',
    requires: ['canonical.contratos.valor_atraso', 'canonical.contratos.saldo_devedor'],
    type: 'kpi',
    version: '1.0.0',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    recipe: {
      kind: 'derived',
      primaryEntity: 'canonical.contratos',
      joins: [],
      terms: [
        { id: 'tot', aggregation: 'sum', valueRef: 'canonical.contratos.valor_atraso' },
        { id: 'n', aggregation: 'sum', valueRef: 'canonical.contratos.saldo_devedor' },
      ],
      expression: 'tot / n',
      filters: [],
    },
  } as unknown as Metric;

  function bindings(over: Record<string, string | null> = {}): Record<string, ClientDatasetBinding> {
    return {
      canonical: {
        id: 'ds', dataSourceId: 'bq', datasetId: 'cliente_dataset', contractRef: 'canonical',
        schemaBindings: {
          'contratos.valor_atraso': 'va',
          'contratos.saldo_devedor': 'sd',
          'contratos.rating_liquid': 'rating',
          ...over,
        },
        schema: {}, isPrimary: true,
      },
    } as unknown as Record<string, ClientDatasetBinding>;
  }

  it('aplica ambient in quando a entidade está no escopo e bound', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings(),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(r.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(r.sql).toContain('`rating`');
  });

  it('pula ambient de entidade fora do escopo', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings(),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'pagamentos.tipo', values: ['X'] }],
    });
    expect(r.sql).not.toContain('IN UNNEST');
  });

  it('pula ambient com coluna não bound (mapeada null)', () => {
    const r = resolveDerivedMetric({
      metric: ratioMetric,
      bindingsByContract: bindings({ 'contratos.rating_liquid': null }),
      relations: [],
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }],
    });
    expect(r.sql).not.toContain('IN UNNEST');
  });
});

describe('resolveMetric — {ambient:entity} em recipe sql (G9-C.2a)', () => {
  const binding = makeBinding({
    schemaBindings: { 'contratos.rating_liquid': 'rating', 'contratos.saldo_devedor': 'sd' },
  });
  function sqlMetric() {
    return aggMetric({
      recipe: {
        kind: 'sql',
        template: 'SELECT SUM({contratos.saldo_devedor}) AS value FROM {contratos} WHERE TRUE AND {ambient:contratos}',
      },
    });
  }

  it('substitui {ambient:contratos} pela cláusula quando há filtro bound', () => {
    const r = resolveMetric({
      metric: sqlMetric(),
      binding,
      ambientFilters: [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] }],
    });
    expect(r.sql).toContain('IN UNNEST(@contratos_rating_liquid)');
    expect(r.sql).toContain('`rating`');
    expect(r.sql).not.toContain('{ambient');
    expect(r.sql).toContain('`cliente_dataset.contratos`');
    expect(r.sql).toContain('`sd`');
  });

  it('vira TRUE quando não há ambientFilters', () => {
    const r = resolveMetric({ metric: sqlMetric(), binding });
    expect(r.sql).toContain('AND TRUE');
    expect(r.sql).not.toContain('{ambient');
  });

  it('pula filtro não bound (vira TRUE se nenhum sobra)', () => {
    const r = resolveMetric({
      metric: sqlMetric(),
      binding, // não mapeia contratos.elegibilidade
      ambientFilters: [{ op: 'in', attribute: 'contratos.elegibilidade', values: ['Elegivel'] }],
    });
    expect(r.sql).toContain('AND TRUE');
    expect(r.sql).not.toContain('IN UNNEST');
  });
});
