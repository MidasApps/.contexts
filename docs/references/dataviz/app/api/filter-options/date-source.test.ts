import { describe, expect, it, vi } from 'vitest';
import { resolveDateSource } from './date-source';
import { parseClientDoc } from './parse-client-doc';

const binding = (datasetId: string, entities: Record<string, string[]>) => ({
  datasetId,
  dataSourceId: 'proj',
  tableBindings: Object.fromEntries(Object.keys(entities).map((entity) => [entity, entity])),
  schemaBindings: Object.fromEntries(
    Object.entries(entities).flatMap(([entity, columns]) => columns.map((column) => [`${entity}.${column}`, column])),
  ),
});

describe('resolveDateSource', () => {
  it('falls back to contratos/data_base_report/projeto without bindings', () => {
    const result = resolveDateSource(undefined, 'proj.ds');

    expect(result).toEqual({ table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' });
  });

  it('prefers contratos when the dataset binds it', () => {
    const client = {
      productBindings: [
        { datasets: [binding('vila_rosa_monitor', { contratos: ['data_base_report', 'projeto'], fluxo_caixa: ['data_base_report'] })] },
      ],
    };

    const result = resolveDateSource(client, 'proj.vila_rosa_monitor');

    expect(result).toEqual({ table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' });
  });

  it('uses the first snapshot entity of another domain and drops projeto when absent', () => {
    const client = {
      productBindings: [
        { datasets: [binding('imobiliaria_demo', { leads: ['data_criacao'], estoque_snapshot: ['data_base_report', 'unidade_id'] })] },
      ],
    };

    const result = resolveDateSource(client, 'proj.imobiliaria_demo');

    expect(result).toEqual({ table: 'estoque_snapshot', dateField: 'data_base_report', projectField: null });
  });

  // A table bound in another dataset may not exist in the requested one; querying
  // it there fails, while the legacy default is what worked before bindings.
  it('keeps the default when no binding covers the requested dataset', () => {
    const client = {
      productBindings: [
        { datasets: [binding('imobiliaria_demo', { estoque_snapshot: ['data_base_report'] })] },
      ],
    };

    const result = resolveDateSource(client, 'proj.legacy_monitor');

    expect(result).toEqual({ table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' });
  });

  it('honours renamed physical columns from the binding', () => {
    const client = {
      productBindings: [
        {
          datasets: [
            {
              datasetId: 'ds',
              dataSourceId: 'proj',
              tableBindings: { contratos: 'tb_contratos' },
              schemaBindings: { 'contratos.data_base_report': 'dt_base', 'contratos.projeto': 'nm_projeto' },
            },
          ],
        },
      ],
    };

    const result = resolveDateSource(client, 'ds');

    expect(result).toEqual({ table: 'tb_contratos', dateField: 'dt_base', projectField: 'nm_projeto' });
  });
});

describe('resolveDateSource on a parsed client document with null entries', () => {
  it('skips null products and bindings and selects the valid sibling', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = {
      productBindings: [null, { datasets: [null, binding('ds', { contratos: ['data_base_report'] })] }],
    };

    const result = resolveDateSource(parseClientDoc('date-source-nulls', raw), 'proj.ds');

    expect(result).toEqual({ table: 'contratos', dateField: 'data_base_report', projectField: null });
    warn.mockRestore();
  });

  it('falls back to the default when only null entries remain', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = resolveDateSource(parseClientDoc('date-source-only-nulls', { productBindings: [null, { datasets: [null] }] }), 'proj.ds');

    expect(result).toEqual({ table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' });
    warn.mockRestore();
  });
});
