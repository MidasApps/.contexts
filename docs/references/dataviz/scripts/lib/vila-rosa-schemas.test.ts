import { describe, expect, it } from 'vitest';
import {
  AUX_SCHEMA,
  COVENANTS_SCHEMA,
  MONITOR_SCHEMA,
  missingColumns,
  toTableFields,
} from './vila-rosa-schemas.mjs';

describe('vila-rosa-schemas', () => {
  it('declares the three monitor tables and the seven covenants entities', () => {
    expect(Object.keys(MONITOR_SCHEMA)).toEqual(['contratos', 'fluxo_caixa', 'pagamentos']);
    expect(Object.keys(COVENANTS_SCHEMA)).toHaveLength(7);
    expect(Object.keys(AUX_SCHEMA)).toEqual(['ba_bancos', 'ba_pluggy_categorias']);
  });

  it('has no duplicated column inside any table', () => {
    for (const schema of [MONITOR_SCHEMA, COVENANTS_SCHEMA, AUX_SCHEMA]) {
      for (const [table, columns] of Object.entries(schema)) {
        const names = columns.map(([name]) => name.toLowerCase());
        expect(new Set(names).size, `coluna duplicada em ${table}`).toBe(names.length);
      }
    }
  });

  it('converts pairs into nullable BigQuery table fields', () => {
    expect(toTableFields([['a', 'STRING'], ['b', 'INT64']])).toEqual([
      { name: 'a', type: 'STRING', mode: 'NULLABLE' },
      { name: 'b', type: 'INT64', mode: 'NULLABLE' },
    ]);
  });

  it('treats column names case-insensitively when computing missing columns', () => {
    const missing = missingColumns(
      ['Status_contrato', 'id_contrato'],
      [['status_contrato', 'STRING'], ['id_contrato', 'STRING'], ['saldo_devedor', 'FLOAT64']],
    );
    expect(missing).toEqual([['saldo_devedor', 'FLOAT64']]);
  });

  it('returns every expected column when the table is empty', () => {
    expect(missingColumns([], [['x', 'DATE']])).toEqual([['x', 'DATE']]);
  });
});
